# frozen_string_literal: true

require "spec_helper"
require "net/http"
require "socket"
require "tmpdir"
require "puma/plugin/universal_renderer"

RSpec.describe "Puma plugin :universal_renderer" do
  describe UniversalRenderer::PumaPlugin do
    it "falls back to the bin/web environment variables, then to the defaults" do
      env = { "SSR_BUNDLE" => "build/ssr.mjs", "SSR_HEALTH_FAILURES" => "5" }
      options = described_class.resolve({ port: 4000 }, env: env)

      expect(options).to include(
        runtime: "bun",
        bundle: "build/ssr.mjs",
        port: 4000,
        health_interval: 10.0,
        health_failures: 5,
        command: nil
      )
    end

    it "turns health checks off with SSR_WATCHDOG=0 or health_interval: false" do
      expect(described_class.resolve({}, env: { "SSR_WATCHDOG" => "0" })[:health_interval]).to be_nil
      expect(described_class.resolve({ health_interval: false }, env: {})[:health_interval]).to be_nil
    end

    it "rejects unknown options, so a typo does not silently fall back to a default" do
      expect { described_class.resolve({ bundel: "x" }, env: {}) }.to raise_error(ArgumentError, /bundel/)
    end
  end

  describe "in a clustered Puma" do
    let(:dir) { Dir.mktmpdir }
    let(:log_path) { File.join(dir, "puma.log") }
    let(:app_port) { free_port }
    let(:renderer_port) { free_port }
    let(:plugin_options) do
      "command: [#{RbConfig.ruby.inspect}, #{fake_renderer.inspect}], port: #{renderer_port}, health_interval: 0.2"
    end
    let(:fake_renderer) { File.expand_path("../fixtures/fake_renderer.rb", __dir__) }
    let(:puma_pid) do
      config = File.join(dir, "puma.rb")
      File.write(config, <<~RUBY)
        plugin :universal_renderer
        universal_renderer #{plugin_options}
        workers 1
        bind "tcp://127.0.0.1:#{app_port}"
        app { |_env| [200, {}, ["app"]] }
      RUBY
      # Boots from the gem root, like an app boots from its own: a hot restart
      # re-execs with `-rbundler/setup` in this directory, so it needs the Gemfile.
      Process.spawn(
        RbConfig.ruby,
        Gem.bin_path("puma", "puma"),
        "-C",
        config,
        chdir: File.expand_path("../..", __dir__),
        out: log_path,
        err: log_path
      )
    end

    after do
      begin
        Process.kill("KILL", puma_pid)
        Process.wait(puma_pid)
      rescue Errno::ESRCH, Errno::ECHILD
        nil
      end
      renderer_pids.each do |pid|
        Process.kill("KILL", pid)
      rescue Errno::ESRCH
        nil
      end
    end

    def free_port
      TCPServer.open("127.0.0.1", 0) { |server| server.addr[1] }
    end

    def puma_log
      File.exist?(log_path) ? File.read(log_path) : ""
    end

    def renderer_pids
      puma_log.scan(/renderer started \(pid=(\d+)/).flatten.map { |pid| Integer(pid) }
    end

    def get(port)
      Net::HTTP.get_response(URI("http://127.0.0.1:#{port}/health"))
    rescue StandardError
      nil
    end

    def wait_until(timeout: 15)
      deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + timeout
      until yield
        if Process.clock_gettime(Process::CLOCK_MONOTONIC) > deadline
          raise "condition not met within #{timeout}s. Puma log:\n#{puma_log}"
        end

        sleep 0.1
      end
    end

    def alive?(pid)
      Process.kill(0, pid)
      true
    rescue Errno::ESRCH
      false
    end

    it "starts one renderer for the cluster and stops it with Puma" do
      puma_pid
      wait_until { get(app_port)&.body == "app" && get(renderer_port).is_a?(Net::HTTPSuccess) }
      expect(renderer_pids.size).to eq(1)

      Process.kill("TERM", puma_pid)
      Process.wait(puma_pid)

      expect(alive?(renderer_pids.first)).to be(false)
      # Puma runs `after_stopped` in its signal handler. The renderer must stop
      # there, not only through the at_exit fallback.
      expect(puma_log).to include("stopping renderer pid=#{renderer_pids.first} (stopping)")
      expect(puma_log).not_to include("ThreadError")
    end

    it "replaces the renderer on a hot restart, without leaving the old one behind" do
      puma_pid
      wait_until { get(renderer_port).is_a?(Net::HTTPSuccess) }
      first_renderer = renderer_pids.first

      Process.kill("USR2", puma_pid)

      wait_until { renderer_pids.size == 2 && get(renderer_port).is_a?(Net::HTTPSuccess) }
      expect(alive?(first_renderer)).to be(false)
      expect(puma_log).not_to include("EADDRINUSE")
    end

    it "replaces the renderer on a phased restart, which keeps the same master" do
      puma_pid
      wait_until { get(renderer_port).is_a?(Net::HTTPSuccess) }
      first_renderer = renderer_pids.first

      Process.kill("USR1", puma_pid)

      wait_until { renderer_pids.size == 2 && get(renderer_port).is_a?(Net::HTTPSuccess) }
      expect(alive?(first_renderer)).to be(false)
      expect(puma_log.scan(/restarting in \d+s/)).to eq(["restarting in 1s"])
    end

    context "when the bundle has not been built" do
      let(:bundle) { File.join(dir, "ssr-build/server.mjs") }
      let(:plugin_options) { "bundle: #{bundle.inspect}, port: #{renderer_port}" }

      it "serves the app without a renderer" do
        puma_pid
        wait_until { get(app_port)&.body == "app" }

        expect(puma_log).to include("#{bundle} missing, serving client-rendered pages only")
        expect(renderer_pids).to be_empty
      end
    end
  end
end

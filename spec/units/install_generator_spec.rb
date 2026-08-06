# frozen_string_literal: true

require "rails_helper"
require "rails/generators"
require "generators/universal_renderer/install_generator"
require "fileutils"
require "open3"
require "tmpdir"

RSpec.describe UniversalRenderer::InstallGenerator do
  it "writes only the Ruby initializer when frontend scaffolding is skipped" do
    Dir.mktmpdir do |destination|
      described_class.start(["--skip-frontend"], destination_root: destination)

      expect(File).to exist(File.join(destination, "config/initializers/universal_renderer.rb"))
      expect(File).not_to exist(File.join(destination, "vite.config.ssr.mts"))
      expect(File).not_to exist(File.join(destination, "lib/tasks/ssr.rake"))
      expect(File).not_to exist(File.join(destination, "bin/web"))
    end
  end

  it "generates timeouts with the renderer finishing first" do
    Dir.mktmpdir do |destination|
      described_class.start([], destination_root: destination)

      initializer = File.read(File.join(destination, "config/initializers/universal_renderer.rb"))
      server = File.read(File.join(destination, "app/frontend/ssr/server.ts"))

      expect(initializer).to include("c.timeout = 3")
      expect(server).to include("renderTimeout: 2_500")
    end
  end

  it "stops the renderer and preserves the app server exit status" do
    Dir.mktmpdir do |destination|
      harness = build_web_harness(destination)
      _output, status =
        Open3.capture2e(
          harness.fetch(:env),
          "bash",
          harness.fetch(:web),
          chdir: destination
        )

      expect(status.exitstatus).to eq(7)
      expect { wait_for_file(harness.fetch(:stopped)) }.not_to raise_error
    ensure
      stop_process_recorded_in(harness[:pid]) if harness
    end
  end

  # A serialized renderer that wedges cannot recover on its own; `/health`
  # reporting 503 is the only signal, and this loop is what acts on it.
  it "restarts the renderer when it stops reporting healthy" do
    Dir.mktmpdir do |destination|
      harness = build_web_harness(destination, healthy: false)
      env = harness.fetch(:env).merge("SSR_HEALTH_INTERVAL" => "1",
                                      "SSR_HEALTH_FAILURES" => "1")

      web_pid =
        Process.spawn(
          env,
          "bash",
          harness.fetch(:web),
          chdir: destination,
          out: File::NULL,
          err: File::NULL
        )

      # One tick to notice, one grace period to stop the old process.
      wait_for_file(harness.fetch(:restarted), attempts: 120, interval: 0.1)
      expect(File).to exist(harness.fetch(:restarted))
    ensure
      if web_pid
        Process.kill("TERM", web_pid)
        Process.wait(web_pid)
      end
      stop_process_recorded_in(harness[:pid]) if harness
    end
  end

  def build_web_harness(destination, healthy: true)
    fake_bin = File.join(destination, "fake-bin")
    bundle = File.join(destination, "ssr-build/server.mjs")
    pid = File.join(destination, "renderer.pid")
    stopped = File.join(destination, "renderer.stopped")
    started = File.join(destination, "renderer.started")
    restarted = File.join(destination, "renderer.restarted")
    web = File.join(destination, "web")

    FileUtils.mkdir_p(fake_bin)
    FileUtils.mkdir_p(File.dirname(bundle))
    FileUtils.cp(web_template, web)
    File.write(bundle, "")
    write_executable(File.join(fake_bin, "bun"), fake_bun)
    write_executable(File.join(fake_bin, "bundle"), fake_bundle)
    write_executable(File.join(fake_bin, "curl"), fake_curl)
    FileUtils.chmod(0o755, web)

    {
      web: web,
      pid: pid,
      stopped: stopped,
      restarted: restarted,
      env: {
        "PATH" => "#{fake_bin}:#{ENV.fetch("PATH")}",
        "SSR_BUNDLE" => bundle,
        "SSR_TEST_PID" => pid,
        "SSR_TEST_STOPPED" => stopped,
        "SSR_TEST_STARTED" => started,
        "SSR_TEST_RESTARTED" => restarted,
        "SSR_TEST_HEALTHY" => healthy ? "1" : "0",
        # The app server has to outlive the health checks in the restart test.
        "SSR_TEST_APP_LIFETIME" => healthy ? "0.1" : "30"
      }
    }
  end

  def fake_curl
    <<~BASH
      #!/usr/bin/env bash
      [ "${SSR_TEST_HEALTHY:-1}" = "1" ] && exit 0
      exit 22
    BASH
  end

  def web_template
    File.expand_path(
      "../../lib/generators/universal_renderer/templates/web",
      __dir__
    )
  end

  def fake_bun
    <<~BASH
      #!/usr/bin/env bash
      echo $$ > "$SSR_TEST_PID"
      if [ -f "$SSR_TEST_STARTED" ]; then touch "$SSR_TEST_RESTARTED"; fi
      touch "$SSR_TEST_STARTED"
      trap 'touch "$SSR_TEST_STOPPED"; exit 0' TERM
      while true; do sleep 0.05; done
    BASH
  end

  def fake_bundle
    <<~BASH
      #!/usr/bin/env bash
      sleep "${SSR_TEST_APP_LIFETIME:-0.1}"
      exit 7
    BASH
  end

  def write_executable(path, contents)
    File.write(path, contents)
    FileUtils.chmod(0o755, path)
  end

  def wait_for_file(path, attempts: 100, interval: 0.01)
    attempts.times do
      return if File.exist?(path)

      sleep interval
    end

    raise "timed out waiting for #{path}"
  end

  def stop_process_recorded_in(path)
    return unless File.exist?(path)

    Process.kill("TERM", Integer(File.read(path)))
  rescue Errno::ESRCH
    nil
  end
end

# frozen_string_literal: true

require "spec_helper"
require "socket"
require "tmpdir"
require "universal_renderer/supervisor"

RSpec.describe UniversalRenderer::Supervisor do
  let(:fake_renderer) { File.expand_path("../fixtures/fake_renderer.rb", __dir__) }
  let(:port) { TCPServer.open("127.0.0.1", 0) { |server| server.addr[1] } }
  # Appended to from the supervisor's threads; Array#<< is atomic under the GVL.
  let(:logs) { [] }
  let(:mode) { "healthy" }
  let(:extra_env) { {} }
  let(:command) { [RbConfig.ruby, fake_renderer] }

  let(:supervisor) do
    described_class.new(
      command: command,
      port: port,
      env: { "FAKE_RENDERER_MODE" => mode }.merge(extra_env),
      health_interval: 0.2,
      health_failures: 2,
      stop_timeout: 1,
      logger: ->(message) { logs << message }
    )
  end

  after { supervisor.stop }

  def wait_until(timeout: 5)
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + timeout
    until yield
      if Process.clock_gettime(Process::CLOCK_MONOTONIC) > deadline
        raise "condition not met within #{timeout}s. Log:\n#{log_lines.join("\n")}"
      end

      sleep 0.05
    end
  end

  def log_lines
    logs.dup
  end

  def starts
    log_lines.grep(/renderer started/).size
  end

  def alive?(pid)
    Process.kill(0, pid)
    true
  rescue Errno::ESRCH
    false
  end

  def answering?
    Net::HTTP.get_response(URI("http://127.0.0.1:#{port}/health")).is_a?(Net::HTTPSuccess)
  rescue StandardError
    false
  end

  it "restarts the renderer after it exits" do
    supervisor.start
    wait_until { answering? }
    first_pid = supervisor.pid

    Process.kill("KILL", first_pid)

    wait_until { supervisor.pid && supervisor.pid != first_pid && answering? }
    expect(log_lines).to include(a_string_including("renderer pid=#{first_pid} exited", "restarting in 1s"))
    expect(starts).to eq(2)
  end

  context "when the renderer stops answering its health checks" do
    let(:mode) { "unhealthy" }

    it "replaces it" do
      supervisor.start
      wait_until { supervisor.pid }
      first_pid = supervisor.pid

      wait_until { supervisor.pid && supervisor.pid != first_pid }

      expect(log_lines).to include(a_string_including("stopping renderer pid=#{first_pid} (failed 2 health checks)"))
      expect(alive?(first_pid)).to be(false)
    end

    it "backs off while each replacement fails too, like a renderer that keeps crashing" do
      supervisor.start
      wait_until(timeout: 10) { log_lines.grep(/restarting in/).size >= 2 }

      expect(log_lines.grep(/restarting in/).first(2).map { |line| line[/in \d+s/] }).to eq(["in 1s", "in 2s"])
    end
  end

  context "when the renderer keeps failing to start" do
    let(:mode) { "crash" }

    it "waits longer before each restart" do
      supervisor.start
      wait_until { log_lines.grep(/restarting in/).size >= 2 }

      expect(log_lines.grep(/restarting in/).first(2).map { |line| line[/in \d+s/] }).to eq(["in 1s", "in 2s"])
    end

    it "starts nothing more once stopped during the wait" do
      supervisor.start
      wait_until { log_lines.any? { |line| line.include?("restarting in 1s") } }

      supervisor.stop
      sleep 1.3

      expect(starts).to eq(1)
    end
  end

  context "when the renderer has started processes of its own" do
    let(:mode) { "with_child" }
    let(:child_pid_file) { File.join(Dir.mktmpdir, "child.pid") }
    let(:extra_env) { { "FAKE_RENDERER_CHILD_PID" => child_pid_file } }

    it "stops all of them on stop and does not restart" do
      supervisor.start
      wait_until { answering? && File.exist?(child_pid_file) }
      renderer_pid = supervisor.pid
      child_pid = Integer(File.read(child_pid_file))

      supervisor.stop
      sleep 1.2

      expect(alive?(renderer_pid)).to be(false)
      wait_until(timeout: 2) { !alive?(child_pid) }
      expect(supervisor.pid).to be_nil
      expect(log_lines).to include(a_string_including("stopping renderer pid=#{renderer_pid} (stopping)"))
      expect(starts).to eq(1)
    end
  end

  context "when the renderer ignores TERM" do
    let(:mode) { "ignore_term" }

    it "kills it after the stop timeout" do
      supervisor.start
      wait_until { answering? }
      renderer_pid = supervisor.pid

      supervisor.stop

      expect(alive?(renderer_pid)).to be(false)
      expect(log_lines).to include(a_string_including("did not exit within 1s, killing it"))
    end
  end

  it "frees the port before restart returns, then starts a new renderer" do
    supervisor.start
    wait_until { answering? }
    first_pid = supervisor.pid

    supervisor.restart(reason: "deploy")

    expect(alive?(first_pid)).to be(false)
    expect(answering?).to be(false)
    wait_until { answering? }
    expect(supervisor.pid).not_to eq(first_pid)
  end

  context "when the runtime is not installed" do
    let(:command) { ["definitely-not-a-runtime", "server.mjs"] }

    it "logs the failure and keeps retrying" do
      supervisor.start
      wait_until { log_lines.grep(/could not start definitely-not-a-runtime/).size >= 2 }

      expect(log_lines).to include(a_string_including("renderer failed to start, restarting in 1s"))
    end
  end
end

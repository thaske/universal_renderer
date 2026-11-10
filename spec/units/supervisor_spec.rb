# frozen_string_literal: true

require "spec_helper"
require "socket"
require "tmpdir"
require "universal_renderer/supervisor"

RSpec.describe UniversalRenderer::Supervisor do
  let(:fake_renderer) { File.expand_path("../fixtures/fake_renderer.rb", __dir__) }
  let(:port) { TCPServer.open("127.0.0.1", 0) { |server| server.addr[1] } }
  let(:logs) { Queue.new }
  let(:events) { Queue.new }
  let(:mode) { "healthy" }
  let(:extra_env) { {} }

  let(:supervisor) do
    described_class.new(
      command: [RbConfig.ruby, fake_renderer],
      port: port,
      env: { "FAKE_RENDERER_MODE" => mode }.merge(extra_env),
      health_interval: 0.2,
      health_failures: 2,
      stop_timeout: 1,
      logger: ->(message) { logs << message },
      on_event: ->(name, details) { events << [name, details] }
    )
  end

  after { supervisor.stop }

  def wait_until(timeout: 5)
    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + timeout
    until yield
      raise "condition not met within #{timeout}s" if Process.clock_gettime(Process::CLOCK_MONOTONIC) > deadline

      sleep 0.05
    end
  end

  def drain(queue)
    Array.new(queue.size) { queue.pop }
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
    expect(drain(events).map(&:first)).to eq(%i[started exited started])
  end

  context "when the renderer stops answering its health checks" do
    let(:mode) { "unhealthy" }

    it "replaces it" do
      supervisor.start
      wait_until { supervisor.pid }
      first_pid = supervisor.pid

      wait_until { supervisor.pid && supervisor.pid != first_pid }

      expect(drain(events).map(&:first)).to include(:unhealthy, :stopped)
      expect(alive?(first_pid)).to be(false)
    end
  end

  context "when the renderer keeps failing to start" do
    let(:mode) { "crash" }

    it "waits longer before each restart" do
      supervisor.start
      sleep 2.5

      starts = drain(events).count { |name, _details| name == :started }
      expect(starts).to eq(2)
      expect(drain(logs).grep(/restarting in/).map { |line| line[/in \d+s/] }).to eq(["in 1s", "in 2s"])
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
      expect(drain(events).map(&:first)).to eq(%i[started stopped])
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
      expect(drain(logs)).to include(a_string_including("did not exit within 1s, killing it"))
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
    let(:supervisor) do
      described_class.new(
        command: "definitely-not-a-runtime server.mjs",
        port: port,
        health_interval: nil,
        logger: ->(message) { logs << message }
      )
    end

    it "logs the failure and keeps retrying" do
      supervisor.start
      sleep 1.3

      lines = drain(logs)
      expect(lines.grep(/could not start definitely-not-a-runtime/).size).to eq(2)
      expect(lines).to include(a_string_including("renderer failed to start, restarting in 1s"))
    end
  end
end

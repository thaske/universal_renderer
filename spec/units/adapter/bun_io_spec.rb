require "rails_helper"

RSpec.describe UniversalRenderer::Adapter::BunIo do
  let(:cli_script) { "app/frontend/ssr/ssr.ts" }
  let(:config_mock) { instance_double(UniversalRenderer::Configuration) }

  before do
    # Mock Rails.root
    allow(Rails).to receive(:root).and_return(Pathname.new("/fake/rails/root"))

    # Mock Rails.logger
    allow(Rails.logger).to receive(:info)
    allow(Rails.logger).to receive(:error)
    allow(Rails.logger).to receive(:warn)

    # Mock UniversalRenderer.config
    allow(UniversalRenderer).to receive(:config).and_return(config_mock)
    allow(config_mock).to receive(:bun_pool_size).and_return(2)
    allow(config_mock).to receive(:bun_timeout).and_return(3000)
    allow(config_mock).to receive(:bun_cli_script).and_return(cli_script)
  end

  describe "#initialize" do
    context "when CLI script exists" do
      before do
        # Mock File.exist? to return true for CLI script
        allow(File).to receive(:exist?).with(
          Pathname.new("/fake/rails/root").join(cli_script),
        ).and_return(true)

        # Mock ConnectionPool and StdioBunProcess
        allow(ConnectionPool).to receive(:new).and_return(double("pool"))
        allow(UniversalRenderer::StdioBunProcess).to receive(:new).and_return(
          double("process"),
        )
      end

      it "initializes successfully" do
        adapter = described_class.new
        expect(adapter).to be_a(described_class)
      end

      it "logs successful initialization" do
        expect(Rails.logger).to receive(:info).with(
          "Universal Renderer BunIo process pool (2) initialized",
        )

        described_class.new
      end
    end

    context "when CLI script does not exist" do
      before do
        allow(File).to receive(:exist?).with(
          Pathname.new("/fake/rails/root").join(cli_script),
        ).and_return(false)
      end

      it "logs error and does not create process pool" do
        expect(Rails.logger).to receive(:error).with(
          /BunIo CLI script not found/,
        )

        described_class.new
      end
    end
  end

  describe "#call" do
    let(:adapter) { described_class.new }
    let(:url) { "http://example.com/test" }
    let(:props) { { "component" => "TestComponent", "title" => "Test" } }

    context "when process pool is available" do
      let(:process_mock) { instance_double(UniversalRenderer::StdioBunProcess) }
      let(:pool_mock) { instance_double(ConnectionPool) }

      before do
        allow(File).to receive(:exist?).with(
          Pathname.new("/fake/rails/root").join(cli_script),
        ).and_return(true)

        allow(ConnectionPool).to receive(:new).and_return(pool_mock)
        allow(UniversalRenderer::StdioBunProcess).to receive(:new).and_return(
          process_mock,
        )
        allow(pool_mock).to receive(:with).and_yield(process_mock)
      end

      it "renders successfully and returns SSR::Response" do
        allow(process_mock).to receive(:render).with(url, props).and_return(
          {
            "head" => "<title>Test Page</title>",
            "body" => "<div>Test Component</div>",
            "body_attrs" => {
            },
          },
        )

        result = adapter.call(url, props)

        expect(result).to be_a(UniversalRenderer::SSR::Response)
        expect(result.body).to eq("<div>Test Component</div>")
        expect(result.head).to eq("<title>Test Page</title>")
        expect(result.body_attrs).to eq({})
      end

      it "handles rendering errors gracefully" do
        allow(process_mock).to receive(:render).and_raise(
          StandardError.new("Bun Error"),
        )

        expect(Rails.logger).to receive(:error).with(
          /BunIo SSR execution failed/,
        )

        result = adapter.call(url, props)
        expect(result).to be_nil
      end
    end

    context "when process pool is not available" do
      before do
        allow(File).to receive(:exist?).with(
          Pathname.new("/fake/rails/root").join(cli_script),
        ).and_return(false)
      end

      it "returns nil" do
        result = adapter.call(url, props)
        expect(result).to be_nil
      end
    end
  end

  describe "#stream" do
    let(:adapter) { described_class.new }

    it "does not support streaming and returns false" do
      expect(Rails.logger).to receive(:warn).with(
        /BunIo adapter does not support streaming/,
      )

      result = adapter.stream("url", {}, "template", double("response"))
      expect(result).to be false
    end
  end

  describe "#supports_streaming?" do
    let(:adapter) { described_class.new }

    it "returns false" do
      expect(adapter.supports_streaming?).to be false
    end
  end
end

RSpec.describe UniversalRenderer::StdioBunProcess do
  let(:cli_script) { "app/frontend/ssr/ssr.ts" }
  let(:stdin_mock) { instance_double(IO) }
  let(:stdout_mock) { instance_double(IO) }
  let(:stderr_mock) { instance_double(IO) }
  let(:wait_thr_mock) { instance_double(Process::Waiter, pid: 1234) }

  before do
    allow(Open3).to receive(:popen3).with("bun", cli_script).and_return(
      [stdin_mock, stdout_mock, stderr_mock, wait_thr_mock],
    )

    allow(stdin_mock).to receive(:puts)
    allow(stdin_mock).to receive(:flush)
    allow(stdout_mock).to receive(:readline)
    allow(stderr_mock).to receive(:close)
    allow(stdin_mock).to receive(:close)
    allow(stdout_mock).to receive(:close)
    allow(stdin_mock).to receive(:closed?).and_return(false)
    allow(stdout_mock).to receive(:closed?).and_return(false)
    allow(stderr_mock).to receive(:closed?).and_return(false)
  end

  describe "#initialize" do
    it "starts a Bun process with the CLI script" do
      expect(Open3).to receive(:popen3).with("bun", cli_script)
      described_class.new(cli_script)
    end
  end

  describe "#render" do
    let(:process) { described_class.new(cli_script) }
    let(:url) { "http://example.com/test" }
    let(:props) { { "title" => "Test" } }

    it "sends JSON payload and returns parsed JSON response" do
      expected_payload = JSON.generate({ url: url, props: props })
      expected_response =
        JSON.generate(
          {
            head: "<title>Test</title>",
            body: "<div>Test Component</div>",
            body_attrs: {
            },
          },
        )

      expect(stdin_mock).to receive(:puts).with(expected_payload)
      expect(stdin_mock).to receive(:flush)
      expect(stdout_mock).to receive(:readline).and_return(expected_response)

      result = process.render(url, props)
      expect(result).to eq(
        {
          "head" => "<title>Test</title>",
          "body" => "<div>Test Component</div>",
          "body_attrs" => {
          },
        },
      )
    end
  end

  describe "#alive?" do
    let(:process) { described_class.new(cli_script) }

    it "returns true when process is alive" do
      allow(wait_thr_mock).to receive(:alive?).and_return(true)
      expect(process.alive?).to be true
    end

    it "returns false when process is not alive" do
      allow(wait_thr_mock).to receive(:alive?).and_return(false)
      expect(process.alive?).to be false
    end
  end

  describe "#close" do
    let(:process) { described_class.new(cli_script) }

    it "closes all IO streams and terminates process" do
      allow(wait_thr_mock).to receive(:alive?).and_return(true)

      expect(stdin_mock).to receive(:close)
      expect(stdout_mock).to receive(:close)
      expect(stderr_mock).to receive(:close)
      expect(Process).to receive(:kill).with("TERM", 1234)

      process.close
    end
  end
end

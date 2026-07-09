# frozen_string_literal: true

RSpec.describe UniversalRenderer::AdapterFactory do
  let(:logger) do
    instance_double(Logger, error: nil, warn: nil, info: nil, debug: nil)
  end

  before do
    described_class.reset!
    allow(UniversalRenderer).to receive(:logger).and_return(logger)
    allow(UniversalRenderer).to receive(:log).and_yield(logger)
  end

  after { described_class.reset! }

  describe ".create_adapter" do
    context "when engine is :http" do
      before do
        allow(UniversalRenderer.config).to receive(:engine).and_return(:http)
      end

      it "returns an HTTP adapter" do
        adapter = described_class.create_adapter
        expect(adapter).to be_a(UniversalRenderer::Adapter::Http)
      end
    end

    context "when engine is :stdio" do
      before do
        # Mock Stdio configuration options
        allow(UniversalRenderer.config).to receive_messages(
          engine: :stdio,
          stdio_pool_size: 2,
          stdio_timeout: 3000,
          stdio_cli_script: "app/frontend/ssr/ssr.ts"
        )

        # Mock file existence for CLI script
        allow(File).to receive(:exist?).and_return(true)
        # Mock Rails.root
        allow(Rails).to receive(:root).and_return(
          Pathname.new("/mock/rails/root")
        )

        # Mock Stdio components to avoid actual process spawning
        allow(Open3).to receive(:popen3).and_return(
          [
            instance_double(IO),
            instance_double(IO),
            instance_double(IO),
            instance_double(Process::Waiter)
          ]
        )

        pool_mock = instance_double(ConnectionPool)
        allow(ConnectionPool).to receive(:new).and_return(pool_mock)
      end

      it "returns a Stdio adapter" do
        adapter = described_class.create_adapter
        expect(adapter).to be_a(UniversalRenderer::Adapter::Stdio)
      end
    end

    context "when engine is stdio" do
      before do
        allow(UniversalRenderer.config).to receive_messages(
          engine: :stdio,
          stdio_pool_size: 2,
          stdio_timeout: 3000,
          stdio_cli_script: "app/frontend/ssr/ssr.ts"
        )
        allow(File).to receive(:exist?).and_return(true)
        allow(Rails).to receive(:root).and_return(
          Pathname.new("/mock/rails/root")
        )
        pool_mock = instance_double(ConnectionPool)
        allow(ConnectionPool).to receive(:new).and_return(pool_mock)
      end

      it "returns a Stdio adapter" do
        adapter = described_class.create_adapter
        expect(adapter).to be_a(UniversalRenderer::Adapter::Stdio)
      end
    end

    context "when engine is unknown" do
      before do
        allow(UniversalRenderer.config).to receive(:engine).and_return(:unknown)
      end

      it "logs a warning and returns HTTP adapter" do
        expect(logger).to receive(:warn).with(/Unknown SSR engine/)
        adapter = described_class.create_adapter
        expect(adapter).to be_a(UniversalRenderer::Adapter::Http)
      end
    end
  end

  describe ".adapter" do
    before do
      allow(UniversalRenderer.config).to receive(:engine).and_return(:http)
    end

    it "returns a singleton instance" do
      adapter1 = described_class.adapter
      adapter2 = described_class.adapter
      expect(adapter1).to be(adapter2)
    end
  end

  describe ".reset!" do
    before do
      allow(UniversalRenderer.config).to receive(:engine).and_return(:http)
    end

    it "clears the cached adapter" do
      adapter1 = described_class.adapter
      described_class.reset!
      adapter2 = described_class.adapter
      expect(adapter1).not_to be(adapter2)
    end
  end
end

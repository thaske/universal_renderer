# frozen_string_literal: true

RSpec.describe UniversalRenderer::AdapterFactory do
  let(:logger) do
    instance_double(Logger, error: nil, warn: nil, info: nil, debug: nil)
  end

  before do
    described_class.reset!
    allow(Rails).to receive(:logger).and_return(logger)
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

    context "when engine is :mini_racer" do
      before do
        allow(UniversalRenderer.config).to receive(:engine).and_return(
          :mini_racer
        )
        # Mock file existence for bundle
        allow(File).to receive(:exist?).and_return(true)
        allow(File).to receive(:read).and_return(
          "globalThis.UniversalSSR = { render: function() {} }"
        )
        # Mock Rails.root
        allow(Rails).to receive(:root).and_return(
          Pathname.new("/mock/rails/root")
        )

        # Mock MiniRacer components to avoid actual V8 initialization
        allow(MiniRacer::Platform).to receive(:set_flags!)

        snapshot_mock = instance_double(MiniRacer::Snapshot)
        allow(MiniRacer::Snapshot).to receive(:new).and_return(snapshot_mock)
        allow(snapshot_mock).to receive(:warmup!)

        context_mock = instance_double(MiniRacer::Context)
        allow(MiniRacer::Context).to receive(:new).and_return(context_mock)

        pool_mock = instance_double(ConnectionPool)
        allow(ConnectionPool).to receive(:new).and_return(pool_mock)
      end

      it "returns a MiniRacer adapter" do
        adapter = described_class.create_adapter
        expect(adapter).to be_a(UniversalRenderer::Adapter::MiniRacer)
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

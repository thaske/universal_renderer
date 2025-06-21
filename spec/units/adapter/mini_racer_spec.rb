# frozen_string_literal: true

RSpec.describe UniversalRenderer::Adapter::MiniRacer do
  let(:logger) do
    instance_double(Logger, error: nil, warn: nil, info: nil, debug: nil)
  end
  let(:adapter) { described_class.new }

  before do
    # Mock Rails.root and file operations
    allow(Rails).to receive(:root).and_return(Pathname.new("/mock/rails/root"))
    allow(Rails).to receive(:logger).and_return(logger)
  end

  describe "#initialize" do
    context "when bundle file exists" do
      before do
        allow(File).to receive(:exist?).and_return(true)
        allow(File).to receive(:read).and_return("// mock bundle content")

        # Mock MiniRacer components
        allow(MiniRacer::Platform).to receive(:set_flags!)
        snapshot_mock = instance_double(MiniRacer::Snapshot)
        allow(MiniRacer::Snapshot).to receive(:new).and_return(snapshot_mock)
        allow(snapshot_mock).to receive(:warmup!)

        context_mock = instance_double(MiniRacer::Context)
        allow(MiniRacer::Context).to receive(:new).and_return(context_mock)

        pool_mock = instance_double(ConnectionPool)
        allow(ConnectionPool).to receive(:new).and_return(pool_mock)
      end

      it "initializes successfully" do
        expect { adapter }.not_to raise_error
      end
    end

    context "when bundle file is missing" do
      before { allow(File).to receive(:exist?).and_return(false) }

      it "logs an error and continues" do
        expect(logger).to receive(:error).with(/bundle not found/)
        adapter
      end
    end
  end

  describe "#call" do
    let(:url) { "http://example.com" }
    let(:props) { { "component" => "App", "data" => "test" } }

    context "when context pool is available" do
      let(:context_mock) { instance_double(MiniRacer::Context) }
      let(:pool_mock) { instance_double(ConnectionPool) }

      before do
        allow(File).to receive(:exist?).and_return(true)
        allow(File).to receive(:read).and_return("// mock bundle")
        allow(MiniRacer::Platform).to receive(:set_flags!)
        allow(MiniRacer::Snapshot).to receive(:new).and_return(
          instance_double(MiniRacer::Snapshot, warmup!: nil)
        )
        allow(MiniRacer::Context).to receive(:new).and_return(context_mock)
        allow(ConnectionPool).to receive(:new).and_return(pool_mock)

        # Set the instance variable directly to bypass initialization
        adapter.instance_variable_set(:@context_pool, pool_mock)
      end

      context "when JavaScript execution succeeds" do
        before do
          js_result = {
            "head" => "<title>Test</title>",
            "body" => "<div>Hello World</div>",
            "bodyAttrs" => {
              "class" => "test"
            }
          }

          allow(pool_mock).to receive(:with).and_yield(context_mock)
          allow(context_mock).to receive(:call).with(
            "UniversalSSR.render",
            "App",
            props,
            url
          ).and_return(js_result)
        end

        it "returns an SSR response" do
          result = adapter.call(url, props)

          expect(result).to be_a(UniversalRenderer::SSR::Response)
          expect(result.head).to eq("<title>Test</title>")
          expect(result.body).to eq("<div>Hello World</div>")
          expect(result.body_attrs).to eq({ "class" => "test" })
        end
      end

      context "when JavaScript execution fails" do
        before do
          allow(pool_mock).to receive(:with).and_yield(context_mock)
          allow(context_mock).to receive(:call).and_raise(
            MiniRacer::RuntimeError.new("JS Error")
          )
        end

        it "logs error and returns nil" do
          expect(logger).to receive(:error).with(
            /MiniRacer SSR execution failed/
          )
          result = adapter.call(url, props)
          expect(result).to be_nil
        end
      end
    end

    context "when context pool is not available" do
      before { allow(File).to receive(:exist?).and_return(false) }

      it "returns nil" do
        result = adapter.call(url, props)
        expect(result).to be_nil
      end
    end
  end

  describe "#stream" do
    it "returns false and logs warning" do
      expect(logger).to receive(:warn).with(/does not support streaming/)
      result = adapter.stream("url", {}, "template", double)
      expect(result).to be(false)
    end
  end

  describe "#supports_streaming?" do
    it "returns false" do
      expect(adapter.supports_streaming?).to be(false)
    end
  end
end

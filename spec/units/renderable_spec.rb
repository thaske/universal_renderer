# frozen_string_literal: true

require_relative "../support/fake_controller"

RSpec.describe UniversalRenderer::Renderable do
  let(:controller_class) do
    Class.new(FakeController::Base).tap { |klass| klass.include(described_class) }
  end
  let(:controller) { controller_class.new }
  let(:payload) do
    UniversalRenderer::SSR::Response.new(head: "<title>x</title>", body: "<div></div>")
  end

  before { UniversalRenderer.config.url = "http://ssr.test" }

  after { UniversalRenderer.config = UniversalRenderer::Configuration.new }

  describe "props" do
    it "lazily initializes and exposes the props hash publicly" do
      expect(controller.ssr_props).to eq({})

      controller.add_prop(:theme, "dark")
      controller.add_prop({ locale: "en" })
      controller.push_prop(:tags, %w[a b])

      expect(controller.ssr_props).to eq(
        "theme" => "dark",
        "locale" => "en",
        "tags" => %w[a b]
      )
    end

    it "accumulates react query entries under the documented wire shape" do
      controller.add_query_data(%w[users 1], { "name" => "Ada" })
      controller.add_query_data(:flags, [1, 2])

      expect(controller.ssr_props["react_query"]).to eq(
        [
          { "query_key" => %w[users 1], "data" => { "name" => "Ada" } },
          { "query_key" => ["flags"], "data" => [1, 2] }
        ]
      )
    end
  end

  describe "#render_ssr" do
    it "fetches once and memoizes, exposing the result through ssr?" do
      expect(UniversalRenderer::Client::Base).to receive(:call)
        .once
        .with("https://example.test/page", { "a" => 1 })
        .and_return(payload)

      expect(controller.ssr?).to be(false)

      expect(controller.render_ssr(a: 1)).to eq(payload)
      expect(controller.render_ssr).to eq(payload)

      expect(controller.ssr?).to be(true)
      expect(controller.ssr_response).to eq(payload)
    end

    it "does not retry after a failure, and stays falsy" do
      expect(UniversalRenderer::Client::Base).to receive(:call).once.and_return(nil)

      expect(controller.render_ssr).to be_nil
      expect(controller.render_ssr).to be_nil
      expect(controller.ssr?).to be(false)
    end

    it "works without enable_ssr, so an action can decide for itself" do
      allow(UniversalRenderer::Client::Base).to receive(:call).and_return(payload)

      expect(controller_class.ssr_enabled).to be(false)
      expect(controller.render_ssr).to eq(payload)
    end

    it "ignores props passed after the render has happened" do
      allow(UniversalRenderer::Client::Base).to receive(:call).and_return(payload)

      controller.render_ssr(a: 1)
      controller.render_ssr(b: 2)

      expect(controller.ssr_props).to eq("a" => 1)
    end
  end

  describe "conditional enable_ssr" do
    before { allow(UniversalRenderer::Client::Base).to receive(:call).and_return(payload) }

    def enable(**options)
      controller_class.enable_ssr(options)
      controller_class.new
    end

    it "renders when no conditions are given" do
      expect(enable.render).to eq(:rendered)
      expect(UniversalRenderer::Client::Base).to have_received(:call).once
    end

    it "honours only" do
      controller = enable(only: :index)

      controller.render
      expect(UniversalRenderer::Client::Base).not_to have_received(:call)

      controller.action_name = "index"
      controller.render
      expect(UniversalRenderer::Client::Base).to have_received(:call).once
    end

    it "honours except" do
      enable(except: %i[show]).render

      expect(UniversalRenderer::Client::Base).not_to have_received(:call)
    end

    it "honours a proc unless, evaluated against the controller" do
      controller = enable(unless: -> { current_user.present? })

      controller.current_user = Object.new
      controller.render
      expect(UniversalRenderer::Client::Base).not_to have_received(:call)

      controller.current_user = nil
      controller.render
      expect(UniversalRenderer::Client::Base).to have_received(:call).once
    end

    it "honours a symbol if" do
      controller_class.define_method(:public_page?) { true }
      enable(if: :public_page?).render

      expect(UniversalRenderer::Client::Base).to have_received(:call).once
    end

    it "raises on a condition it cannot evaluate rather than skipping silently" do
      expect { enable(if: 42).render }.to raise_error(
        ArgumentError,
        /Symbol, String, or Proc/
      )
    end
  end
end

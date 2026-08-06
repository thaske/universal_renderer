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

    # A fresh instance per call, because the decision is memoized per request and
    # a real controller instance serves exactly one. Two simulated requests need
    # two instances.
    def enable(**options)
      controller_class.enable_ssr(options)
      controller_class.new
    end

    it "renders when no conditions are given" do
      expect(enable.render).to eq(:rendered)
      expect(UniversalRenderer::Client::Base).to have_received(:call).once
    end

    it "honours only" do
      enable(only: :index).render
      expect(UniversalRenderer::Client::Base).not_to have_received(:call)

      allowed = enable(only: :index)
      allowed.action_name = "index"
      allowed.render
      expect(UniversalRenderer::Client::Base).to have_received(:call).once
    end

    it "honours except" do
      enable(except: %i[show]).render

      expect(UniversalRenderer::Client::Base).not_to have_received(:call)
    end

    it "honours a proc unless, evaluated against the controller" do
      signed_in = enable(unless: -> { current_user.present? })
      signed_in.current_user = Object.new
      signed_in.render
      expect(UniversalRenderer::Client::Base).not_to have_received(:call)

      anonymous = enable(unless: -> { current_user.present? })
      anonymous.render
      expect(UniversalRenderer::Client::Base).to have_received(:call).once
    end

    # The layout asks the same question through `ssr_streaming?`, and the answer
    # has to match the one `render` acted on. Deriving it twice would evaluate a
    # caller-supplied predicate twice.
    it "evaluates a condition once per request" do
      calls = 0
      controller = enable(if: -> { calls += 1 })

      controller.render
      controller.ssr?
      controller.ssr_streaming?

      expect(calls).to eq(1)
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

    # `render json:` inside an HTML-format request would otherwise pay a full
    # blocking round trip whose result is thrown away.
    it "skips renders that are not a page" do
      controller = enable

      controller.render(json: { ok: true })
      controller.render(plain: "ok")
      controller.render(nothing: true)

      expect(UniversalRenderer::Client::Base).not_to have_received(:call)

      controller.render(:show)
      expect(UniversalRenderer::Client::Base).to have_received(:call).once
    end

    # A Turbo Frame or Stream response is rendered from an HTML action, so it
    # meets every other condition, and it never reaches the layout that would
    # emit the payload. On a serialized renderer it also takes a slot that real
    # page loads queue behind.
    it "skips partials and layout-less renders, which never reach the helpers" do
      controller = enable

      controller.render(partial: "rows", locals: { a: 1 })
      controller.render("show", layout: false)

      expect(UniversalRenderer::Client::Base).not_to have_received(:call)
    end
  end

  describe "streaming" do
    # Set directly rather than via `enable_ssr(streaming: true)`: that mixes in
    # ActionController::Live, which needs a real controller stack.
    let(:controller) do
      controller_class.ssr_enabled = true
      controller_class.ssr_streaming_preference = true
      controller_class.new
    end

    it "downgrades ssr_streaming? when the stream fails, so the fallback page has no placeholders" do
      allow(UniversalRenderer::Client::Stream).to receive(:call).and_return(false)

      expect(controller.ssr_streaming?).to be(true)
      expect(controller.render).to eq(:rendered)
      expect(controller.ssr_streaming?).to be(false)
    end

    # `enable_ssr streaming: true, only: :show` streams `show` and nothing else,
    # so every other action must report false — otherwise the layout emits the
    # streaming placeholders into a page no renderer will ever see.
    it "reports neither streaming nor ssr? on an action the conditions exclude" do
      controller_class.ssr_conditions = { only: :index }

      expect(controller.ssr_streaming?).to be(false)
      expect(controller.ssr?).to be(false)
    end

    # A streaming page has no response object, but it is still server-rendered.
    # Layouts pick their entry point with `ssr?`, so reporting false here shipped
    # the client-render bundle into a server-rendered document.
    it "reports ssr? while streaming, and stops once a failed stream downgrades" do
      allow(UniversalRenderer::Client::Stream).to receive(:call).and_return(false)

      expect(controller.ssr?).to be(true)

      controller.render

      expect(controller.ssr?).to be(false)
    end
  end
end

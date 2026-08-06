# frozen_string_literal: true

require "action_view"

RSpec.describe UniversalRenderer::SSR::Helpers do
  let(:view) do
    Class
      .new(ActionView::Base) do
        include ActionView::Helpers::SanitizeHelper
        include ActionView::Helpers::TagHelper
        include UniversalRenderer::SSR::Helpers

        attr_accessor :ssr_response, :ssr_streaming

        def ssr_streaming?
          ssr_streaming
        end

        def ssr?
          ssr_response.present?
        end
      end
      .new(ActionView::LookupContext.new([]), {}, nil)
  end

  let(:response) do
    UniversalRenderer::SSR::Response.new(
      head: "<title>Hi</title>",
      body: "<div id=\"app\">Hi</div>",
      body_attrs: { "class" => "dark", "data-page" => "home" },
      payload: { "queryCache" => { "queries" => [] } }
    )
  end

  after { UniversalRenderer.config = UniversalRenderer::Configuration.new }

  context "with no SSR response" do
    before { view.ssr_response = nil }

    it "emits nothing rather than failing" do
      expect(view.ssr_head).to eq("")
      expect(view.ssr_body).to eq("")
      expect(view.ssr_body_attributes).to eq("")
      expect(view.ssr_payload).to be_nil
    end
  end

  context "with an SSR response" do
    before { view.ssr_response = response }

    it "emits the head and body" do
      expect(view.ssr_head).to include("<title>Hi</title>")
      expect(view.ssr_body).to include("id=\"app\"")
    end

    it "emits body attributes ready to interpolate into the tag" do
      expect(view.ssr_body_attributes).to eq('class="dark" data-page="home"')
    end

    it "emits the payload as an inert JSON script tag" do
      expect(view.ssr_payload).to eq(
        '<script id="ssr-payload" type="application/json">' \
          '{"queryCache":{"queries":[]}}</script>'
      )
    end

    it "escapes the payload so content cannot break out of the script tag" do
      view.ssr_response =
        UniversalRenderer::SSR::Response.new(payload: { "x" => "</script><img>" })

      expect(view.ssr_payload).not_to include("</script><img>")
      expect(view.ssr_payload).to include("\\u003c/script")
    end

    it "sanitizes by default" do
      view.ssr_response =
        UniversalRenderer::SSR::Response.new(body: "<div onclick=\"steal()\">x</div>")

      expect(view.ssr_body).to eq("<div>x</div>")
    end

    it "skips sanitization when it is turned off" do
      UniversalRenderer.config.sanitize = false
      view.ssr_response =
        UniversalRenderer::SSR::Response.new(body: "<div onclick=\"trusted()\">x</div>")

      expect(view.ssr_body).to eq("<div onclick=\"trusted()\">x</div>")
    end

    it "uses a custom scrubber when one is configured" do
      strip_divs =
        Class.new(Loofah::Scrubber) do
          def scrub(node)
            node.remove if node.element? && node.name == "div"
            Loofah::Scrubber::CONTINUE
          end
        end

      UniversalRenderer.config.scrubber = strip_divs.new
      view.ssr_response = UniversalRenderer::SSR::Response.new(body: "<p>keep</p><div>go</div>")

      expect(view.ssr_body).to eq("<p>keep</p>")
    end
  end

  context "while streaming" do
    before do
      view.ssr_streaming = true
      view.ssr_response = nil
    end

    it "emits the placeholders the SSR service substitutes into" do
      expect(view.ssr_head).to eq(UniversalRenderer::SSR::Placeholders::HEAD)
      expect(view.ssr_body).to eq(UniversalRenderer::SSR::Placeholders::BODY)
    end
  end
end

# frozen_string_literal: true

require "rails_helper"

# Exercises the real stdin/stdout pipe protocol against a live Bun child,
# unlike the unit specs which stub the process. Covers the framing concerns
# that only show up on a real pipe: chunked reads, multibyte splits, and
# stray stdout writes from app code.
RSpec.describe UniversalRenderer::Adapter::Stdio::StdioProcess do
  subject(:process) { described_class.new(fixture, timeout_ms: 15_000) }

  let(:fixture) { File.expand_path("../fixtures/stdio_renderer.ts", __dir__) }

  before do
    skip "bun is not installed" unless system("which bun > /dev/null 2>&1")
  end

  after { process.close if defined?(process) }

  it "round-trips consecutive renders without desyncing despite stray console.log noise" do
    first = process.render("http://example.com/a", { "content" => "alpha" })
    second = process.render("http://example.com/b", { "content" => "beta" })

    expect(first).to include(
      "head" => "<title>fixture</title>",
      "body" => "<div>alpha</div>",
      "body_attrs" => { "data-echo" => "yes" }
    )
    expect(second["body"]).to eq("<div>beta</div>")
  end

  it "survives multibyte payloads larger than a single pipe read" do
    content = "héllo wörld – 世界 " * 20_000
    result = process.render("http://example.com/big", { "content" => content })

    expect(result["body"]).to eq("<div>#{content}</div>")
  end

  it "reports child render errors in-band instead of timing out" do
    result = process.render("http://example.com/fail", { "fail" => true })

    expect(result["error"]).to eq("intentional failure")
    expect(result["body"]).to eq("")
  end

  describe "#render_stream" do
    let(:template) do
      "<html><head><!-- SSR_HEAD --></head>" \
        "<body><!-- SSR_BODY --></body></html>"
    end

    it "streams template head, rendered chunks, and tail in order" do
      chunks = []
      result =
        process.render_stream(
          "http://example.com/stream",
          { "content" => "streamed content" },
          template
        ) { |chunk| chunks << chunk }

      html = chunks.join
      expect(result).to be(true)
      expect(chunks.length).to be >= 2
      expect(html).to start_with("<html><head><title>stream-fixture</title>")
      expect(html).to include("streamed content")
      expect(html).to end_with("</body></html>")
    end

    it "raises RenderError when the shell fails, leaving the process usable" do
      chunks = []
      expect do
        process.render_stream(
          "http://example.com/stream-fail",
          { "stream_fail" => true },
          template
        ) { |chunk| chunks << chunk }
      end.to raise_error(described_class::RenderError, /intentional stream failure/)
      expect(chunks).to be_empty

      # The error frame is terminal, so the pipe is still synchronized.
      result = process.render("http://example.com/after", { "content" => "ok" })
      expect(result["body"]).to eq("<div>ok</div>")
    end

    it "raises RenderError when the template lacks the body marker" do
      chunks = []
      expect do
        process.render_stream("http://example.com/x", {}, "<html></html>") do |chunk|
          chunks << chunk
        end
      end.to raise_error(described_class::RenderError, /SSR_BODY/)
      expect(chunks).to be_empty
    end

    it "interleaves streaming and static renders without desyncing" do
      stream_html = []
      process.render_stream(
        "http://example.com/a",
        { "content" => "first stream" },
        template
      ) { |chunk| stream_html << chunk }

      static_result = process.render("http://example.com/b", { "content" => "static" })

      second_stream = []
      process.render_stream(
        "http://example.com/c",
        { "content" => "second stream" },
        template
      ) { |chunk| second_stream << chunk }

      expect(stream_html.join).to include("first stream")
      expect(static_result["body"]).to eq("<div>static</div>")
      expect(second_stream.join).to include("second stream")
    end
  end
end

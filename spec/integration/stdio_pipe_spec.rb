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
end

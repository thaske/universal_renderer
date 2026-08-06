# frozen_string_literal: true

require "rails_helper"

RSpec.describe UniversalRenderer::SSR::Scrubber do
  let(:view_class) do
    Class.new { include ActionView::Helpers::SanitizeHelper }
  end
  let(:view) { view_class.new }

  def sanitize(html)
    view.sanitize(html, scrubber: described_class.new)
  end

  it "removes executable elements and embedded documents" do
    html = <<~HTML
      <script>alert(1)</script>
      <iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>
      <object data="https://example.test/payload"></object>
      <svg><animate attributeName="href" values="javascript:alert(1)"></animate></svg>
      <div>safe</div>
    HTML

    result = sanitize(html)

    expect(result).to include("<div>safe</div>")
    expect(result).not_to include("script", "iframe", "object", "animate")
  end

  it "preserves non-executable JSON and JSON-LD data scripts for hydration" do
    html = <<~HTML
      <script id="state" type="application/json">{"x":1}</script>
      <script type="application/ld+json">{"@type":"Person"}</script>
      <script>alert(1)</script>
      <script type="text/javascript">alert(1)</script>
    HTML

    result = sanitize(html)

    expect(result).to include('id="state" type="application/json"')
    expect(result).to include('type="application/ld+json"')
    expect(result).not_to include("alert(1)")
  end

  # The JSON allowance is an allowlist keyed on `type`, so the types that must
  # stay out of it deserve an explicit test rather than passing by construction.
  # `importmap` and `speculationrules` are the ones that matter: they are not
  # JavaScript MIME types, so a laxer rule than exact matching would admit them,
  # and both change how the page loads code.
  it "keeps blocking script types that are not inert data blocks" do
    html = <<~HTML
      <script type="module">alert("module")</script>
      <script type="importmap">{"imports":{"x":"/evil.js"}}</script>
      <script type="speculationrules">{"prerender":[{"urls":["/x"]}]}</script>
      <script type="application/javascript">alert("mime")</script>
      <script type="">alert("empty")</script>
    HTML

    result = sanitize(html)

    expect(result).not_to include("<script")
    expect(result).not_to include("alert(")
    expect(result).not_to include("imports")
    expect(result).not_to include("prerender")
  end

  it "checks the first srcset candidate but not the rest (known limitation)" do
    expect(sanitize(%(<img srcset="javascript:alert(1) 1x">))).not_to include(
      "javascript"
    )

    # srcset is a comma-separated candidate list, but every URI check anchors at
    # the start of the attribute value, so an approved first candidate carries
    # whatever follows it. This is not exploitable — srcset candidates are
    # fetched as images, and neither `javascript:` nor `data:text/html` is a
    # fetchable image source — but it means the sanitizer's guarantee is weaker
    # than it reads for this one attribute, so pin it as a decision rather than a
    # surprise.
    #
    # A real fix has to parse candidates rather than split on commas, because
    # data URIs legitimately contain them (`data:image/svg+xml,<svg/>`).
    carried = sanitize(
      %(<img srcset="data:image/svg+xml;base64,PHN2Zy8+ 1x, javascript:alert(1) 2x">)
    )

    expect(carried).to include("javascript:alert(1)")
  end

  it "removes event handlers from every element, including head elements" do
    html = <<~HTML
      <style onload="alert(1)">body { color: red }</style>
      <link rel="stylesheet" href="/app.css" onload="alert(1)">
      <meta name="description" content="safe" onmouseover="alert(1)">
      <div onclick="alert(1)">safe</div>
    HTML

    result = sanitize(html)

    expect(result).to include("<style>body { color: red }</style>")
    expect(result).to include('rel="stylesheet" href="/app.css"')
    expect(result).to include('name="description" content="safe"')
    expect(result).not_to include("onload", "onmouseover", "onclick")
  end

  it "removes dangerous URL protocols and meta refresh redirects" do
    html = <<~HTML
      <a href="  javascript:alert(1)">link</a>
      <a href="data:image/svg+xml,&lt;svg/&gt;">svg document</a>
      <img src="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;">
      <form action="vbscript:alert(1)"></form>
      <meta http-equiv="refresh" content="0;url=https://evil.test">
    HTML

    result = sanitize(html)

    expect(result).to include("<a>link</a>", "<img>", "<form></form>")
    expect(result).not_to include("javascript", "vbscript", "data:", "refresh")
  end

  it "keeps inline SVG data URIs on images, where browsers cannot execute them" do
    html = <<~HTML
      <img src="data:image/svg+xml,%3csvg%3e%3c/svg%3e" alt="logo">
      <img srcset="data:image/svg+xml;base64,PHN2Zy8+ 1x" alt="logo 2x">
    HTML

    result = sanitize(html)

    expect(result).to include('src="data:image/svg+xml,%3csvg%3e%3c/svg%3e"')
    expect(result).to include("srcset=\"data:image/svg+xml;base64,PHN2Zy8+ 1x\"")
  end

  it "preserves hydration attributes and safe URLs" do
    html = <<~HTML
      <main id="root" class="app" data-page="home" aria-live="polite">
        <a href="https://example.test/docs/javascript:guide">Protocol guide</a>
        <a href="https://example.test/?example=data:text/html">Data URL guide</a>
        <img src="https://example.test/image.png" alt="Example">
      </main>
    HTML

    expect(sanitize(html).strip).to eq(html.strip)
  end
end

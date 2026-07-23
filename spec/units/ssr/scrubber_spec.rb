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
      <img src="data:image/svg+xml,&lt;svg onload='alert(1)'/&gt;">
      <form action="vbscript:alert(1)"></form>
      <meta http-equiv="refresh" content="0;url=https://evil.test">
    HTML

    result = sanitize(html)

    expect(result).to include("<a>link</a>", "<img>", "<form></form>")
    expect(result).not_to include("javascript", "vbscript", "data:", "refresh")
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

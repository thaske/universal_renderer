# frozen_string_literal: true

require "rails_helper"

# Required explicitly: ActionView loads the sanitizer vendors lazily, so naming
# them below without this raises NameError.
require "rails-html-sanitizer"

RSpec.describe UniversalRenderer::SSR::Scrubber do
  # Both vendors, because they parse differently and the difference is
  # security-relevant. A bare SanitizeHelper defaults to HTML4, while Rails 7.1+
  # apps get HTML5 — so testing only the default tests the wrong parser, which is
  # how an `xlink:href` bypass survived.
  shared_examples "a scrubber" do
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

    # `importmap` and `speculationrules` are the ones that matter: they are not
    # JavaScript MIME types, so a rule laxer than exact matching would admit them.
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

      # Every URI check anchors at the start of the value, so an approved first
      # candidate carries whatever follows it. Not exploitable, since candidates
      # are fetched as images. A real fix has to parse candidates rather than split
      # on commas, because data URIs contain them.
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

    it "blocks a meta refresh however the tag and value are cased or padded" do
      html = <<~HTML
        <META HTTP-EQUIV="REFRESH" content="0;url=https://evil.test">
        <meta http-equiv=" refresh " content="0;url=https://evil.test">
      HTML

      expect(sanitize(html)).not_to include("evil.test")
    end

    it "leaves an escaped ampersand in a query string intact" do
      html = '<a href="https://example.test/?a=1&amp;b=2">link</a>'

      expect(sanitize(html)).to include("a=1&amp;b=2")
    end

    it "keeps inline SVG data URIs on images, where browsers cannot execute them" do
      html = <<~HTML
        <img src="data:image/svg+xml,%3csvg%3e%3c/svg%3e" alt="logo">
        <img srcset="data:image/svg+xml;base64,PHN2Zy8+ 1x" alt="logo 2x">
        <picture><source srcset="data:image/svg+xml;base64,PHN2Zy8+ 1x"><img src="/logo.png"></picture>
      HTML

      result = sanitize(html)

      expect(result).to include('src="data:image/svg+xml,%3csvg%3e%3c/svg%3e"')
      expect(result).to include("srcset=\"data:image/svg+xml;base64,PHN2Zy8+ 1x\"")
      # <source> inside <picture> feeds the same restricted image mode as <img>.
      expect(result).to include("<source srcset=")
    end

    it "blocks inline SVG data URIs outside the restricted image modes" do
      html = <<~HTML
        <video><source src="data:image/svg+xml,%3csvg%3e%3c/svg%3e"></video>
        <a href="data:image/svg+xml,%3csvg%3e%3c/svg%3e">document</a>
      HTML

      result = sanitize(html)

      expect(result).not_to include("data:image/svg+xml")
    end

    # This and the MathML case below were verified in a real browser: the payload
    # the sanitizer emits executes.
    it "removes noscript, which the browser and the sanitizer tokenize differently" do
      # The sanitizer sees markup (scripting disabled), so the `</noscript>` in the
      # title attribute is inert to it. The browser sees raw text, so that string
      # closes the element early and the <img> becomes live.
      html = %(<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>)

      result = sanitize(html)

      expect(result).not_to include("noscript")
      expect(result).not_to include("onerror")
    end

    it "removes the MathML integration points that flip the parser into HTML" do
      html = <<~HTML
        <math><mtext><mglyph><style><img src=x onerror=alert(1)></style></mglyph><table></table></mtext></math>
        <math><annotation-xml encoding="text/html"><style><img src=x onerror=alert(1)></style></annotation-xml></math>
      HTML

      result = sanitize(html)

      expect(result).not_to include("mglyph", "annotation-xml")
      expect(result).not_to include("onerror")
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

    # Under HTML5 the prefix is a namespace, not part of the name, so reading
    # `node["href"]` sees nothing and keeps the attribute. In SVG,
    # `<a xlink:href="javascript:...">` is a live link.
    it "removes dangerous URIs from namespaced attributes" do
      html = <<~HTML
        <svg><a xlink:href="javascript:alert(1)"><text>click</text></a></svg>
        <svg><a xlink:href="data:text/html,payload"><text>doc</text></a></svg>
        <svg><image xlink:href="data:image/svg+xml,%3csvg%3e"></image></svg>
      HTML

      result = sanitize(html)

      expect(result).not_to include("javascript", "data:")
      expect(result).to include("<text>click</text>")
    end

    it "keeps safe namespaced attributes" do
      html = %(<svg><use xlink:href="/sprite.svg#icon"></use></svg>)

      expect(sanitize(html)).to include('xlink:href="/sprite.svg#icon"')
    end
  end

  # Not through ActionView's SanitizeHelper, whose sanitizer is memoized in a
  # class variable for the life of the process.
  {
    "HTML4" => Rails::HTML4::Sanitizer,
    "HTML5" => Rails::HTML5::Sanitizer
  }.each do |name, vendor|
    context "with the #{name} sanitizer" do
      let(:sanitizer) { vendor.safe_list_sanitizer.new }

      def sanitize(html)
        sanitizer.sanitize(html, scrubber: described_class.new).to_s
      end

      it_behaves_like "a scrubber"
    end
  end
end

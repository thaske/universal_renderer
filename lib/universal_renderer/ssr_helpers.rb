module UniversalRenderer
  module SsrHelpers
    # @!method ssr_meta
    #   Outputs a meta tag placeholder for SSR content.
    #   This placeholder is used by the rendering process to inject SSR metadata.
    #   @return [String] The HTML-safe string "<!-- SSR_META -->".
    def ssr_meta
      "<!-- SSR_META -->".html_safe
    end

    # @!method ssr_body
    #   Outputs a body placeholder for SSR content.
    #   This placeholder is used by the rendering process to inject the main SSR body.
    #   @return [String] The HTML-safe string "<!-- SSR_BODY -->".
    def ssr_body
      "<!-- SSR_BODY -->".html_safe
    end

    # @!method sanitize_ssr(html)
    #   Sanitizes HTML content rendered by the SSR service.
    #   Uses a custom scrubber ({UniversalRenderer::SsrScrubber}) to remove potentially
    #   harmful elements like scripts and event handlers, while allowing safe tags
    #   like stylesheets and meta tags.
    #   @param html [String] The HTML string to sanitize.
    #   @return [String] The sanitized HTML string.
    def sanitize_ssr(html)
      sanitize(html, scrubber: SsrScrubber.new)
    end

    # @!method use_ssr_streaming?
    #   Determines if SSR streaming should be used for the current request.
    #   The decision is based solely on the `ssr_streaming_preference` class attribute
    #   set on the controller.
    #   - If `ssr_streaming_preference` is `true`, streaming is enabled.
    #   - If `ssr_streaming_preference` is `false`, streaming is disabled.
    #   - If `ssr_streaming_preference` is `nil` (not set), streaming is disabled.
    #   @return [Boolean, nil] The value of `ssr_streaming_preference` (true, false, or nil).
    #     In conditional contexts, `nil` will behave as `false`.
    def use_ssr_streaming?
      controller.use_ssr_streaming?
    end
  end
end

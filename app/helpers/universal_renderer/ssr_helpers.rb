module UniversalRenderer
  module SsrHelpers
    def ssr_meta
      "<!-- SSR_META -->".html_safe
    end

    def ssr_body
      "<!-- SSR_BODY -->".html_safe
    end

    def sanitize_ssr(html)
      sanitize(html, scrubber: SsrScrubber.new)
    end

    def use_ssr_streaming?
      %w[1 true yes y].include?(ENV["ENABLE_SSR_STREAMING"]&.downcase)
    end
  end
end

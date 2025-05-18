module UniversalRenderer
  module SsrHelpers
    def ssr_meta
      "<!-- SSR_META -->".html_safe
    end

    def ssr_body
      "<!-- SSR_BODY -->".html_safe
    end
  end
end

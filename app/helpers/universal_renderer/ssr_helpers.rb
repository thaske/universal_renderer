module UniversalRenderer
  module SsrHelpers
    def ssr_meta
      '<!-- SSR_META -->'.html_safe
    end

    def ssr_root
      '<!-- SSR_ROOT -->'.html_safe
    end

    def ssr_state
      '<!-- SSR_STATE -->'.html_safe
    end
  end
end

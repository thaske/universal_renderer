module UniversalRenderer
  module SSR
    module Placeholders
      HEAD = "<!-- SSR_HEAD -->".html_safe.freeze
      BODY = "<!-- SSR_BODY -->".html_safe.freeze
    end
  end
end

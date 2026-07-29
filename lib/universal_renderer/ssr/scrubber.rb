require "cgi"
require "loofah"

module UniversalRenderer
  module SSR
    # Removes executable content from HTML returned by the SSR service while
    # preserving the elements and data attributes needed to hydrate an app.
    class Scrubber < ::Loofah::Scrubber
      BLOCKED_ELEMENTS = %w[
        base embed frame frameset iframe object script
        animate animatemotion animatetransform set
      ].freeze
      URI_ATTRIBUTES = %w[
        action background cite codebase data formaction href longdesc poster src
        srcset xlink:href
      ].freeze
      ALLOWED_PROTOCOLS = %w[http https mailto tel].freeze
      DANGEROUS_PROTOCOL = /\A(?:javascript|vbscript):/i
      DANGEROUS_DATA = %r{\Adata:(?:text/html|application/xhtml\+xml|image/svg\+xml)}i
      SAFE_DATA_IMAGE = %r{\Adata:image/(?:avif|gif|jpeg|png|webp);base64,}i

      def initialize
        super
        @direction = :top_down
      end

      def scrub(node)
        return Loofah::Scrubber::CONTINUE unless node.element?

        if blocked_element?(node) || refreshing_meta?(node)
          node.remove
          return Loofah::Scrubber::STOP
        end

        clean_attributes(node)
        Loofah::Scrubber::CONTINUE
      end

      private

      def blocked_element?(node)
        BLOCKED_ELEMENTS.include?(node.name.downcase)
      end

      def refreshing_meta?(node)
        node.name == "meta" && node["http-equiv"]&.casecmp?("refresh")
      end

      def clean_attributes(node)
        node.attributes.each_key do |attribute_name|
          normalized_name = attribute_name.to_s.downcase
          remove_attribute =
            normalized_name.start_with?("on") ||
              normalized_name == "srcdoc" ||
              (URI_ATTRIBUTES.include?(normalized_name) &&
                unsafe_uri?(node[attribute_name].to_s, normalized_name))

          node.remove_attribute(attribute_name) if remove_attribute
        end
      end

      def unsafe_uri?(value, attribute_name)
        normalized = CGI.unescapeHTML(value).gsub(/[\u0000-\u0020]/, "")
        return true if normalized.match?(DANGEROUS_PROTOCOL)
        return true if normalized.match?(DANGEROUS_DATA)

        scheme = normalized[/\A([a-z][a-z0-9+.-]*):/i, 1]
        return false unless scheme
        return false if ALLOWED_PROTOCOLS.include?(scheme.downcase)
        return false if %w[src srcset].include?(attribute_name) &&
                        normalized.match?(SAFE_DATA_IMAGE)

        true
      end
    end
  end
end

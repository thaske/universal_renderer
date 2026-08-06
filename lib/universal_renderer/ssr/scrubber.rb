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
      # Non-executable data-script MIME types. HTML treats a script whose type
      # is neither a JavaScript MIME type nor one of the special types
      # (`module`, `importmap`, `speculationrules`) as a data block and never
      # executes it, so these carry inert JSON.
      #
      # The exception exists for JSON-LD: structured data is emitted by the
      # render, and stripping it would sanitize away the SEO that motivates
      # server rendering in the first place. Hydration state does not need this
      # allowance — it comes back from the renderer as `payload` and is emitted
      # by the `ssr_payload` helper, which never passes through the scrubber.
      ALLOWED_SCRIPT_TYPES = %w[application/json application/ld+json].freeze
      URI_ATTRIBUTES = %w[
        action background cite codebase data formaction href longdesc poster src
        srcset xlink:href
      ].freeze
      ALLOWED_PROTOCOLS = %w[http https mailto tel].freeze
      DANGEROUS_PROTOCOL = /\A(?:javascript|vbscript):/i
      DANGEROUS_DATA = %r{\Adata:(?:text/html|application/xhtml\+xml|image/svg\+xml)}i
      SAFE_DATA_IMAGE = %r{\Adata:image/(?:avif|gif|jpeg|png|webp);base64,}i
      # An SVG referenced by an <img> element is rendered in a restricted mode:
      # browsers neither run its scripts nor load its external references. Since
      # bundlers routinely inline small SVGs (logos, icons) as data URIs, the
      # server render would otherwise lose those images. SVG data URIs stay
      # blocked on every other element and attribute.
      INLINE_SVG_DATA = %r{\Adata:image/svg\+xml[,;]}i
      IMAGE_SOURCE_ATTRIBUTES = %w[src srcset].freeze

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
        return false if node.name.downcase == "script" && data_script?(node)

        BLOCKED_ELEMENTS.include?(node.name.downcase)
      end

      # A script is a safe data script when it declares a non-executable JSON
      # MIME type (e.g. application/json or application/ld+json). JavaScript
      # scripts (including those without an explicit type) remain blocked.
      def data_script?(node)
        type = node["type"].to_s.downcase.strip
        return false if type.blank?

        ALLOWED_SCRIPT_TYPES.include?(type.split(";", 2).first.strip)
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
                unsafe_uri?(node[attribute_name].to_s, normalized_name, node))

          node.remove_attribute(attribute_name) if remove_attribute
        end
      end

      def unsafe_uri?(value, attribute_name, node)
        normalized = CGI.unescapeHTML(value).gsub(/[\u0000-\u0020]/, "")
        return true if normalized.match?(DANGEROUS_PROTOCOL)
        return false if inline_svg_image?(normalized, attribute_name, node)
        return true if normalized.match?(DANGEROUS_DATA)

        scheme = normalized[/\A([a-z][a-z0-9+.-]*):/i, 1]
        return false unless scheme
        return false if ALLOWED_PROTOCOLS.include?(scheme.downcase)
        return false if %w[src srcset].include?(attribute_name) &&
                        normalized.match?(SAFE_DATA_IMAGE)

        true
      end

      def inline_svg_image?(uri, attribute_name, node)
        node.name.downcase == "img" &&
          IMAGE_SOURCE_ATTRIBUTES.include?(attribute_name) &&
          uri.match?(INLINE_SVG_DATA)
      end
    end
  end
end

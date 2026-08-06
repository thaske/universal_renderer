require "active_support/core_ext/object/blank"
require "loofah"

module UniversalRenderer
  module SSR
    # Removes executable content from HTML returned by the SSR service while
    # preserving the elements and data attributes needed to hydrate an app.
    #
    # A blocklist over the whole HTML grammar cannot be a boundary against
    # attacker-controlled markup, because the sanitizer and the browser have to
    # agree on how the document parses. Treat it as defense in depth over HTML
    # your own renderer produced.
    class Scrubber < ::Loofah::Scrubber
      # Elements that change how the *rest* of the markup is tokenized, so the
      # tree this scrubber inspects is not the tree the browser builds.
      #
      # `<noscript>` is raw text with scripting enabled (the browser) and markup
      # without it (the sanitizer), so `<noscript><p title="</noscript><img src=x
      # onerror=...>">` reaches the browser as a live element. The MathML three
      # flip the parser between foreign content and HTML integration points for
      # the same effect. None belong in a server render.
      PARSER_CONTEXT_ELEMENTS = %w[
        noscript mglyph malignmark annotation-xml
      ].freeze

      BLOCKED_ELEMENTS = (
        %w[
          base embed frame frameset iframe object script
          animate animatemotion animatetransform set
        ] + PARSER_CONTEXT_ELEMENTS
      ).freeze
      # Non-executable data-script MIME types. HTML treats a script whose type is
      # neither a JavaScript MIME type nor one of the special types (`module`,
      # `importmap`, `speculationrules`) as an inert data block.
      #
      # The exception exists for JSON-LD, which the render emits and which would
      # otherwise be sanitized away along with the SEO that motivates SSR.
      ALLOWED_SCRIPT_TYPES = %w[application/json application/ld+json].freeze
      URI_ATTRIBUTES = %w[
        action background cite codebase data formaction href longdesc poster src
        srcset xlink:href
      ].freeze
      ALLOWED_PROTOCOLS = %w[http https mailto tel].freeze
      DANGEROUS_PROTOCOL = /\A(?:javascript|vbscript):/i
      DANGEROUS_DATA = %r{\Adata:(?:text/html|application/xhtml\+xml|image/svg\+xml)}i
      SAFE_DATA_IMAGE = %r{\Adata:image/(?:avif|gif|jpeg|png|webp);base64,}i
      # An SVG referenced by <img> renders in a restricted mode: no scripts, no
      # external references. Bundlers routinely inline icons as data URIs, so the
      # render would otherwise lose them. `<source>` inside `<picture>` feeds the
      # same mode; inside `<video>`/`<audio>` it does not.
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

      # Scripts with no explicit type are JavaScript, so they stay blocked.
      def data_script?(node)
        type = node["type"].to_s.downcase.strip
        return false if type.blank?

        ALLOWED_SCRIPT_TYPES.include?(type.split(";", 2).first.strip)
      end

      def refreshing_meta?(node)
        node.name.downcase == "meta" &&
          node["http-equiv"]&.strip&.casecmp?("refresh")
      end

      # Attribute *nodes*, not the `attributes` hash: that hash is keyed by local
      # name, so under the HTML5 parser `xlink:href` arrives as `"href"` and
      # `node["href"]` returns nil. An empty value read as safe, which left
      # `<svg><a xlink:href="javascript:...">` intact.
      def clean_attributes(node)
        node.attribute_nodes.each do |attribute|
          normalized_name = qualified_name(attribute)
          remove_attribute =
            normalized_name.start_with?("on") ||
              normalized_name == "srcdoc" ||
              (URI_ATTRIBUTES.include?(normalized_name) &&
                unsafe_uri?(attribute.value.to_s, normalized_name, node))

          attribute.remove if remove_attribute
        end
      end

      # The name as written in the markup. HTML4 keeps the prefix in the name;
      # HTML5 splits it into a namespace.
      def qualified_name(attribute)
        prefix = attribute.namespace&.prefix
        name = attribute.name.to_s
        (prefix ? "#{prefix}:#{name}" : name).downcase
      end

      # The parser has already resolved character references, so `value` is literal
      # text. Decoding it again would only corrupt URLs that legitimately contain
      # an escaped entity.
      def unsafe_uri?(value, attribute_name, node)
        normalized = value.gsub(/[\u0000-\u0020]/, "")
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
        return false unless IMAGE_SOURCE_ATTRIBUTES.include?(attribute_name)
        return false unless restricted_image_context?(node)

        uri.match?(INLINE_SVG_DATA)
      end

      def restricted_image_context?(node)
        case node.name.downcase
        when "img" then true
        when "source" then node.parent&.name&.downcase == "picture"
        else false
        end
      end
    end
  end
end

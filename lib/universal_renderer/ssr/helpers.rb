module UniversalRenderer
  module SSR
    # View helpers for emitting what the SSR service returned. `ssr?`,
    # `ssr_response`, and `ssr_streaming?` come from the controller via
    # `helper_method` (see {UniversalRenderer::Renderable}).
    module Helpers
      SAFE_BODY_ATTRIBUTE_NAME = /\A[a-z_:][a-z0-9:._-]*\z/i

      # Server-rendered <head> content, or the streaming placeholder.
      #
      # @return [String] Sanitized head HTML, the `<!-- SSR_HEAD -->` marker
      #   when streaming, or an empty string when there is nothing to emit.
      def ssr_head
        return Placeholders::HEAD if ssr_streaming?

        html = ssr_response&.head
        html.present? ? sanitize_ssr(html) : ""
      end

      # Server-rendered body content, or the streaming placeholder.
      #
      # @return [String] Sanitized body HTML, the `<!-- SSR_BODY -->` marker
      #   when streaming, or an empty string when there is nothing to emit.
      def ssr_body
        return Placeholders::BODY if ssr_streaming?

        html = ssr_response&.body
        html.present? ? sanitize_ssr(html) : ""
      end

      # Attributes the renderer asked to be applied to the `<body>` tag:
      #
      #   <body class="app" <%= ssr_body_attributes %>>
      #
      # A non-Hash is dropped rather than raised on, so a renderer answering 200
      # with the wrong shape degrades the page instead of breaking the layout.
      #
      # @return [ActiveSupport::SafeBuffer] Escaped `name="value"` pairs, or an
      #   empty buffer when the renderer sent none.
      def ssr_body_attributes
        attrs = ssr_response&.body_attrs
        return "".html_safe unless attrs.is_a?(Hash)
        return "".html_safe if attrs.empty?

        attrs = sanitize_ssr_body_attributes(attrs) if UniversalRenderer.config.sanitize
        tag.attributes(attrs)
      end

      # Renders the renderer's hydration payload as an inert JSON script tag.
      #
      # Return it as `payload` from your `render` callback and read it on the
      # client with `JSON.parse(el.textContent)`.
      #
      # @param id [String] DOM id for the script element.
      # @return [ActiveSupport::SafeBuffer, nil] The script tag, or nil when the
      #   renderer sent no payload.
      def ssr_payload(id: "ssr-payload")
        payload = ssr_response&.payload
        return if payload.nil?

        content_tag(
          :script,
          ERB::Util.json_escape(payload.to_json),
          { id: id, type: "application/json" },
          false
        )
      end

      # These back the helpers above; the module is included into the view
      # context, so a public method here would be callable from any template.
      private

      # Sanitizes HTML returned by the SSR service, honouring `config.sanitize`
      # and `config.scrubber`.
      #
      # @param html [String] The HTML string to sanitize.
      # @return [String] The sanitized HTML, or the input marked html_safe when
      #   sanitization is disabled.
      def sanitize_ssr(html)
        config = UniversalRenderer.config
        # rubocop:disable Rails/OutputSafety -- opting out of sanitization is the
        # documented meaning of config.sanitize = false.
        return html.to_s.html_safe unless config.sanitize
        # rubocop:enable Rails/OutputSafety

        sanitize(html, scrubber: config.scrubber || Scrubber.new)
      end

      # `tag.attributes` escapes values but does not reject executable names such
      # as `onload`, so the body-attribute channel needs the same boundary as
      # `ssr_head` and `ssr_body`.
      def sanitize_ssr_body_attributes(attrs)
        attrs.each_with_object({}) do |(name, value), safe|
          normalized = name.to_s.downcase
          next unless normalized.match?(SAFE_BODY_ATTRIBUTE_NAME)
          next if normalized.start_with?("on") || normalized == "srcdoc"

          safe[name] = value
        end
      end

    end
  end
end

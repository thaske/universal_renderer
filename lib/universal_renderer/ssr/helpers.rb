module UniversalRenderer
  module SSR
    # View helpers for emitting what the SSR service returned.
    #
    # `ssr?`, `ssr_response`, and `ssr_streaming?` come from the controller via
    # `helper_method` (see {UniversalRenderer::Renderable}); everything here is
    # built on top of them, so no view ever needs to read an instance variable.
    module Helpers
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

      # Attributes the renderer asked to be applied to the `<body>` tag,
      # ready to interpolate into the tag itself.
      #
      #   <body class="app" <%= ssr_body_attributes %>>
      #
      # @return [ActiveSupport::SafeBuffer] Escaped `name="value"` pairs, or an
      #   empty buffer when the renderer sent none.
      def ssr_body_attributes
        attrs = ssr_response&.body_attrs
        return "".html_safe if attrs.blank?

        tag.attributes(attrs)
      end

      # Renders the renderer's hydration payload as an inert JSON script tag.
      #
      # The payload travels back from the SSR service rather than out from
      # Rails, because only the render knows it: a dehydrated query cache, the
      # class names a CSS-in-JS library already emitted into <head>, a resolved
      # route. Return it as `payload` from your `render` callback and read it on
      # the client with `JSON.parse(el.textContent)`.
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

      # Sanitizes HTML returned by the SSR service.
      #
      # Honours `config.sanitize` and `config.scrubber`. Sanitizing a full page
      # render costs real CPU on every request; see the `sanitize` option for
      # when turning it off is reasonable.
      #
      # @param html [String] The HTML string to sanitize.
      # @return [String] The sanitized HTML string, or the input marked
      #   html_safe when sanitization is disabled.
      def sanitize_ssr(html)
        config = UniversalRenderer.config
        # rubocop:disable Rails/OutputSafety -- opting out of sanitization is the
        # documented meaning of config.sanitize = false.
        return html.to_s.html_safe unless config.sanitize
        # rubocop:enable Rails/OutputSafety

        sanitize(html, scrubber: config.scrubber || Scrubber.new)
      end

      # @deprecated The props Rails sent are already known to Rails; what the
      #   client needs is the state the *render* produced. Return `payload` from
      #   your render callback and emit it with {#ssr_payload}.
      def ssr_props_json(props = nil)
        raw_props =
          props ||
            (controller.ssr_props if controller.respond_to?(:ssr_props)) || {}
        ERB::Util.json_escape(raw_props.to_json)
      end

      # @deprecated See {#ssr_props_json}. Use {#ssr_payload}.
      def ssr_props(id: "ssr-props", props: nil)
        content_tag(
          :script,
          ssr_props_json(props),
          { id: id, type: "application/json" },
          false
        )
      end
    end
  end
end

module UniversalRenderer
  module SSR
    # View helpers for emitting what the SSR service returned.
    #
    # `ssr?`, `ssr_response`, and `ssr_streaming?` come from the controller via
    # `helper_method` (see {UniversalRenderer::Renderable}); everything here is
    # built on top of them, so no view ever needs to read an instance variable.
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

      # Attributes the renderer asked to be applied to the `<body>` tag,
      # ready to interpolate into the tag itself.
      #
      #   <body class="app" <%= ssr_body_attributes %>>
      #
      # When sanitization is enabled, executable and malformed attribute names
      # are removed before Rails escapes and serializes the remaining values.
      #
      # Anything other than a Hash is dropped rather than raised on: a renderer
      # that answers 200 with the wrong shape should degrade the page the same
      # way an unreachable renderer does, not blow up inside the layout.
      # {UniversalRenderer::Client::Base} already filters this, but a helper
      # that can take the page down is worth guarding at both ends.
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

      # Private: these back the helpers above and are not a view API. Included
      # into the view context, a public method here would be callable from any
      # template, which is a wider surface than this module means to offer.
      private

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

      # Attribute values are escaped by `tag.attributes`, but Rails deliberately
      # does not reject executable names such as `onload`. Keep the body-attribute
      # channel inside the same security boundary as `ssr_head` and `ssr_body`
      # whenever sanitization is enabled.
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

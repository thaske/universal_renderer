module UniversalRenderer
  module Rendering
    extend ActiveSupport::Concern

    included do
      include ActionController::Live

      helper UniversalRenderer::SsrHelpers

      before_action :initialize_props

      class_attribute :enable_ssr, instance_writer: false, default: false

      class_attribute :ssr_streaming_preference,
                      instance_writer: false,
                      default: nil
    end

    module ClassMethods
      def enable_ssr(options = {})
        self.enable_ssr = true

        return unless options.key?(:streaming)

        self.ssr_streaming_preference = options[:streaming]
      end
    end

    def render_ssr
      @ssr =
        UniversalRenderer::StaticClient.static(
          request.original_url,
          @universal_renderer_props
        )
    end

    private

    def default_render
      return super unless self.class.enable_ssr && request.format.html?

      if use_ssr_streaming?
        render_ssr_stream
      else
        render_ssr
        super
      end
    end

    def render_ssr_stream
      set_streaming_headers

      full_layout = render_to_string

      split_index = full_layout.index("<!-- SSR_META -->")
      before_meta = full_layout[0...split_index]
      after_meta = full_layout[split_index..]

      response.stream.write(before_meta)

      current_props = @universal_renderer_props.dup

      streaming_succeeded =
        UniversalRenderer::StreamClient.stream(
          request.original_url,
          current_props,
          after_meta,
          response
        )

      handle_ssr_stream_fallback(response) unless streaming_succeeded
    end

    def initialize_props
      @universal_renderer_props = {}
    end

    def add_prop(key_or_hash, data_value = nil)
      if data_value.nil? && key_or_hash.is_a?(Hash)
        @universal_renderer_props.merge!(key_or_hash.deep_stringify_keys)
      else
        @universal_renderer_props[key_or_hash.to_s] = data_value
      end
    end

    # Allows a prop to be treated as an array, pushing new values to it.
    # If the prop does not exist or is nil, it's initialized as an array.
    # If the prop exists but is not an array (e.g., set as a scalar by `add_prop`),
    # its current value will be converted into the first element of the new array.
    # If `value_to_add` is an array, its elements are concatenated. Otherwise, `value_to_add` is appended.
    def push_prop(key, value_to_add)
      prop_key = key.to_s
      current_value = @universal_renderer_props[prop_key]

      if current_value.nil?
        @universal_renderer_props[prop_key] = []
      elsif !current_value.is_a?(Array)
        @universal_renderer_props[prop_key] = [current_value]
      end
      # At this point, @universal_renderer_props[prop_key] is guaranteed to be an array.

      if value_to_add.is_a?(Array)
        @universal_renderer_props[prop_key].concat(value_to_add)
      else
        @universal_renderer_props[prop_key] << value_to_add
      end
    end

    def set_streaming_headers
      # Tell Cloudflare / proxies not to cache or buffer.
      response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
      response.headers["Pragma"] = "no-cache"
      response.headers["Expires"] = "0"

      # Disable Nginx buffering per-response.
      response.headers["X-Accel-Buffering"] = "no"
      response.headers["Content-Type"] = "text/html"

      # Remove Content-Length header to prevent buffering.
      response.headers.delete("Content-Length")
    end

    def handle_ssr_stream_fallback(response)
      # SSR streaming failed or was not possible (e.g. server down, config missing).
      # Ensure response hasn't been touched in a way that prevents a new render.
      return unless response.committed? || response.body.present?

      Rails.logger.error(
        "SSR stream fallback:" \
          "Cannot render default fallback template because response was already committed or body present."
      )
      # Close the stream if it's still open to prevent client connection from hanging
      # when we can't render a fallback page due to already committed response
      response.stream.close unless response.stream.closed?

      # If response not committed, no explicit render is called here,
      # allowing Rails' default rendering behavior to take over.
    end
  end
end

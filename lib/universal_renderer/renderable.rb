module UniversalRenderer
  module Renderable
    extend ActiveSupport::Concern

    included do
      include ActionController::Live
      helper UniversalRenderer::SSR::Helpers
      before_action :initialize_props
    end

    class_methods do
      def enable_ssr(options = {})
        class_attribute :enable_ssr, instance_writer: false
        self.enable_ssr = true

        class_attribute :ssr_streaming_preference, instance_writer: false
        self.ssr_streaming_preference = options[:streaming]
      end
    end

    # Fetches Server-Side Rendered (SSR) content for the current request.
    # This method makes a blocking call to the SSR service using {UniversalRenderer::Client::Base.fetch}
    # and stores the result in the `@ssr` instance variable.
    #
    # The SSR content is fetched based on the `request.original_url` and the
    # `@universal_renderer_props` accumulated for the request.
    #
    # @return [Hash, nil] The fetched SSR data (typically a hash with keys like `:head`, `:body_html`, `:body_attrs`),
    #   or `nil` if the fetch fails or SSR is not configured.
    def fetch_ssr
      @ssr =
        UniversalRenderer::Client::Base.fetch(
          request.original_url,
          @universal_renderer_props
        )
    end

    def use_ssr_streaming?
      self.class.try(:ssr_streaming_preference)
    end

    private

    def render(*args, **kwargs)
      return super unless self.class.enable_ssr

      return super unless request.format.html?

      if use_ssr_streaming?
        render_ssr_stream(*args, **kwargs)
      else
        fetch_ssr
        super
      end
    end

    def render_ssr_stream(*args, **kwargs)
      set_streaming_headers

      full_layout = render_to_string(*args, **kwargs)

      split_index = full_layout.index(SSR::Placeholders::META)
      before_meta = full_layout[0...split_index]
      after_meta = full_layout[split_index..]

      response.stream.write(before_meta)

      current_props = @universal_renderer_props.dup

      streaming_succeeded =
        UniversalRenderer::Client::Stream.stream(
          request.original_url,
          current_props,
          after_meta,
          response
        )

      # SSR streaming failed or was not possible (e.g. server down, config missing).
      unless streaming_succeeded
        Rails.logger.error(
          "SSR stream fallback: " \
            "Streaming failed, proceeding with standard rendering."
        )
        response.stream.write(after_meta)
      end

      response.stream.close unless response.stream.closed?
    end

    def initialize_props
      @universal_renderer_props = {}
    end

    # Adds a prop or a hash of props to be sent to the SSR service.
    # Props are deep-stringified if a hash is provided.
    #
    # @param key_or_hash [String, Symbol, Hash] The key for the prop or a hash of props.
    # @param data_value [Object, nil] The value for the prop if `key_or_hash` is a key.
    #   If `key_or_hash` is a Hash, this parameter is ignored.
    # @example Adding a single prop
    #   add_prop(:user_id, 123)
    # @example Adding multiple props from a hash
    #   add_prop({theme: "dark", locale: "en"})
    # @return [void]
    def add_prop(key_or_hash, data_value = nil)
      if data_value.nil? && key_or_hash.is_a?(Hash)
        @universal_renderer_props.merge!(key_or_hash.deep_stringify_keys)
      else
        @universal_renderer_props[key_or_hash.to_s] = data_value
      end
    end

    # Allows a prop to be treated as an array, pushing new values to it.
    # If the prop does not exist or is `nil`, it\'s initialized as an empty array.
    # If the prop exists but is not an array (e.g., set as a scalar by `add_prop`),
    # its current value will be converted into the first element of the new array.
    # If `value_to_add` is an array, its elements are concatenated to the existing array.
    # Otherwise, `value_to_add` is appended as a single element.
    #
    # @param key [String, Symbol] The key of the prop to modify.
    # @param value_to_add [Object, Array] The value or array of values to add to the prop.
    # @example Pushing a single value
    #   push_prop(:notifications, "New message")
    # @example Pushing multiple values from an array
    #   push_prop(:tags, ["rails", "ruby"])
    # @example Appending to an existing scalar value (converts to array)
    #   add_prop(:item, "first")
    #   push_prop(:item, "second") # @universal_renderer_props becomes { "item" => ["first", "second"] }
    # @return [void]
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
  end
end

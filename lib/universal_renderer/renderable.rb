module UniversalRenderer
  # Controller-side entry point for server-side rendering.
  #
  # There are two ways to drive a render, and they are equally supported:
  #
  #   1. Declaratively, with {ClassMethods#enable_ssr}. The `render` override
  #      fetches the SSR payload for you. Good when the whole action is
  #      server-rendered unconditionally.
  #
  #   2. Imperatively, by calling {#render_ssr} from the action. Good when
  #      whether to server-render depends on request state, or when the props
  #      only become available part-way through the action:
  #
  #        def show
  #          @user = User.find(params[:id])
  #          add_query_data(["users", @user.id], user_json)
  #          render_ssr
  #          render "common/js_only"
  #        end
  #
  # Either way a failed or unconfigured render is a no-op: {#ssr?} returns false
  # and the layout falls back to client-side rendering.
  module Renderable
    extend ActiveSupport::Concern

    included do
      helper UniversalRenderer::SSR::Helpers

      # Distinct from the `enable_ssr` DSL method: reading a class_attribute
      # named `enable_ssr` on a class that never opted in would invoke the DSL
      # (arming SSR as a side effect) instead of returning false.
      class_attribute :ssr_enabled, instance_writer: false, default: false
      class_attribute :ssr_streaming_preference,
                      instance_writer: false,
                      default: nil
      class_attribute :ssr_conditions, instance_writer: false, default: {}

      helper_method :ssr?, :ssr_response, :ssr_streaming?
    end

    module Streaming
      extend ActiveSupport::Concern

      included { include ActionController::Live }
    end

    module ClassMethods
      # Arms the automatic render path for this controller.
      #
      # @param options [Hash]
      # @option options [Boolean] :streaming Stream the response instead of
      #   fetching it in one blocking request. Mixes in ActionController::Live.
      # @option options [Symbol, Array<Symbol>] :only Restrict to these actions.
      # @option options [Symbol, Array<Symbol>] :except Skip these actions.
      # @option options [Symbol, Proc] :if Render only when this evaluates
      #   truthy. A Symbol names a controller method; a Proc is instance_exec'd
      #   against the controller.
      # @option options [Symbol, Proc] :unless Skip when this evaluates truthy.
      #
      # @example Public pages only
      #   enable_ssr only: :show, unless: -> { current_user.present? }
      # @return [void]
      def enable_ssr(options = {})
        self.ssr_enabled = true
        self.ssr_streaming_preference = options[:streaming]
        self.ssr_conditions = options.slice(:only, :except, :if, :unless).freeze

        include UniversalRenderer::Renderable::Streaming if options[:streaming]
      end
    end

    # The props accumulated for this request. Mutating the returned hash is
    # supported, but prefer {#add_prop} / {#push_prop} / {#add_query_data}.
    #
    # @return [Hash]
    # rubocop:disable Naming/MemoizedInstanceVariableName -- the ivar name is
    # part of the pre-0.6 surface; layouts and specs in the wild read it.
    def ssr_props
      @universal_renderer_props ||= {}
    end
    # rubocop:enable Naming/MemoizedInstanceVariableName

    # Fetches the SSR payload for the current request and remembers it, so the
    # view helpers and {#ssr?} can see it. Idempotent: calling it twice does not
    # issue a second request.
    #
    # @param props [Hash, nil] Props to merge before rendering, for convenience.
    #   Ignored once a render has happened for this request — merging them then
    #   would silently change `ssr_props` without affecting the response.
    # @return [UniversalRenderer::SSR::Response, nil] `nil` when SSR is not
    #   configured or the render failed, in which case the caller should let the
    #   client-rendered path stand.
    def render_ssr(props = nil)
      return @_ssr_response if defined?(@_ssr_response)

      add_prop(props) if props.present?

      @_ssr_response =
        UniversalRenderer::Client::Base.call(request.original_url, ssr_props)

      # Kept for layouts written against the pre-0.6 `@ssr` ivar. New code
      # should ask `ssr?` / `ssr_response`.
      @ssr = @_ssr_response

      @_ssr_response
    end

    alias fetch_ssr render_ssr

    # @return [UniversalRenderer::SSR::Response, nil] The payload from the most
    #   recent {#render_ssr}, or nil if none succeeded.
    def ssr_response
      return @_ssr_response if defined?(@_ssr_response)

      # Tolerate layouts and controllers that assigned @ssr by hand.
      @ssr
    end

    # Whether this request has server-rendered content to emit. Use it to pick
    # between a hydration entry point and a client-render entry point, and to
    # guard anything that only makes sense on a server-rendered page.
    #
    # @return [Boolean]
    def ssr?
      ssr_response.present?
    end

    # @return [Boolean, nil] Whether this controller streams its SSR response.
    #   `nil` (never opted in) behaves as false.
    def ssr_streaming?
      self.class.ssr_streaming_preference
    end

    def render(*, **)
      return super unless ssr_enabled_for_request?

      if ssr_streaming?
        success = render_ssr_stream(*, **)
        super unless success
      else
        render_ssr
        super
      end
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
        ssr_props.merge!(key_or_hash.deep_stringify_keys)
      else
        ssr_props[key_or_hash.to_s] = data_value
      end
    end

    # Allows a prop to be treated as an array, pushing new values to it.
    # If the prop does not exist or is `nil`, it's initialized as an empty array.
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
    #   push_prop(:item, "second") # ssr_props becomes { "item" => ["first", "second"] }
    # @return [void]
    def push_prop(key, value_to_add)
      props = ssr_props
      prop_key = key.to_s
      current_value = props[prop_key]

      if current_value.nil?
        props[prop_key] = []
      elsif !current_value.is_a?(Array)
        props[prop_key] = [current_value]
      end
      # At this point, props[prop_key] is guaranteed to be an array.

      if value_to_add.is_a?(Array)
        props[prop_key].concat(value_to_add)
      else
        props[prop_key] << value_to_add
      end
    end

    # Adds a React Query cache entry that can be hydrated on SSR/client boot.
    #
    # Entries accumulate under the `react_query` prop as
    # `{ "query_key" => [...], "data" => ... }`. The NPM package's
    # `hydrateReactQuery(props, queryClient)` consumes exactly this shape — use
    # it in `setup` rather than reimplementing the loop.
    #
    # @param query_key [Array, String, Symbol] The React Query key.
    # @param data [Object] The cached query data.
    # @return [void]
    def add_query_data(query_key, data)
      parts = query_key.is_a?(Array) ? query_key : [query_key]

      # Symbols become strings; everything else is left alone. React Query
      # compares keys structurally, and numeric parts (`["users", 1]`) have to
      # stay numeric to match on the client. `deep_stringify_keys` below only
      # touches hash keys, so without this the key kept Symbols on the Ruby side
      # and matched only by accident once JSON flattened them.
      normalized = parts.map { |part| part.is_a?(Symbol) ? part.to_s : part }

      push_prop(
        :react_query,
        { query_key: normalized, data: data }.deep_stringify_keys
      )
    end

    private

    # Whether the automatic (`enable_ssr`) path should run for this request.
    # {#render_ssr} deliberately does not consult this: an explicit call is the
    # caller stating intent.
    def ssr_enabled_for_request?
      return false unless self.class.ssr_enabled
      return false unless request.format.html?

      # Only skip while an active Warden throw/catch is in flight, so SSR still
      # runs for public pages viewed by unauthenticated visitors.
      return false if defined?(Warden) && request.env["warden"]&.message.present?

      ssr_conditions_met?
    end

    def ssr_conditions_met?
      conditions = self.class.ssr_conditions
      return true if conditions.blank?

      ssr_action_allowed?(conditions) && ssr_guards_pass?(conditions)
    end

    def ssr_action_allowed?(conditions)
      action = action_name.to_s

      only = conditions[:only]
      return false if only && Array(only).map(&:to_s).exclude?(action)

      except = conditions[:except]
      return false if except && Array(except).map(&:to_s).include?(action)

      true
    end

    def ssr_guards_pass?(conditions)
      if_condition = conditions[:if]
      return false if if_condition && !evaluate_ssr_condition(if_condition)

      unless_condition = conditions[:unless]
      return false if unless_condition &&
                      evaluate_ssr_condition(unless_condition)

      true
    end

    def evaluate_ssr_condition(condition)
      case condition
      when Symbol, String
        send(condition)
      when Proc
        condition.arity.zero? ? instance_exec(&condition) : condition.call(self)
      else
        raise ArgumentError,
              "enable_ssr conditions must be a Symbol, String, or Proc, " \
                "got #{condition.class}"
      end
    end

    def render_ssr_stream(*, **)
      full_layout = render_to_string(*, **)

      streaming_succeeded =
        UniversalRenderer::Client::Stream.call(
          request.original_url,
          ssr_props.dup,
          full_layout,
          response
        )

      if streaming_succeeded
        response.stream.close unless response.stream.closed?
        true
      else
        UniversalRenderer.log do |log|
          log.error(
            "SSR stream fallback: " \
              "Streaming failed, proceeding with standard rendering."
          )
        end
        false
      end
    end
  end
end

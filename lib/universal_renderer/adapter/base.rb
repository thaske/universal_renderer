# frozen_string_literal: true

module UniversalRenderer
  module Adapter
    class Base
      # Abstract interface for SSR adapters
      # All adapters must implement these methods to provide consistent API

      # Performs a blocking SSR call and returns the complete rendered content
      # @param url [String] The URL of the page to render
      # @param props [Hash] Props to be passed for rendering
      # @return [UniversalRenderer::SSR::Response, nil] The SSR response or nil on failure
      def call(url, props)
        raise NotImplementedError, "Subclasses must implement #call"
      end

      # Performs streaming SSR (only supported by HTTP adapter)
      # @param url [String] The URL of the page to render
      # @param props [Hash] Props to be passed for rendering
      # @param template [String] The HTML template to use for rendering
      # @param response [ActionDispatch::Response] The Rails response object to stream to
      # @return [Boolean] True if streaming was initiated, false otherwise
      def stream(_url, _props, _template, _response)
        false # Default implementation returns false (not supported)
      end

      # Returns whether this adapter supports streaming
      # @return [Boolean] True if streaming is supported
      def supports_streaming?
        false
      end
    end
  end
end

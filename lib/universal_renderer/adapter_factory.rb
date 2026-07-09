# frozen_string_literal: true

require_relative "adapter/http"

module UniversalRenderer
  class AdapterFactory
    class << self
      # Creates and returns the appropriate adapter based on configuration
      # @return [UniversalRenderer::Adapter::Base] The configured adapter
      def create_adapter
        adapter = UniversalRenderer.config.adapter
        UniversalRenderer.log do |log|
          log.info(
            "Resolved SSR adapter '#{adapter}' for Rails env '#{Rails.env}'"
          )
        end

        case adapter
        when :http
          Adapter::Http.new
        when :stdio
          # The stdio adapter is experimental and lazily loaded so it never
          # affects the default (HTTP) boot path. It is only required when a
          # host application explicitly opts into `config.adapter = :stdio`.
          require_relative "adapter/stdio"
          Adapter::Stdio.new
        else
          UniversalRenderer.log do |log|
            log.warn(
              "Unknown SSR adapter '#{adapter}'. Falling back to HTTP adapter."
            )
          end
          Adapter::Http.new
        end
      end

      # Returns a singleton instance of the adapter
      # This ensures we don't recreate Stdio process pools unnecessarily
      def adapter
        @adapter ||= create_adapter
      end

      # Resets the adapter (useful for testing or configuration changes)
      def reset!
        @adapter = nil
        UniversalRenderer::Client::HttpPool.reset!
      end
    end
  end
end

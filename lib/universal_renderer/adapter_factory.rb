# frozen_string_literal: true

require_relative "adapter/http"
require_relative "adapter/mini_racer"

module UniversalRenderer
  class AdapterFactory
    class << self
      # Creates and returns the appropriate adapter based on configuration
      # @return [UniversalRenderer::Adapter::Base] The configured adapter
      def create_adapter
        case UniversalRenderer.config.engine
        when :http
          Adapter::Http.new
        when :mini_racer
          # Initialize MiniRacer with optional configuration
          Adapter::MiniRacer.new(mini_racer_options)
        else
          Rails.logger.warn(
            "Unknown SSR engine '#{UniversalRenderer.config.engine}'. Falling back to HTTP adapter."
          )
          Adapter::Http.new
        end
      end

      # Returns a singleton instance of the adapter
      # This ensures we don't recreate MiniRacer context pools unnecessarily
      def adapter
        @adapter ||= create_adapter
      end

      # Resets the adapter (useful for testing or configuration changes)
      def reset!
        @adapter = nil
      end

      private

      def mini_racer_options
        {
          pool_size: ENV.fetch("SSR_MINI_RACER_POOL_SIZE", 5).to_i,
          timeout: ENV.fetch("SSR_MINI_RACER_TIMEOUT", 5_000).to_i,
          max_memory: ENV.fetch("SSR_MINI_RACER_MAX_MEMORY", 256_000_000).to_i,
          bundle_path: UniversalRenderer.config.bundle_path
        }
      end
    end
  end
end

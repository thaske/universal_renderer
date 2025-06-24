# frozen_string_literal: true

require_relative "adapter/http"
require_relative "adapter/bun_io"

module UniversalRenderer
  class AdapterFactory
    class << self
      # Creates and returns the appropriate adapter based on configuration
      # @return [UniversalRenderer::Adapter::Base] The configured adapter
      def create_adapter
        case UniversalRenderer.config.engine
        when :http
          Adapter::Http.new
        when :bun_io
          # Initialize BunIo with optional configuration
          Adapter::BunIo.new(bun_io_options)
        else
          Rails.logger.warn(
            "Unknown SSR engine '#{UniversalRenderer.config.engine}'. Falling back to HTTP adapter."
          )
          Adapter::Http.new
        end
      end

      # Returns a singleton instance of the adapter
      # This ensures we don't recreate BunIo process pools unnecessarily
      def adapter
        @adapter ||= create_adapter
      end

      # Resets the adapter (useful for testing or configuration changes)
      def reset!
        @adapter = nil
      end

      private

      def bun_io_options
        {
          pool_size: ENV.fetch("SSR_BUN_POOL_SIZE", 5).to_i,
          timeout: ENV.fetch("SSR_BUN_TIMEOUT", 5_000).to_i,
          cli_script: ENV.fetch("SSR_BUN_CLI_SCRIPT", "src/stdio/bun/index.js"),
          bundle_path: UniversalRenderer.config.bundle_path
        }
      end
    end
  end
end

# frozen_string_literal: true

require_relative "adapter/http"
require_relative "adapter/stdio"

module UniversalRenderer
  class AdapterFactory
    class << self
      # Creates and returns the appropriate adapter based on configuration
      # @return [UniversalRenderer::Adapter::Base] The configured adapter
      def create_adapter
        engine = resolved_engine
        Rails.logger.info(
          "UniversalRenderer resolved SSR engine '#{engine}' for Rails env '#{Rails.env}'"
        )

        case engine
        when :http
          Adapter::Http.new
        when :stdio
          Adapter::Stdio.new
        else
          Rails.logger.warn(
            "Unknown SSR engine '#{engine}'. Falling back to HTTP adapter.",
          )
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
      end

      private

      def resolved_engine
        configured_engine = UniversalRenderer.config.engine
        return configured_engine unless configured_engine == :auto

        env_key = Rails.env.to_s
        selected_engine = UniversalRenderer.config.engine_by_env[env_key]
        if selected_engine.nil?
          Rails.logger.warn(
            "No SSR engine mapping for Rails env '#{env_key}' with engine=:auto. Falling back to HTTP adapter.",
          )
          return :http
        end

        selected_engine
      end
    end
  end
end

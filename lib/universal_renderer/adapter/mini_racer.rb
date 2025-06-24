# frozen_string_literal: true

require_relative "base"
require "mini_racer"
require "connection_pool"

module UniversalRenderer
  module Adapter
    class MiniRacer < Base
      def initialize(options = {})
        @pool_size = options.fetch(:pool_size, 5)
        @timeout = options.fetch(:timeout, 5_000) # ms
        @max_memory = options.fetch(:max_memory, 256_000_000) # ~256 MB
        @bundle_path =
          options.fetch(
            :bundle_path,
            "app/assets/javascripts/universal_renderer/ssr_bundle.js"
          )
        @context_pool = nil
        setup
      end

      def call(url, props)
        return nil unless @context_pool

        begin
          with_context do |ctx|
            # Call the main render function with component name extracted from props
            props[:url] = url
            props = props.to_json
            Rails.logger.info("MiniRacer props: #{props}")
            result = ctx.call("UniversalSSR.render", props)

            # Convert JavaScript result to SSR::Response
            build_ssr_response(result)
          end
        rescue ::MiniRacer::RuntimeError, ::MiniRacer::SnapshotError => e
          Rails.logger.error(
            "MiniRacer SSR execution failed: #{e.message} (URL: #{url}) - #{e.backtrace.join("\n")}"
          )
          nil
        rescue StandardError => e
          Rails.logger.error(
            "MiniRacer SSR unexpected error: #{e.class.name} - #{e.message} (URL: #{url})"
          )
          nil
        end
      end

      def stream(url, props, template, response)
        # Streaming is not supported with MiniRacer
        Rails.logger.warn(
          "MiniRacer adapter does not support streaming SSR. Use HTTP adapter for streaming."
        )
        false
      end

      def supports_streaming?
        false
      end

      private

      def setup
        bundle_path = Rails.root.join(@bundle_path)

        unless File.exist?(bundle_path)
          Rails.logger.error(
            "MiniRacer SSR bundle not found at #{bundle_path}. " \
              "Please ensure the SSR bundle is available."
          )
          return
        end

        bundle_content = File.read(bundle_path)

        # Set single-threaded flag for Rails/Puma compatibility
        ::MiniRacer::Platform.set_flags!(:single_threaded)

        begin
          snapshot = ::MiniRacer::Snapshot.new(bundle_content)

          # Warm up the snapshot
          begin
            snapshot.warmup!("UniversalSSR.render('test', {}, '/')")
          rescue ::MiniRacer::RuntimeError
            # Ignore warm-up failures
            Rails.logger.debug(
              "MiniRacer SSR snapshot warm-up failed (non-critical)"
            )
          end

          @context_pool =
            ConnectionPool.new(size: @pool_size, timeout: 5) do
              ::MiniRacer::Context.new(
                snapshot: snapshot,
                timeout: @timeout,
                max_memory: @max_memory
              )
            end

          Rails.logger.info(
            "Universal Renderer MiniRacer context pool (#{@pool_size}) initialized"
          )
        rescue StandardError => e
          Rails.logger.error(
            "Failed to initialize MiniRacer context pool: #{e.class.name} - #{e.message} - #{e.backtrace.join("\n")}"
          )
        end
      end

      def with_context
        return unless @context_pool
        @context_pool.with { |ctx| yield ctx }
      end

      def build_ssr_response(js_result)
        return nil unless js_result.is_a?(Hash)

        # Convert JavaScript object to SSR::Response
        UniversalRenderer::SSR::Response.new(
          head: js_result["head"] || js_result[:head],
          body: js_result["body"] || js_result[:body],
          body_attrs: js_result["bodyAttrs"] || js_result[:bodyAttrs] || {}
        )
      end
    end
  end
end

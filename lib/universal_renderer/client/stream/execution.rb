require_relative "../http_pool"

module UniversalRenderer
  module Client
    class Stream
      module Execution
        def self.perform_streaming(
          http_client,
          http_post_request,
          response,
          stream_uri,
          &on_failure
        )
          success = false
          chunks_written = false
          upstream_connection = nil

          begin
            http_client.request(http_post_request) do |node_res, connection|
              upstream_connection = connection

              if node_res.is_a?(Net::HTTPSuccess)
                node_res.read_body do |chunk|
                  # A stream write can fail after handing bytes to the response
                  # buffer. Mark it first so the caller never falls back onto a
                  # potentially partial response.
                  chunks_written = true
                  response.stream.write(chunk)
                end
                success = true
              else
                error =
                  StandardError.new(
                    "SSR stream server responded with " \
                      "#{node_res.code} #{node_res.message}"
                  )
                UniversalRenderer.log do |log|
                  log.error(
                    "SSR stream server at #{stream_uri} responded with #{node_res.code} #{node_res.message}."
                  )
                end
                on_failure&.call(
                  error,
                  outcome: :http_error,
                  status: node_res.code.to_i,
                  stage: :response
                )
              end
            end
          rescue StandardError => e
            UniversalRenderer.log do |log|
              log.error(
                "Error during SSR data transfer or stream writing from #{stream_uri}: #{e.class.name} - #{e.message}"
              )
            end

            # The response may be only partially consumed, so do not reuse the
            # current persistent connection. Net::HTTP can also raise after its
            # request block returns while it finalizes that response body.
            HttpPool.close(upstream_connection) if upstream_connection
            on_failure&.call(
              e,
              outcome: failure_outcome(e),
              stage: :transfer
            )
            success = chunks_written
          ensure
            response.stream.close if success && !response.stream.closed?
          end

          success
        end

        def self.failure_outcome(error)
          return :timeout if error.is_a?(Net::OpenTimeout) ||
                             error.is_a?(Net::ReadTimeout)

          :error
        end

        private_class_method :failure_outcome
      end
    end
  end
end

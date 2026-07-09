require_relative "../http_pool"

module UniversalRenderer
  module Client
    class Stream
      module Execution
        def self.perform_streaming(
          http_client,
          http_post_request,
          response,
          stream_uri
        )
          success = false
          chunks_written = false

          http_client.request(http_post_request) do |node_res, upstream_connection|
            if node_res.is_a?(Net::HTTPSuccess)
              begin
                node_res.read_body do |chunk|
                  response.stream.write(chunk)
                  chunks_written = true
                end
                success = true
              rescue StandardError => e
                Rails.logger.error(
                  "Error during SSR data transfer or stream writing from #{stream_uri}: #{e.class.name} - #{e.message}"
                )
                # The upstream response body may be only partially consumed, so
                # do not return this persistent connection to the reusable pool.
                HttpPool.close(upstream_connection) if upstream_connection

                # Once bytes have reached the response stream, fallback rendering
                # would append a second document. Treat the stream as handled and
                # close it; if nothing was written, allow the caller to fallback.
                success = chunks_written
              ensure
                response.stream.close if success && !response.stream.closed?
              end
            else
              Rails.logger.error(
                "SSR stream server at #{stream_uri} responded with #{node_res.code} #{node_res.message}."
              )
            end
          end

          success
        end
      end
    end
  end
end

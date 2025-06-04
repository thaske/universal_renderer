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

          http_client.request(http_post_request) do |node_res|
            if node_res.is_a?(Net::HTTPSuccess)
              node_res.read_body { |chunk| response.stream.write(chunk) }
              success = true
            else
              Rails.logger.error(
                "SSR stream server at #{stream_uri} responded with #{node_res.code} #{node_res.message}."
              )

              # Close stream without forwarding error to allow fallback to client rendering
              response.stream.close unless response.stream.closed?
            end
          rescue StandardError => e
            Rails.logger.error(
              "Error during SSR data transfer or stream writing from #{stream_uri}: #{e.class.name} - #{e.message}"
            )
          ensure
            response.stream.close unless response.stream.closed?
          end

          success
        end
      end
    end
  end
end

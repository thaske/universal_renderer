module UniversalRenderer
  class StreamClient
    module Execution
      class << self
        def _perform_streaming(
          http_client,
          http_post_request,
          response,
          stream_uri
        )
          http_client.request(http_post_request) do |node_res|
            Execution._handle_node_response_streaming(
              node_res,
              response,
              stream_uri
            )

            return true
          end
          false
        end

        def _handle_node_response_streaming(node_res, response, stream_uri)
          if node_res.is_a?(Net::HTTPSuccess)
            Execution._stream_response_body(node_res, response.stream)
          else
            Execution._handle_streaming_for_node_error(
              node_res,
              response,
              stream_uri
            )
          end
        rescue StandardError => e
          Rails.logger.error(
            "Error during SSR data transfer or stream writing from #{stream_uri}: #{e.class.name} - #{e.message}"
          )

          Execution._write_generic_html_error(
            response.stream,
            "Streaming Error",
            "<p>A problem occurred while loading content. Please refresh.</p>"
          )
        ensure
          response.stream.close unless response.stream.closed?
        end

        def _stream_response_body(source_http_response, target_io_stream)
          source_http_response.read_body do |chunk|
            target_io_stream.write(chunk)
          end
        end

        def _handle_streaming_for_node_error(node_res, response, stream_uri)
          Rails.logger.error(
            "SSR stream server at #{stream_uri} responded with #{node_res.code} #{node_res.message}."
          )

          is_potentially_viewable_error =
            node_res["Content-Type"]&.match?(%r{text/html}i)

          if is_potentially_viewable_error
            Rails.logger.info(
              "Attempting to stream HTML error page from Node SSR server."
            )
            Execution._stream_response_body(node_res, response.stream)
          else
            Rails.logger.warn(
              "Node SSR server error response Content-Type ('#{node_res["Content-Type"]}') is not text/html. " \
                "Injecting generic error message into the stream."
            )

            Execution._write_generic_html_error(
              response.stream,
              "Application Error",
              "<p>There was an issue rendering this page. Please try again later.</p>"
            )
          end
        end

        def _write_generic_html_error(stream, title_text, message_html_fragment)
          return if stream.closed?

          stream.write("<h1>#{title_text}</h1>#{message_html_fragment}")
        end
      end
    end
  end
end

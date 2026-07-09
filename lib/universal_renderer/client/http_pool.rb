# frozen_string_literal: true

require "connection_pool"
require "net/http"

module UniversalRenderer
  module Client
    # Thread-safe pool of persistent Net::HTTP connections keyed by SSR origin.
    #
    # Net::HTTP instances are not thread-safe, so each pooled connection is
    # checked out exclusively. Keeping them started allows Net::HTTP to reuse
    # the underlying TCP connection for sequential SSR requests.
    class HttpPool
      class ClientProxy
        def initialize(uri, timeout)
          @uri = uri
          @timeout = timeout
        end

        def request(http_request, &block)
          if block
            HttpPool.request(@uri, @timeout, http_request) do |response, http|
              block.call(response, http)
            end
          else
            HttpPool.request(@uri, @timeout, http_request)
          end
        end
      end

      class << self
        def client(uri, timeout)
          ClientProxy.new(uri, timeout)
        end

        def request(uri, timeout, http_request)
          with_connection(uri, timeout) do |http|
            if block_given?
              http.request(http_request) { |response| yield(response, http) }
            else
              http.request(http_request)
            end
          end
        end

        def reset!
          mutex.synchronize do
            pools.each_value { |pool| pool.shutdown { |http| close(http) } }
            pools.clear
          end
        end

        def close(http)
          http.finish if http.started?
        rescue IOError
          # Already closed by the peer or by another cleanup path.
        end

        private

        def with_connection(uri, timeout)
          pool_for(uri, timeout).with do |http|
            ensure_started(http)
            yield http
          rescue StandardError
            close(http)
            raise
          end
        end

        def pool_for(uri, timeout)
          key = pool_key(uri, timeout)

          mutex.synchronize do
            pools[key] ||= ConnectionPool.new(
              size: pool_size,
              timeout: timeout
            ) { build_connection(uri, timeout) }
          end
        end

        def build_connection(uri, timeout)
          Net::HTTP
            .new(uri.host, uri.port)
            .tap do |http|
              http.use_ssl = (uri.scheme == "https")
              http.open_timeout = timeout
              http.read_timeout = timeout
            end
        end

        def ensure_started(http)
          http.start unless http.started?
        end

        def pool_key(uri, timeout)
          [uri.scheme, uri.host, uri.port, timeout, pool_size].join(":")
        end

        def pool_size
          UniversalRenderer.config.http.pool_size
        end

        def pools
          @pools ||= {}
        end

        def mutex
          @mutex ||= Mutex.new
        end
      end
    end
  end
end

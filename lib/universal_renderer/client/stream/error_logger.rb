module UniversalRenderer
  module Client
    class Stream
      module ErrorLogger
        def self.log_setup_error(error, target_uri_string)
          backtrace_info = error.backtrace&.first || "No backtrace available"
          UniversalRenderer.log do |log|
            log.error(
              "Unexpected error during SSR stream setup for #{target_uri_string}: " \
                "#{error.class.name} - #{error.message} at #{backtrace_info}"
            )
          end
        end

        def self.log_connection_error(error, target_uri_string)
          UniversalRenderer.log do |log|
            log.error(
              "SSR stream connection to #{target_uri_string} failed: #{error.class.name} - #{error.message}"
            )
          end
        end

        def self.log_unexpected_error(error, target_uri_string, context_message)
          backtrace_info = error.backtrace&.first || "No backtrace available"
          UniversalRenderer.log do |log|
            log.error(
              "#{context_message} for #{target_uri_string}: " \
                "#{error.class.name} - #{error.message} at #{backtrace_info}"
            )
          end
        end
      end
    end
  end
end

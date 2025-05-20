module UniversalRenderer
  module Client
    class Stream
      module ErrorLogger
        class << self
          def _log_setup_error(error, target_uri_string)
            backtrace_info = error.backtrace&.first || "No backtrace available"
            Rails.logger.error(
              "Unexpected error during SSR stream setup for #{target_uri_string}: " \
                "#{error.class.name} - #{error.message} at #{backtrace_info}"
            )
          end

          def _log_connection_error(error, target_uri_string)
            Rails.logger.error(
              "SSR stream connection to #{target_uri_string} failed: #{error.class.name} - #{error.message}"
            )
          end

          def _log_unexpected_error(error, target_uri_string, context_message)
            backtrace_info = error.backtrace&.first || "No backtrace available"
            Rails.logger.error(
              "#{context_message} for #{target_uri_string}: " \
                "#{error.class.name} - #{error.message} at #{backtrace_info}"
            )
          end
        end
      end
    end
  end
end

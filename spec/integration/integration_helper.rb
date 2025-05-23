# frozen_string_literal: true

require_relative "server_helpers"
require_relative "contract_helpers"
require_relative "integration_environment"
require_relative "test_result_analyzer"
require_relative "client_integration_tester"

module IntegrationHelpers
  include ServerHelpers
  include ContractHelpers
  include IntegrationEnvironment
  include TestResultAnalyzer
  include ClientIntegrationTester

  # Runs a comprehensive contract test suite against an SSR server
  #
  # @param base_url [String] Base URL of the SSR server
  # @return [Hash] Complete test results
  def run_full_contract_test_suite(base_url)
    results = { health: nil, ssr: nil, stream: nil, errors: nil, summary: {} }

    begin
      # Test health endpoint
      results[:health] = test_health_endpoint(base_url)

      # Test standard SSR endpoint
      results[:ssr] = test_ssr_endpoint(base_url)

      # Test streaming endpoint
      results[:stream] = test_stream_endpoint(base_url)

      # Test error handling
      results[:errors] = test_error_contracts(base_url)

      # Generate summary
      results[:summary] = generate_test_summary(results)
    rescue StandardError => e
      results[:fatal_error] = {
        message: e.message,
        backtrace: e.backtrace&.first(5)
      }
    end

    results
  end
end

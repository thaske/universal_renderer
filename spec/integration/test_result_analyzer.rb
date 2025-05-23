# frozen_string_literal: true

module TestResultAnalyzer
  # Generates a summary of test results
  def generate_test_summary(results)
    summary = initialize_summary

    process_health_results(results[:health], summary)
    process_ssr_results(results[:ssr], summary)
    process_stream_results(results[:stream], summary)
    process_error_results(results[:errors], summary)

    calculate_success_rate(summary)
    summary
  end

  private

  # Initializes the summary structure
  def initialize_summary
    { total_tests: 0, passed: 0, failed: 0, endpoints_tested: [], issues: [] }
  end

  # Processes health endpoint test results
  def process_health_results(health_result, summary)
    return unless health_result

    summary[:total_tests] += 1
    summary[:endpoints_tested] << "health"

    if health_result[:success] && !health_result[:contract_errors]
      summary[:passed] += 1
    else
      summary[:failed] += 1
      error_message = health_result[:contract_errors] || "HTTP error"
      summary[:issues] << "Health endpoint: #{error_message}"
    end
  end

  # Processes SSR endpoint test results
  def process_ssr_results(ssr_result, summary)
    return unless ssr_result

    summary[:total_tests] += 1
    summary[:endpoints_tested] << "ssr"

    if ssr_result[:success] && !ssr_result[:content_errors]
      summary[:passed] += 1
    else
      summary[:failed] += 1
      error_message = ssr_result[:content_errors] || "HTTP error"
      summary[:issues] << "SSR endpoint: #{error_message}"
    end
  end

  # Processes stream endpoint test results
  def process_stream_results(stream_result, summary)
    return unless stream_result

    summary[:total_tests] += 1
    summary[:endpoints_tested] << "stream"

    if stream_result[:success] && !stream_result[:content_errors]
      summary[:passed] += 1
    else
      summary[:failed] += 1
      error_message = stream_result[:content_errors] || "HTTP error"
      summary[:issues] << "Stream endpoint: #{error_message}"
    end
  end

  # Processes error handling test results
  def process_error_results(error_results, summary)
    return unless error_results

    error_tests = error_results.keys
    summary[:total_tests] += error_tests.length
    summary[:endpoints_tested] << "error_handling"

    error_tests.each do |test_name|
      process_single_error_test(test_name, error_results[test_name], summary)
    end
  end

  # Processes a single error test result
  def process_single_error_test(test_name, error_result, summary)
    if error_result[:status] && error_result[:status] >= 400
      summary[:passed] += 1
    else
      summary[:failed] += 1
      status = error_result[:status]
      summary[:issues] << "Error test #{test_name}: unexpected status #{status}"
    end
  end

  # Calculates and sets the success rate
  def calculate_success_rate(summary)
    summary[:success_rate] = if summary[:total_tests] > 0
      (summary[:passed].to_f / summary[:total_tests] * 100).round(2)
    else
      0
    end
  end
end

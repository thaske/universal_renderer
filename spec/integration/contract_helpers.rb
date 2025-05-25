# frozen_string_literal: true

require "net/http"
require "json"
require "uri"

module IntegrationHelpers
  # JSON Schema definitions for request/response validation
  module Schemas
    # Expected structure for SSR requests from Ruby to Node
    SSR_REQUEST_SCHEMA = {
      type: "object",
      required: %w[url props],
      properties: {
        url: {
          type: "string"
        },
        props: {
          type: "object"
        },
        template: {
          type: "string"
        } # Only required for streaming
      }
    }.freeze

    # Expected structure for SSR responses from Node to Ruby
    SSR_RESPONSE_SCHEMA = {
      type: "object",
      required: %w[head body],
      properties: {
        head: {
          type: "string"
        },
        body: {
          type: "string"
        },
        body_attrs: {
          type: "object"
        }
      }
    }.freeze

    # Expected structure for streaming requests
    STREAM_REQUEST_SCHEMA = {
      type: "object",
      required: %w[url props template],
      properties: {
        url: {
          type: "string"
        },
        props: {
          type: "object"
        },
        template: {
          type: "string"
        }
      }
    }.freeze
  end

  # HTTP request utilities for contract testing
  module HttpHelpers
    # Makes a basic HTTP POST request to the given endpoint
    #
    # @param base_url [String] The base URL of the SSR server
    # @param endpoint [String] The endpoint to test
    # @param request_body [Hash] The request body to send
    # @return [Net::HTTPResponse] The HTTP response
    def make_http_request(base_url, endpoint, request_body: nil)
      uri = URI.join(base_url, endpoint)
      http = Net::HTTP.new(uri.host, uri.port)
      http.open_timeout = 5
      http.read_timeout = 10

      # Use GET for health endpoint, POST for others
      if endpoint == "/health"
        request = Net::HTTP::Get.new(uri.request_uri)
      else
        request = Net::HTTP::Post.new(uri.request_uri)
        request["Content-Type"] = "application/json"
        request.body = request_body.to_json if request_body
      end

      http.request(request)
    end

    # Parses HTTP response into a structured result hash
    #
    # @param response [Net::HTTPResponse] The HTTP response
    # @param expected_status [Integer] Expected HTTP status code
    # @return [Hash] Structured response data
    def parse_http_response(response, expected_status: 200)
      result = {
        status: response.code.to_i,
        headers: response.to_hash,
        body: response.body,
        success: response.is_a?(Net::HTTPSuccess)
      }

      parse_json_response(response, result)
      validate_status_code(result, expected_status)

      result
    end

    private

    def parse_json_response(response, result)
      return unless response["content-type"]&.include?("application/json")

      result[:json] = JSON.parse(response.body, symbolize_names: true)
    rescue JSON::ParserError => e
      result[:json_error] = e.message
    end

    def validate_status_code(result, expected_status)
      return if result[:status] == expected_status

      result[
        :status_error
      ] = "Expected status #{expected_status}, got #{result[:status]}"
    end
  end

  # Schema validation utilities
  module SchemaValidator
    include Schemas

    # Validates request schema based on endpoint
    def validate_request_schema(endpoint, request_body)
      schema = schema_for_endpoint(endpoint)
      return unless schema

      validate_json_schema(request_body, schema, "Request for #{endpoint}")
    end

    # Validates response schema based on endpoint
    def validate_response_schema(endpoint, response_json)
      return unless endpoint == "/"

      validate_json_schema(
        response_json,
        SSR_RESPONSE_SCHEMA,
        "Response from #{endpoint}"
      )
    end

    # Simple JSON schema validator
    def validate_json_schema(data, schema, context)
      errors = []
      errors.concat(validate_required_fields(data, schema, context))
      errors.concat(validate_field_types(data, schema, context))

      return if errors.empty?

      raise "Schema validation failed: #{errors.join(", ")}"
    end

    private

    def schema_for_endpoint(endpoint)
      case endpoint
      when "/"
        SSR_REQUEST_SCHEMA
      when "/stream"
        STREAM_REQUEST_SCHEMA
      end
    end

    def validate_required_fields(data, schema, context)
      errors = []
      schema[:required]&.each do |field|
        next if field_present_in_data?(data, field)

        errors << "#{context}: Missing required field '#{field}'"
      end
      errors
    end

    def validate_field_types(data, schema, context)
      errors = []
      schema[:properties]&.each do |field, field_schema|
        value = extract_field_value(data, field)
        next unless value

        expected_type = field_schema[:type]
        actual_type = ruby_type_to_json_type(value.class)

        next if actual_type == expected_type

        errors << "#{context}: Field '#{field}' should be #{expected_type}, got #{actual_type}"
      end
      errors
    end

    def field_present_in_data?(data, field)
      data.key?(field) || data.key?(field.to_s) || data.key?(field.to_sym)
    end

    def extract_field_value(data, field)
      data[field] || data[field.to_s] || data[field.to_sym]
    end

    def ruby_type_to_json_type(ruby_class)
      case ruby_class.name
      when "String"
        "string"
      when "Integer", "Float"
        "number"
      when "TrueClass", "FalseClass"
        "boolean"
      when "Array"
        "array"
      when "Hash"
        "object"
      when "NilClass"
        "null"
      else
        "unknown"
      end
    end
  end

  # Content validation utilities
  module ContentValidator
    # Validates SSR response content
    def validate_ssr_response_content(json, result)
      errors = []
      errors << check_html_content(json[:head], "Head")
      errors << check_html_content(json[:body], "Body")
      errors.compact!

      result[:content_errors] = errors unless errors.empty?
    end

    # Validates streaming response content
    def validate_stream_response_content(html, result)
      errors = []
      errors << check_html_structure(html)
      errors << check_ssr_markers_replaced(html)
      errors.compact!

      result[:content_errors] = errors unless errors.empty?
    end

    private

    def check_html_content(content, content_type)
      return if content.blank?
      return if content.include?("<") || content.include?(">")

      "#{content_type} content doesn't appear to be HTML"
    end

    def check_html_structure(html)
      return if html.include?("<html") || html.include?("<HTML")

      "Response doesn't appear to be HTML"
    end

    def check_ssr_markers_replaced(html)
      markers = ["<!-- SSR_HEAD -->", "<!-- SSR_BODY -->"]
      unreplaced = markers.select { |marker| html.include?(marker) }
      return if unreplaced.empty?

      unreplaced.map do |marker|
        "#{marker.gsub(/[<>!-]/, "")} marker was not replaced"
      end
    end
  end

  # Error contract testing utilities
  module ErrorTesting
    include HttpHelpers

    # Tests error handling contracts
    #
    # @param base_url [String] The base URL of the SSR server
    # @return [Hash] Validation results for various error scenarios
    def test_error_contracts(base_url)
      {
        missing_url: test_missing_url_error(base_url),
        missing_template: test_missing_template_error(base_url),
        invalid_json: test_invalid_json_error(base_url),
        not_found: test_not_found_error(base_url)
      }
    end

    private

    def test_missing_url_error(base_url)
      make_contract_request(
        base_url,
        "/",
        request_body: {
          props: {
          }
        },
        expected_status: 400,
        skip_validation: true
      )
    end

    def test_missing_template_error(base_url)
      make_contract_request(
        base_url,
        "/stream",
        request_body: {
          url: "http://example.com",
          props: {
          }
        },
        expected_status: 400,
        skip_validation: true
      )
    end

    def test_invalid_json_error(base_url)
      uri = URI.join(base_url, "/")
      http = Net::HTTP.new(uri.host, uri.port)
      request = Net::HTTP::Post.new(uri.request_uri)
      request["Content-Type"] = "application/json"
      request.body = "invalid json"

      response = http.request(request)
      {
        status: response.code.to_i,
        success: response.is_a?(Net::HTTPSuccess),
        body: response.body
      }
    end

    def test_not_found_error(base_url)
      make_contract_request(base_url, "/nonexistent", expected_status: 404)
    end

    # Delegate to ContractHelpers for contract request functionality
    def make_contract_request(
      base_url,
      endpoint,
      request_body: nil,
      expected_status: 200,
      skip_validation: false
    )
      # This method will be called from the including module
      super
    end
  end

  # Main contract testing helpers
  module ContractHelpers
    include HttpHelpers
    include SchemaValidator
    include ContentValidator
    include ErrorTesting

    # Makes an HTTP request to the SSR server and validates the contract
    #
    # @param base_url [String] The base URL of the SSR server
    # @param endpoint [String] The endpoint to test (/, /stream, /health)
    # @param request_body [Hash] The request body to send
    # @param expected_status [Integer] Expected HTTP status code
    # @param skip_validation [Boolean] Skip request schema validation (for error tests)
    # @return [Hash] Response data with validation results
    def make_contract_request(
      base_url,
      endpoint,
      request_body: nil,
      expected_status: 200,
      skip_validation: false
    )
      if request_body && !skip_validation
        validate_request_schema(endpoint, request_body)
      end

      response =
        make_http_request(base_url, endpoint, request_body: request_body)
      result = parse_http_response(response, expected_status: expected_status)

      if result[:success] && result[:json]
        validate_successful_json_response(endpoint, result)
      end

      result
    end

    # Tests the health endpoint contract
    #
    # @param base_url [String] The base URL of the SSR server
    # @return [Hash] Validation results
    def test_health_endpoint(base_url)
      result = make_contract_request(base_url, "/health")
      validate_health_response(result) if result[:success] && result[:json]
      result
    end

    # Tests the standard SSR endpoint contract
    #
    # @param base_url [String] The base URL of the SSR server
    # @param url [String] The URL to render
    # @param props [Hash] Props to pass to the renderer
    # @return [Hash] Validation results
    def test_ssr_endpoint(base_url, url: "http://example.com/test", props: {})
      request_body = { url: url, props: props }
      result = make_contract_request(base_url, "/", request_body: request_body)

      if result[:success] && result[:json]
        validate_ssr_response_content(result[:json], result)
      end

      result
    end

    # Tests the streaming SSR endpoint contract
    #
    # @param base_url [String] The base URL of the SSR server
    # @param url [String] The URL to render
    # @param props [Hash] Props to pass to the renderer
    # @param template [String] HTML template with SSR markers
    # @return [Hash] Validation results
    def test_stream_endpoint(
      base_url,
      url: "http://example.com/test",
      props: {},
      template: nil
    )
      template ||= default_test_template
      request_body = { url: url, props: props, template: template }

      validate_request_schema("/stream", request_body)

      response =
        make_http_request(base_url, "/stream", request_body: request_body)
      result = parse_http_response(response)

      if result[:success]
        validate_stream_response_content(response.body, result)
      end

      result
    end

    private

    def validate_successful_json_response(endpoint, result)
      validate_response_schema(endpoint, result[:json])
    end

    def validate_health_response(result)
      json = result[:json]
      errors = []

      errors.concat(validate_health_fields(json))
      errors << validate_health_status(json)
      errors << validate_health_timestamp(json)
      errors.compact!

      result[:contract_errors] = errors unless errors.empty?
    end

    def validate_health_fields(json)
      errors = []
      errors << "Missing 'status' field" unless json.key?(:status)
      errors << "Missing 'timestamp' field" unless json.key?(:timestamp)
      errors
    end

    def validate_health_status(json)
      return if json[:status] == "OK"

      "Status should be 'OK'"
    end

    def validate_health_timestamp(json)
      return unless json[:timestamp]

      Time.zone.parse(json[:timestamp])
      nil
    rescue ArgumentError
      "Invalid timestamp format"
    end

    def default_test_template
      <<~HTML
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <!-- SSR_HEAD -->
        </head>
        <body>
          <div id="root">
            <!-- SSR_BODY -->
          </div>
        </body>
        </html>
      HTML
    end
  end
end

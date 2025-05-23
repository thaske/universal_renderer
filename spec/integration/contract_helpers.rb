# frozen_string_literal: true

require "net/http"
require "json"
require "uri"

module IntegrationHelpers
  module ContractHelpers
    # JSON schema definitions for request/response validation

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
      uri = URI.join(base_url, endpoint)

      http = Net::HTTP.new(uri.host, uri.port)
      http.open_timeout = 5
      http.read_timeout = 10

      request = Net::HTTP::Post.new(uri.request_uri)
      request["Content-Type"] = "application/json"

      if request_body
        request.body = request_body.to_json
        validate_request_schema(endpoint, request_body) unless skip_validation
      end

      response = http.request(request)

      result = {
        status: response.code.to_i,
        headers: response.to_hash,
        body: response.body,
        success: response.is_a?(Net::HTTPSuccess)
      }

      # Parse JSON response if applicable
      if response["content-type"]&.include?("application/json")
        begin
          result[:json] = JSON.parse(response.body, symbolize_names: true)
          validate_response_schema(endpoint, result[:json]) if result[:success]
        rescue JSON::ParserError => e
          result[:json_error] = e.message
        end
      end

      # Validate expected status
      unless result[:status] == expected_status
        result[
          :status_error
        ] = "Expected status #{expected_status}, got #{result[:status]}"
      end

      result
    end

    # Tests the health endpoint contract
    #
    # @param base_url [String] The base URL of the SSR server
    # @return [Hash] Validation results
    def test_health_endpoint(base_url)
      result = make_contract_request(base_url, "/health")

      if result[:success] && result[:json]
        # Validate health response structure
        json = result[:json]
        errors = []

        errors << "Missing 'status' field" unless json.key?(:status)
        errors << "Missing 'timestamp' field" unless json.key?(:timestamp)
        errors << "Status should be 'OK'" unless json[:status] == "OK"

        # Validate timestamp format
        if json[:timestamp]
          begin
            Time.parse(json[:timestamp])
          rescue ArgumentError
            errors << "Invalid timestamp format"
          end
        end

        result[:contract_errors] = errors unless errors.empty?
      end

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

      # Stream endpoint returns HTML, not JSON
      uri = URI.join(base_url, "/stream")
      http = Net::HTTP.new(uri.host, uri.port)
      http.open_timeout = 5
      http.read_timeout = 10

      request = Net::HTTP::Post.new(uri.request_uri)
      request["Content-Type"] = "application/json"
      request.body = request_body.to_json

      validate_request_schema("/stream", request_body)

      response = http.request(request)

      result = {
        status: response.code.to_i,
        headers: response.to_hash,
        body: response.body,
        success: response.is_a?(Net::HTTPSuccess)
      }

      if result[:success]
        validate_stream_response_content(response.body, result)
      end

      result
    end

    # Tests error handling contracts
    #
    # @param base_url [String] The base URL of the SSR server
    # @return [Hash] Validation results for various error scenarios
    def test_error_contracts(base_url)
      results = {}

      # Test missing URL in SSR request
      results[:missing_url] = make_contract_request(
        base_url,
        "/",
        request_body: {
          props: {
          }
        },
        expected_status: 400,
        skip_validation: true
      )

      # Test missing template in stream request
      results[:missing_template] = make_contract_request(
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

      # Test invalid JSON
      uri = URI.join(base_url, "/")
      http = Net::HTTP.new(uri.host, uri.port)
      request = Net::HTTP::Post.new(uri.request_uri)
      request["Content-Type"] = "application/json"
      request.body = "invalid json"

      response = http.request(request)
      results[:invalid_json] = {
        status: response.code.to_i,
        success: response.is_a?(Net::HTTPSuccess),
        body: response.body
      }

      # Test 404 endpoint
      results[:not_found] = make_contract_request(
        base_url,
        "/nonexistent",
        expected_status: 404
      )

      results
    end

    private

    # Validates request schema based on endpoint
    def validate_request_schema(endpoint, request_body)
      schema =
        case endpoint
        when "/"
          SSR_REQUEST_SCHEMA
        when "/stream"
          STREAM_REQUEST_SCHEMA
        else
          return # No validation for other endpoints
        end

      validate_json_schema(request_body, schema, "Request for #{endpoint}")
    end

    # Validates response schema based on endpoint
    def validate_response_schema(endpoint, response_json)
      return unless endpoint == "/" # Only validate SSR responses

      validate_json_schema(
        response_json,
        SSR_RESPONSE_SCHEMA,
        "Response from #{endpoint}"
      )
    end

    # Simple JSON schema validator
    def validate_json_schema(data, schema, context)
      errors = []

      # Check required fields
      if schema[:required]
        schema[:required].each do |field|
          unless data.key?(field) || data.key?(field.to_s) ||
                   data.key?(field.to_sym)
            errors << "#{context}: Missing required field '#{field}'"
          end
        end
      end

      # Check field types
      if schema[:properties]
        schema[:properties].each do |field, field_schema|
          value = data[field] || data[field.to_s] || data[field.to_sym]
          next unless value

          expected_type = field_schema[:type]
          actual_type = ruby_type_to_json_type(value.class)

          unless actual_type == expected_type
            errors << "#{context}: Field '#{field}' should be #{expected_type}, got #{actual_type}"
          end
        end
      end

      unless errors.empty?
        raise "Schema validation failed: #{errors.join(", ")}"
      end
    end

    # Maps Ruby types to JSON schema types
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

    # Validates SSR response content
    def validate_ssr_response_content(json, result)
      errors = []

      # Check that head contains some HTML
      if json[:head] && !json[:head].empty?
        unless json[:head].include?("<") || json[:head].include?(">")
          errors << "Head content doesn't appear to be HTML"
        end
      end

      # Check that body contains some HTML
      if json[:body] && !json[:body].empty?
        unless json[:body].include?("<") || json[:body].include?(">")
          errors << "Body content doesn't appear to be HTML"
        end
      end

      result[:content_errors] = errors unless errors.empty?
    end

    # Validates streaming response content
    def validate_stream_response_content(html, result)
      errors = []

      # Check basic HTML structure
      unless html.include?("<html") || html.include?("<HTML")
        errors << "Response doesn't appear to be HTML"
      end

      # Check that SSR markers have been replaced
      if html.include?("<!-- SSR_HEAD -->")
        errors << "SSR_HEAD marker was not replaced"
      end

      if html.include?("<!-- SSR_BODY -->")
        errors << "SSR_BODY marker was not replaced"
      end

      result[:content_errors] = errors unless errors.empty?
    end

    # Default HTML template for streaming tests
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

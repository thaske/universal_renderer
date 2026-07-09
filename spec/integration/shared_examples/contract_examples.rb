# frozen_string_literal: true

RSpec.shared_examples "SSR contract compliance" do |engine_type|
  describe "SSR rendering" do
    it "accepts valid SSR requests and returns proper JSON structure" do
      test_props = {
        user_id: 123,
        page_data: {
          title: "Test Page",
          meta: "description"
        },
        array_data: [1, 2, 3]
      }

      result = if engine_type == :http
        test_ssr_endpoint(
            server_url,
            url: "http://example.com/test-page",
            props: test_props
          )
      else
        # For STDIO mode, test via the adapter directly
        test_stdio_adapter(
            url: "http://example.com/test-page",
            props: test_props
          )
               end

      expect(result[:success]).to be true
      expect(result[:status]).to eq 200 if engine_type == :http
      
      if engine_type == :http
        expect(result[:json]).to include(
          head: be_a(String),
          body: be_a(String)
        )
      else
        expect(result[:response]).to be_a(UniversalRenderer::SSR::Response)
        expect(result[:response].head).to be_a(String)
        expect(result[:response].body).to be_a(String)
      end
    end

    it "handles empty props correctly" do
      result = if engine_type == :http
        test_ssr_endpoint(server_url, props: {})
      else
        test_stdio_adapter(props: {})
               end

      expect(result[:success]).to be true
      
      if engine_type == :http
        expect(result[:json]).to be_a(Hash)
        expect(result[:json]).to have_key(:head)
        expect(result[:json]).to have_key(:body)
      else
        expect(result[:response]).to be_a(UniversalRenderer::SSR::Response)
        expect(result[:response].head).to be_a(String)
        expect(result[:response].body).to be_a(String)
      end
    end

    it "processes complex nested data structures" do
      complex_props = {
        user: {
          id: 123,
          profile: {
            name: "Test User",
            settings: {
              theme: "dark",
              notifications: true
            }
          }
        },
        metadata: {
          page_type: "product",
          tracking: %w[analytics performance]
        }
      }

      result = if engine_type == :http
        test_ssr_endpoint(server_url, props: complex_props)
      else
        test_stdio_adapter(props: complex_props)
               end

      expect(result[:success]).to be true
    end
  end

  describe "Ruby client integration" do
    it "integrates properly with UniversalRenderer::Client::Base" do
      results = if engine_type == :http
        test_ruby_client_integration(server_url)
      else
        test_ruby_client_integration_stdio
                end
base_result = results[:base_client]

      expect(base_result[:success]).to be true
      expect(base_result[:response]).to be_a(UniversalRenderer::SSR::Response)
      expect(base_result[:has_head]).to be true
      expect(base_result[:has_body]).to be true
    end
  end
end

RSpec.shared_examples "streaming SSR support" do
  let(:test_template) { <<~HTML }
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
        <script>console.log('app loaded');</script>
      </body>
      </html>
    HTML

  describe "streaming SSR" do
    it "accepts valid streaming requests" do
      result =
        test_stream_endpoint(
          server_url,
          url: "http://example.com/stream-test",
          props: {
            stream_test: true
          },
          template: test_template
        )

      expect(result[:success]).to be true
      expect(result[:status]).to eq 200
      expect(result[:content_errors]).to be_nil
    end

    it "returns HTML content type" do
      result = test_stream_endpoint(server_url, template: test_template)

      expect(result[:success]).to be true
      expect(result[:headers]["content-type"].join).to include("text/html")
    end

    it "replaces SSR markers in the template" do
      result = test_stream_endpoint(server_url, template: test_template)

      expect(result[:success]).to be true
      expect(result[:body]).not_to include("<!-- SSR_HEAD -->")
      expect(result[:body]).not_to include("<!-- SSR_BODY -->")
      expect(result[:body]).to include("<html")
      expect(result[:body]).to include("</html>")
    end

    it "integrates with streaming client" do
      results = test_ruby_client_integration(server_url)
      stream_result = results[:stream_client]

      expect(stream_result[:success]).to be true
      expect(stream_result[:stream_closed]).to be true
      expect(stream_result[:stream_content]).to be_a(StringIO)
    end
  end
end

RSpec.shared_examples "stdio streaming support" do
  describe "streaming" do
    let(:stream_io) { StringIO.new }
    let(:response) do
      stream = stream_io
      stream_double = double("stream")
      allow(stream_double).to receive(:write) { |chunk| stream.write(chunk) }
      allow(stream_double).to receive(:closed?).and_return(false)
      allow(stream_double).to receive(:close)
      double("response", stream: stream_double)
    end

    it "supports streaming" do
      adapter = UniversalRenderer::AdapterFactory.adapter
      expect(adapter.supports_streaming?).to be true
    end

    it "relays streamed chunks into the response stream" do
      adapter = UniversalRenderer::AdapterFactory.adapter
      result = adapter.stream("http://example.com/x", {}, "template", response)

      expect(result).to be true
      expect(stream_io.string).to eq("<html>chunk-1chunk-2</html>")
    end
  end
end

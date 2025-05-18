require "rails_helper" # Or 'spec_helper' if not a full Rails context gem

RSpec.describe UniversalRenderer::StaticClient do
  let(:ssr_url) { "http://localhost:3001" }
  let(:page_url) { "/some/page" }
  let(:props) { { foo: "bar" } }
  let(:expected_ssr_response_body) { { rendered_html: "<p>Hello</p>" } }

  before do
    UniversalRenderer.configure do |config|
      config.ssr_url = ssr_url
      config.timeout = 1
    end
  end

  describe ".static" do
    context "when ssr_url is not configured" do
      before { UniversalRenderer.configure { |config| config.ssr_url = nil } }

      it "returns nil" do
        expect(described_class.static(page_url, props)).to be_nil
      end

      it "does not make an HTTP request" do
        described_class.static(page_url, props)
        expect(WebMock).not_to have_requested(:any, /.*/)
      end
    end

    context "when ssr_url is configured" do
      let(:expected_request_body) { { url: page_url, props: props }.to_json }
      let(:request_headers) { { "Content-Type" => "application/json" } }

      context "and the SSR server responds successfully" do
        before do
          stub_request(:post, "#{ssr_url}/").with(
            body: expected_request_body,
            headers: request_headers
          ).to_return(
            status: 200,
            body: expected_ssr_response_body.to_json,
            headers: {
              "Content-Type" => "application/json"
            }
          )
        end

        it "makes a POST request to the SSR server" do
          described_class.static(page_url, props)
          expect(WebMock).to have_requested(:post, "#{ssr_url}/").with(
            body: expected_request_body,
            headers: request_headers
          ).once
        end

        it "returns the parsed and symbolized JSON response" do
          response = described_class.static(page_url, props)
          expect(response).to eq(expected_ssr_response_body.deep_symbolize_keys)
        end
      end

      context "when the SSR server responds with a non-OK status" do
        before do
          stub_request(:post, "#{ssr_url}/").with(
            body: expected_request_body,
            headers: request_headers
          ).to_return(status: 500, body: "Server Error", headers: {})
        end

        it "returns nil" do
          expect(described_class.static(page_url, props)).to be_nil
        end

        it "logs an error" do
          expect(Rails.logger).to receive(:error).with(
            /SSR static request to .* failed: \d{3} - .*/
          )
          described_class.static(page_url, props)
        end
      end

      context "when the request times out" do
        before do
          stub_request(:post, "#{ssr_url}/").with(
            body: expected_request_body,
            headers: request_headers
          ).to_timeout
        end

        it "returns nil" do
          expect(described_class.static(page_url, props)).to be_nil
        end

        it "logs an error" do
          # Or it might raise its own timeout error that inherits from StandardError
          expect(Rails.logger).to receive(:error).with(
            /SSR static request to .* failed: (Net::OpenTimeout|Net::ReadTimeout).*/
          )
          described_class.static(page_url, props)
        end
      end

      context "when the SSR server responds with malformed JSON" do
        before do
          stub_request(:post, "#{ssr_url}/").with(
            body: expected_request_body,
            headers: request_headers
          ).to_return(
            status: 200,
            body: "not json",
            headers: {
              "Content-Type" => "application/json"
            }
          )
        end

        it "returns nil" do
          expect(described_class.static(page_url, props)).to be_nil
        end

        it "logs an error" do
          expect(Rails.logger).to receive(:error).with(
            /SSR static request to .* failed: JSON::ParserError/
          )
          described_class.static(page_url, props)
        end
      end
    end
  end
end

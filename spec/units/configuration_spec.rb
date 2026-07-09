# frozen_string_literal: true

RSpec.describe UniversalRenderer::Configuration do
  subject { described_class.new }

  describe "#initialize" do
    it "creates a new configuration instance" do
      expect(subject).to be_a(described_class)
    end

    it "sets default values" do
      expect(subject.engine).to eq(:http)
      expect(subject.timeout).to eq(3)
      expect(subject.stdio_cli_script).to eq("app/frontend/ssr/stdio.tsx")
      expect(subject.http_pool_size).to eq(5)
      expect(subject.stdio_pool_size).to eq(5)
      expect(subject.stdio_timeout).to eq(5_000)
    end

    it "reads engine from environment variable" do
      original_env = ENV.fetch("SSR_ENGINE", nil)
      ENV["SSR_ENGINE"] = "stdio"

      config = described_class.new
      expect(config.engine).to eq(:stdio)

      ENV["SSR_ENGINE"] = original_env
    end

    it "normalizes engine assignments" do
      subject.engine = "STDIO"
      expect(subject.engine).to eq(:stdio)
    end

    it "reads stdio_cli_script from environment variable" do
      original_env = ENV.fetch("SSR_STDIO_CLI_SCRIPT", nil)
      ENV["SSR_STDIO_CLI_SCRIPT"] = "custom/path/to/ssr.ts"

      config = described_class.new
      expect(config.stdio_cli_script).to eq("custom/path/to/ssr.ts")

      ENV["SSR_STDIO_CLI_SCRIPT"] = original_env
    end

    it "reads http_pool_size from environment variable" do
      original_env = ENV.fetch("SSR_HTTP_POOL_SIZE", nil)
      ENV["SSR_HTTP_POOL_SIZE"] = "10"

      config = described_class.new
      expect(config.http_pool_size).to eq(10)

      ENV["SSR_HTTP_POOL_SIZE"] = original_env
    end

    it "reads stdio_pool_size from environment variable" do
      original_env = ENV.fetch("SSR_STDIO_POOL_SIZE", nil)
      ENV["SSR_STDIO_POOL_SIZE"] = "10"

      config = described_class.new
      expect(config.stdio_pool_size).to eq(10)

      ENV["SSR_STDIO_POOL_SIZE"] = original_env
    end

    it "reads stdio_timeout from environment variable" do
      original_env = ENV.fetch("SSR_STDIO_TIMEOUT", nil)
      ENV["SSR_STDIO_TIMEOUT"] = "8000"

      config = described_class.new
      expect(config.stdio_timeout).to eq(8000)

      ENV["SSR_STDIO_TIMEOUT"] = original_env
    end
  end

  describe "configuration attributes" do
    it "has an engine attribute" do
      expect(subject).to respond_to(:engine)
      expect(subject).to respond_to(:engine=)
    end

    it "has an ssr_url attribute" do
      expect(subject).to respond_to(:ssr_url)
      expect(subject).to respond_to(:ssr_url=)
    end

    it "has a timeout attribute" do
      expect(subject).to respond_to(:timeout)
      expect(subject).to respond_to(:timeout=)
    end

    it "has an ssr_stream_path attribute" do
      expect(subject).to respond_to(:ssr_stream_path)
      expect(subject).to respond_to(:ssr_stream_path=)
    end

    it "has an http_pool_size attribute" do
      expect(subject).to respond_to(:http_pool_size)
      expect(subject).to respond_to(:http_pool_size=)
    end

    it "has a stdio_cli_script attribute" do
      expect(subject).to respond_to(:stdio_cli_script)
      expect(subject).to respond_to(:stdio_cli_script=)
    end

    it "has a stdio_pool_size attribute" do
      expect(subject).to respond_to(:stdio_pool_size)
      expect(subject).to respond_to(:stdio_pool_size=)
    end

    it "has a stdio_timeout attribute" do
      expect(subject).to respond_to(:stdio_timeout)
      expect(subject).to respond_to(:stdio_timeout=)
    end
  end
end

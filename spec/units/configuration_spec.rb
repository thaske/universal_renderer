# frozen_string_literal: true

RSpec.describe UniversalRenderer::Configuration do
  subject { described_class.new }

  describe "#initialize" do
    it "creates a new configuration instance" do
      expect(subject).to be_a(described_class)
    end

    it "sets default values" do
      expect(subject.adapter).to eq(:http)
      expect(subject.url).to be_nil
      expect(subject.timeout).to eq(3)
      expect(subject.stream_path).to eq("/stream")
      expect(subject.http).to be_a(described_class::Http)
      expect(subject.stdio).to be_a(described_class::Stdio)
    end

    it "does not read environment variables" do
      # The Configuration object holds plain Ruby defaults only and must not
      # consult ENV. Binding to ENV is the host application's responsibility.
      stub_const("ENV", {})
      config = described_class.new

      expect(config.adapter).to eq(:http)
      expect(config.timeout).to eq(3)
      expect(config.http.pool_size).to eq(5)
      expect(config.stdio.pool_size).to eq(5)
      expect(config.stdio.timeout_ms).to eq(5_000)
      expect(config.stdio.cli_script).to eq("app/frontend/ssr/stdio.tsx")
    end
  end

  describe "#adapter=" do
    it "normalizes adapter assignments to a downcased symbol" do
      subject.adapter = "STDIO"
      expect(subject.adapter).to eq(:stdio)
    end

    it "accepts symbol and string values" do
      subject.adapter = :http
      expect(subject.adapter).to eq(:http)

      subject.adapter = "stdio"
      expect(subject.adapter).to eq(:stdio)
    end
  end

  describe "top-level attributes" do
    it "has mutable url, timeout, and stream_path attributes" do
      subject.url = "http://example.test"
      subject.timeout = 10
      subject.stream_path = "/render"

      expect(subject.url).to eq("http://example.test")
      expect(subject.timeout).to eq(10)
      expect(subject.stream_path).to eq("/render")
    end
  end

  describe "http sub-configuration" do
    it "has a mutable pool_size" do
      subject.http.pool_size = 10
      expect(subject.http.pool_size).to eq(10)
    end
  end

  describe "stdio sub-configuration" do
    it "has mutable pool_size, timeout_ms, and cli_script" do
      subject.stdio.pool_size = 10
      subject.stdio.timeout_ms = 8_000
      subject.stdio.cli_script = "custom/path/to/ssr.ts"

      expect(subject.stdio.pool_size).to eq(10)
      expect(subject.stdio.timeout_ms).to eq(8_000)
      expect(subject.stdio.cli_script).to eq("custom/path/to/ssr.ts")
    end

    it "shares a distinct instance per configuration" do
      config = described_class.new
      expect(config.stdio).not_to be(subject.stdio)
    end
  end
end

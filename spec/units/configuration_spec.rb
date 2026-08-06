# frozen_string_literal: true

RSpec.describe UniversalRenderer::Configuration do
  subject { described_class.new }

  describe "#initialize" do
    it "creates a new configuration instance" do
      expect(subject).to be_a(described_class)
    end

    it "sets default values" do
      expect(subject.url).to be_nil
      expect(subject.timeout).to eq(3)
      expect(subject.render_path).to be_nil
      expect(subject.stream_path).to eq("/stream")
      expect(subject.sanitize).to be(true)
      expect(subject.scrubber).to be_nil
      expect(subject.auto_include).to be(true)
      expect(subject.on_error).to be_nil
      expect(subject.http).to be_a(described_class::Http)
    end

    it "does not read environment variables" do
      stub_const("ENV", {})
      config = described_class.new

      expect(config.timeout).to eq(3)
      expect(config.http.pool_size).to eq(5)
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
end

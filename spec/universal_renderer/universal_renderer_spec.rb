# frozen_string_literal: true

RSpec.describe UniversalRenderer do
  describe ".config" do
    it "returns a Configuration instance" do
      expect(described_class.config).to be_a(UniversalRenderer::Configuration)
    end

    it "returns the same instance on subsequent calls" do
      config1 = described_class.config
      config2 = described_class.config
      expect(config1).to be(config2)
    end
  end

  describe ".configure" do
    it "yields the configuration instance" do
      expect { |b| described_class.configure(&b) }.to yield_with_args(
        UniversalRenderer::Configuration
      )
    end

    it "allows setting configuration" do
      described_class.configure do |config|
        expect(config).to be_a(UniversalRenderer::Configuration)
      end
    end
  end

  describe ".config=" do
    it "allows setting a custom configuration" do
      custom_config = UniversalRenderer::Configuration.new
      described_class.config = custom_config
      expect(described_class.config).to be(custom_config)
    end
  end
end

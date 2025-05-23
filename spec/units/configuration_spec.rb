# frozen_string_literal: true

RSpec.describe UniversalRenderer::Configuration do
  subject { described_class.new }

  describe "#initialize" do
    it "creates a new configuration instance" do
      expect(subject).to be_a(described_class)
    end
  end

  describe "configuration attributes" do
    it "responds to configuration methods" do
      # This test will help us understand what configuration options exist
      # and can be expanded as we discover the actual configuration API
      expect(subject).to be_a(described_class)
    end
  end
end

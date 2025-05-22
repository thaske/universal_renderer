module UniversalRenderer
  module SSR
    # Lightweight value object representing the payload returned by the
    # Node.js SSR service. Using a Struct keeps the data immutable-ish while
    # still allowing hash-like access (e.g. `response[:head]`).
    #
    # The contract between the Ruby Gem and the Node service guarantees that
    # at minimum the `head` and `body` keys are present. Additional keys are
    # accepted but ignored (see {UniversalRenderer::Client::Base}).
    #
    # @!attribute head
    #   @return [String, nil] Raw <head> HTML snippet produced by the renderer.
    # @!attribute body
    #   @return [String, nil] Raw body HTML snippet produced by the renderer.
    # @!attribute body_attrs
    #   @return [Hash, nil] A hash of attributes that should be applied to the <body> tag.
    Response = Struct.new(:head, :body, :body_attrs, keyword_init: true)
  end
end

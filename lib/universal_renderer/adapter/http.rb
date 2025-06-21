# frozen_string_literal: true

require_relative "base"
require_relative "../client/base"
require_relative "../client/stream"

module UniversalRenderer
  module Adapter
    class Http < Base
      def call(url, props)
        UniversalRenderer::Client::Base.call(url, props)
      end

      def stream(url, props, template, response)
        UniversalRenderer::Client::Stream.call(url, props, template, response)
      end

      def supports_streaming?
        true
      end
    end
  end
end

# frozen_string_literal: true

# Stands in for ActionController::Base in the Renderable specs.
#
# `render` lives here rather than on the class the concern is included into: a
# module included into a class sits *below* it in the ancestor chain, so the
# concern's `render` override would never be reached and its `super` would have
# nothing to call. Real controllers inherit, so this mirrors them.
module FakeController
  Format = Struct.new(:html?)
  Request = Struct.new(:original_url, :env, :format)

  class Base
    # The concern calls both at include time.
    def self.helper(*)
    end

    def self.helper_method(*)
    end

    attr_accessor :action_name, :current_user
    attr_reader :request

    def initialize
      @action_name = "show"
      @current_user = nil
      @request =
        Request.new("https://example.test/page", {}, Format.new(true))
    end

    def render(*, **)
      :rendered
    end
  end
end

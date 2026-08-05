module UniversalRenderer
  class Engine < ::Rails::Engine
    # Registered after config initializers so `config.auto_include = false` in
    # config/initializers/universal_renderer.rb is honoured. ActionController::Base
    # is normally loaded later still (eager load, or first reference in
    # development), but registering the hook after initializers removes the
    # ordering question entirely.
    initializer "universal_renderer.renderable",
                after: :load_config_initializers do
      ActiveSupport.on_load(:action_controller_base) do
        if UniversalRenderer.config.auto_include
          include UniversalRenderer::Renderable
        end
      end
    end
  end
end

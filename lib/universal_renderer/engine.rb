module UniversalRenderer
  class Engine < ::Rails::Engine
    # After config initializers, so `config.auto_include = false` is honoured
    # whenever ActionController::Base happens to load.
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

module UniversalRenderer
  class Engine < ::Rails::Engine
    ActiveSupport.on_load(:action_controller) do
      include UniversalRenderer::Renderable
    end
  end
end

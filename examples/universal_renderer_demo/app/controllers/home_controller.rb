class HomeController < ApplicationController
  include UniversalRenderer::Renderable

  enable_ssr

  def index
    add_prop(
      rendered_at: Time.current.iso8601
    )
    add_query_data(
      ["demo-message"],
      "React Query says: Hello from Rails + Vite + Bun + React"
    )
  end
end

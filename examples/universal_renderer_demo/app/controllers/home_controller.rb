class HomeController < ApplicationController
  include UniversalRenderer::Renderable

  enable_ssr

  def index
    records = params.fetch(:records, "100").to_i.clamp(1, 2_000)
    size_kb = params.fetch(:size_kb, "64").to_i.clamp(1, 512)
    rows = build_rows(records)
    blob = "x" * (size_kb * 1024)

    add_prop(
      rendered_at: Time.current.iso8601,
      demo_payload: {
        records: records,
        size_kb: size_kb,
        blob: blob,
        rows: rows
      }
    )
    add_query_data(
      ["demo-message"],
      "React Query says: Hello from Rails + Vite + Bun + React"
    )
    add_query_data(
      ["demo-metrics"],
      {
        records: records,
        size_kb: size_kb,
        blob_bytes: blob.bytesize
      }
    )
    add_query_data(["demo-first-row"], rows.first)
  end

  private

  def build_rows(records)
    (1..records).map do |id|
      {
        "id" => id,
        "label" => "Item #{id}",
        "value" => "value-#{id.to_s(36)}"
      }
    end
  end
end

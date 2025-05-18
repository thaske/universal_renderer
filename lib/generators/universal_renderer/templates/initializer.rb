UniversalRenderer.configure do |c|
  c.ssr_url = ENV.fetch("SSR_SERVER_URL", "http://localhost:3001")
  c.timeout = 3
end

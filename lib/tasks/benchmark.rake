namespace :universal_renderer do
  desc "Benchmark HTTP vs MiniRacer SSR performance"
  task benchmark: :environment do
    require "benchmark"

    puts "Universal Renderer Benchmark: HTTP vs MiniRacer"
    puts "=" * 50

    # Setup test props
    test_props = {
      "component" => "TestComponent",
      "title" => "Benchmark Test",
      "items" => (1..10).map { |i| { id: i, name: "Item #{i}" } }
    }

    test_url = "http://localhost:3000/benchmark"
    iterations = 100

    puts "Running #{iterations} iterations..."
    puts

    # Benchmark HTTP adapter
    puts "HTTP Adapter:"
    begin
      original_engine = UniversalRenderer.config.engine
      UniversalRenderer.config.engine = :http
      UniversalRenderer::AdapterFactory.reset!

      http_adapter = UniversalRenderer::AdapterFactory.adapter

      http_time =
        Benchmark.measure do
          iterations.times do
            result = http_adapter.call(test_url, test_props)
            # Note: HTTP adapter might return nil if server is not running
          end
        end

      puts "  Total time: #{http_time.real.round(4)}s"
      puts "  Average per call: #{(http_time.real / iterations * 1000).round(2)}ms"
      puts "  Calls per second: #{(iterations / http_time.real).round(2)}"
    rescue => e
      puts "  Error: #{e.message}"
      puts "  (Make sure SSR server is running if testing HTTP adapter)"
    end

    puts

    # Benchmark MiniRacer adapter
    puts "MiniRacer Adapter:"
    begin
      UniversalRenderer.config.engine = :mini_racer
      UniversalRenderer::AdapterFactory.reset!

      mini_racer_adapter = UniversalRenderer::AdapterFactory.adapter

      mini_racer_time =
        Benchmark.measure do
          iterations.times do
            result = mini_racer_adapter.call(test_url, test_props)
          end
        end

      puts "  Total time: #{mini_racer_time.real.round(4)}s"
      puts "  Average per call: #{(mini_racer_time.real / iterations * 1000).round(2)}ms"
      puts "  Calls per second: #{(iterations / mini_racer_time.real).round(2)}"
    rescue => e
      puts "  Error: #{e.message}"
      puts "  (Make sure SSR bundle is available at app/assets/javascripts/universal_renderer/ssr_bundle.js)"
    ensure
      # Restore original engine
      UniversalRenderer.config.engine = original_engine
      UniversalRenderer::AdapterFactory.reset!
    end

    puts
    puts "Benchmark complete!"
    puts
    puts "Notes:"
    puts "- HTTP adapter requires external Node.js/Bun server"
    puts "- MiniRacer adapter requires customized SSR bundle"
    puts "- Performance may vary based on JavaScript complexity"
    puts "- MiniRacer eliminates network overhead but has V8 context switching"
  end

  desc "Test MiniRacer adapter functionality"
  task test_mini_racer: :environment do
    puts "Testing MiniRacer Adapter..."
    puts "=" * 30

    UniversalRenderer.config.engine = :mini_racer
    UniversalRenderer::AdapterFactory.reset!

    adapter = UniversalRenderer::AdapterFactory.adapter

    test_props = {
      "component" => "TestComponent",
      "title" => "Test Page",
      "message" => "Hello from MiniRacer!"
    }

    result = adapter.call("http://localhost:3000/test", test_props)

    if result
      puts "✅ MiniRacer adapter working!"
      puts "Head: #{result.head}"
      puts "Body: #{result.body[0..200]}#{"..." if result.body.length > 200}"
      puts "Body attrs: #{result.body_attrs}"
    else
      puts "❌ MiniRacer adapter returned nil"
      puts "Check logs for error details"
    end

    puts
    puts "Streaming support: #{adapter.supports_streaming?}"
  end
end

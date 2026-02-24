namespace :universal_renderer do
  desc "Benchmark HTTP vs Stdio SSR performance"
  task benchmark: :environment do
    require "benchmark"

    puts "Universal Renderer Benchmark: HTTP vs Stdio"
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
            http_adapter.call(test_url, test_props)
            # NOTE: HTTP adapter might return nil if server is not running
          end
        end

      puts "  Total time: #{http_time.real.round(4)}s"
      puts "  Average per call: #{(http_time.real / iterations * 1000).round(2)}ms"
      puts "  Calls per second: #{(iterations / http_time.real).round(2)}"
    rescue StandardError => e
      puts "  Error: #{e.message}"
      puts "  (Make sure SSR server is running if testing HTTP adapter)"
    end

    puts

    # Benchmark Stdio adapter
    puts "Stdio Adapter:"
    begin
      UniversalRenderer.config.engine = :stdio
      UniversalRenderer::AdapterFactory.reset!

      stdio_adapter = UniversalRenderer::AdapterFactory.adapter

      stdio_time =
        Benchmark.measure do
          iterations.times do
            stdio_adapter.call(test_url, test_props)
          end
        end

      puts "  Total time: #{stdio_time.real.round(4)}s"
      puts "  Average per call: #{(stdio_time.real / iterations * 1000).round(2)}ms"
      puts "  Calls per second: #{(iterations / stdio_time.real).round(2)}"
    rescue StandardError => e
      puts "  Error: #{e.message}"
      puts "  (Make sure stdio CLI script is available and Node.js is installed)"
    ensure
      # Restore original engine
      UniversalRenderer.config.engine = original_engine
      UniversalRenderer::AdapterFactory.reset!
    end

    puts
    puts "Benchmark complete!"
    puts
    puts "Notes:"
    puts "- HTTP adapter requires external Node.js server"
    puts "- Stdio adapter requires a stdio CLI script and Node.js"
    puts "- Performance may vary based on JavaScript complexity"
    puts "- Stdio eliminates network overhead but has process communication overhead"
  end

  desc "Test Stdio adapter functionality"
  task test_stdio: :environment do
    puts "Testing Stdio Adapter..."
    puts "=" * 30

    UniversalRenderer.config.engine = :stdio
    UniversalRenderer::AdapterFactory.reset!

    adapter = UniversalRenderer::AdapterFactory.adapter

    test_props = {
      "component" => "TestComponent",
      "title" => "Test Page",
      "message" => "Hello from Stdio!"
    }

    result = adapter.call("http://localhost:3000/test", test_props)

    if result
      puts "✅ Stdio adapter working!"
      puts "Head: #{result.head}"
      puts "Body: #{result.body[0..200]}#{"..." if result.body.length > 200}"
      puts "Body attrs: #{result.body_attrs}"
    else
      puts "❌ Stdio adapter returned nil"
      puts "Check logs for error details"
    end

    puts
    puts "Streaming support: #{adapter.supports_streaming?}"
  end
end

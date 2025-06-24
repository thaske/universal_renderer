namespace :universal_renderer do
  desc "Benchmark HTTP vs BunIo SSR performance"
  task benchmark: :environment do
    require "benchmark"

    puts "Universal Renderer Benchmark: HTTP vs BunIo"
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

    # Benchmark BunIo adapter
    puts "BunIo Adapter:"
    begin
      UniversalRenderer.config.engine = :bun_io
      UniversalRenderer::AdapterFactory.reset!

      bun_io_adapter = UniversalRenderer::AdapterFactory.adapter

      bun_io_time =
        Benchmark.measure do
          iterations.times do
            result = bun_io_adapter.call(test_url, test_props)
          end
        end

      puts "  Total time: #{bun_io_time.real.round(4)}s"
      puts "  Average per call: #{(bun_io_time.real / iterations * 1000).round(2)}ms"
      puts "  Calls per second: #{(iterations / bun_io_time.real).round(2)}"
    rescue => e
      puts "  Error: #{e.message}"
      puts "  (Make sure Bun CLI script is available and Bun is installed)"
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
    puts "- BunIo adapter requires Bun CLI script and Bun installed"
    puts "- Performance may vary based on JavaScript complexity"
    puts "- BunIo eliminates network overhead but has process communication overhead"
  end

  desc "Test BunIo adapter functionality"
  task test_bun_io: :environment do
    puts "Testing BunIo Adapter..."
    puts "=" * 30

    UniversalRenderer.config.engine = :bun_persistent
    UniversalRenderer::AdapterFactory.reset!

    adapter = UniversalRenderer::AdapterFactory.adapter

    test_props = {
      "component" => "TestComponent",
      "title" => "Test Page",
      "message" => "Hello from BunIo!"
    }

    result = adapter.call("http://localhost:3000/test", test_props)

    if result
      puts "✅ BunIo adapter working!"
      puts "Head: #{result.head}"
      puts "Body: #{result.body[0..200]}#{"..." if result.body.length > 200}"
      puts "Body attrs: #{result.body_attrs}"
    else
      puts "❌ BunIo adapter returned nil"
      puts "Check logs for error details"
    end

    puts
    puts "Streaming support: #{adapter.supports_streaming?}"
  end
end

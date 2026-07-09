# frozen_string_literal: true

require "bundler/setup"
require "json"
require "logger"
require "pathname"
require "fileutils"
require "time"
require "rails"
require "active_support"
require "active_support/core_ext/hash/keys"
require "active_support/core_ext/module/delegation"
require "active_support/core_ext/object/blank"

class << Rails
  def root
    Pathname.new(File.expand_path("../..", __dir__))
  end

  def env
    ActiveSupport::StringInquirer.new("benchmark")
  end
end

Rails.logger = Logger.new($stderr)
Rails.logger.level = ENV.fetch("BENCHMARK_LOG_LEVEL", "ERROR")

require_relative "../../lib/universal_renderer/configuration"
require_relative "../../lib/universal_renderer/ssr/response"

module UniversalRenderer
  class << self
    attr_writer :config

    def config
      @config ||= Configuration.new
    end
  end
end

require_relative "../../lib/universal_renderer/adapter_factory"

ITERATIONS = Integer(ENV.fetch("ITERATIONS", "300"))
WARMUP = Integer(ENV.fetch("WARMUP", "25"))
RESULTS_DIR = File.expand_path("../../tmp/reports", __dir__)
RESULTS_FILE = File.join(RESULTS_DIR, "http-vs-stdio.json")
STDIO_SCRIPT =
  ENV.fetch(
    "UNIVERSAL_RENDERER_STDIO_CLI_SCRIPT",
    "benchmark/src/stdio-renderer.ts"
  )
SCENARIOS =
  ENV
    .fetch("SCENARIOS", "basic,props-heavy,react-stack")
    .split(",")
    .map(&:strip)
    .reject(&:empty?)
DEFAULT_ITEM_COUNTS = {
  "basic" => 10,
  "props-heavy" => 500,
  "react-stack" => 125
}.freeze

UniversalRenderer.config.url = ENV.fetch("UNIVERSAL_RENDERER_URL")
UniversalRenderer.config.timeout =
  Integer(ENV.fetch("UNIVERSAL_RENDERER_TIMEOUT", "15"))
UniversalRenderer.config.stdio.cli_script = STDIO_SCRIPT
UniversalRenderer.config.stdio.timeout_ms =
  Integer(ENV.fetch("UNIVERSAL_RENDERER_STDIO_TIMEOUT_MS", "15000"))
UniversalRenderer.config.stdio.pool_size =
  Integer(ENV.fetch("UNIVERSAL_RENDERER_STDIO_POOL_SIZE", "1"))

def monotonic_ms
  Process.clock_gettime(Process::CLOCK_MONOTONIC) * 1000.0
end

def percentile(values, percentile)
  sorted = values.sort
  sorted[((percentile / 100.0) * (sorted.length - 1)).round]
end

def stats_for(timings)
  total = timings.sum
  mean = total / timings.length
  variance =
    timings.reduce(0.0) { |sum, value| sum + ((value - mean)**2) } /
      timings.length

  {
    "total_ms" => total,
    "avg_ms" => mean,
    "min_ms" => timings.min,
    "p50_ms" => percentile(timings, 50),
    "p95_ms" => percentile(timings, 95),
    "p99_ms" => percentile(timings, 99),
    "max_ms" => timings.max,
    "stddev_ms" => Math.sqrt(variance),
    "rps" => timings.length / (total / 1000.0)
  }
end

def measure(label, props)
  UniversalRenderer::AdapterFactory.reset!
  adapter = UniversalRenderer::AdapterFactory.adapter
  url =
    "http://localhost:3000/benchmark/#{props.fetch("scenario")}/#{props.fetch("requestId")}"

  WARMUP.times { adapter.call(url, props) }
  GC.start

  timings = []
  successes = 0
  nils = 0
  errors = 0
  first_response_bytes = nil

  ITERATIONS.times do
    started = monotonic_ms
    begin
      result = adapter.call(url, props)
      if result
        successes += 1
        first_response_bytes ||=
          result.head.to_s.bytesize + result.body.to_s.bytesize +
            result.body_attrs.to_h.to_json.bytesize
      else
        nils += 1
      end
    rescue StandardError => e
      errors += 1
      warn "#{label} #{props.fetch("scenario")} error: #{e.class}: #{e.message}"
    ensure
      timings << (monotonic_ms - started)
    end
  end

  stats_for(timings)
    .merge(
      "successes" => successes,
      "nils" => nils,
      "errors" => errors,
      "response_bytes" => first_response_bytes,
      "raw_timings_ms" => timings
    )
    .tap { |result| result["adapter"] = adapter }
end

def shutdown_stdio(adapter)
  pool = adapter.instance_variable_get(:@process_pool)
  pool&.shutdown { |process| process.close }
rescue StandardError => e
  warn "stdio shutdown warning: #{e.class}: #{e.message}"
end

def item_count_for(scenario)
  env_key = "#{scenario.upcase.tr("-", "_")}_ITEMS"
  Integer(ENV.fetch(env_key, DEFAULT_ITEM_COUNTS.fetch(scenario, 100).to_s))
end

def build_item(index)
  {
    "id" => index,
    "name" => "Benchmark Item #{index}",
    "slug" => "benchmark-item-#{index}",
    "description" =>
      "SSR benchmark payload row #{index} with enough text to exercise JSON encoding, HTML escaping, and render traversal.",
    "tags" => ["ssr", "benchmark", "item-#{index % 13}", "group-#{index % 7}"],
    "stats" => {
      "views" => (index * 137) % 100_000,
      "score" => ((index * 17) % 1000) / 10.0,
      "trend" => 8.times.map { |offset| ((index + offset) * 31) % 97 }
    },
    "flags" => {
      "featured" => (index % 9).zero?,
      "archived" => (index % 41).zero?
    }
  }
end

def build_props(scenario)
  count = item_count_for(scenario)
  items = (1..count).map { |index| build_item(index) }

  {
    "scenario" => scenario,
    "component" => "BenchmarkComponent",
    "title" => "#{scenario} UniversalRenderer benchmark",
    "requestId" => "#{scenario}-#{count}-items",
    "items" => items,
    "metadata" => {
      "generatedAt" => Time.now.utc.iso8601,
      "stressors" => %w[json-props head-tags styles query-cache],
      "counts" => {
        "items" => count,
        "tags" => items.sum { |item| item.fetch("tags").length },
        "trendPoints" => items.sum { |item| item.dig("stats", "trend").length }
      }
    },
    "queryState" => {
      "cacheKey" => ["benchmark-items", "#{scenario}-#{count}-items"],
      "staleTime" => "Infinity",
      "hydration" => true
    }
  }
end

def print_result(label, result)
  puts "  #{label.ljust(6)} avg=#{format("%.3f", result["avg_ms"])}ms " \
         "p50=#{format("%.3f", result["p50_ms"])}ms " \
         "p95=#{format("%.3f", result["p95_ms"])}ms " \
         "p99=#{format("%.3f", result["p99_ms"])}ms " \
         "rps=#{format("%.1f", result["rps"])} " \
         "ok/nil/err=#{result["successes"]}/#{result["nils"]}/#{result["errors"]}"
end

def strip_runtime_objects(result)
  result.reject { |key, _value| key == "adapter" }
end

puts "UniversalRenderer benchmark: HTTP vs Stdio"
puts "iterations=#{ITERATIONS}, warmup=#{WARMUP}, scenarios=#{SCENARIOS.join(",")}, stdio_pool_size=#{UniversalRenderer.config.stdio.pool_size}"
puts "http_url=#{UniversalRenderer.config.url}, stdio_script=#{UniversalRenderer.config.stdio.cli_script}"
puts

scenario_results =
  SCENARIOS.map do |scenario|
    props = build_props(scenario)
    props_bytes = JSON.generate(props).bytesize

    puts "#{scenario} (items=#{props.fetch("items").length}, props=#{props_bytes} bytes)"

    UniversalRenderer.config.adapter = :http
    http_result = measure("HTTP", props)
    print_result("HTTP", http_result)

    UniversalRenderer.config.adapter = :stdio
    stdio_result = measure("Stdio", props)
    print_result("Stdio", stdio_result)
    shutdown_stdio(stdio_result.fetch("adapter"))

    comparison =
      if http_result.fetch("successes").positive? &&
           stdio_result.fetch("successes").positive?
        ratio = http_result.fetch("avg_ms") / stdio_result.fetch("avg_ms")
        if ratio >= 1
          { "faster" => "stdio", "average_latency_ratio" => ratio }
        else
          { "faster" => "http", "average_latency_ratio" => 1.0 / ratio }
        end
      else
        { "faster" => nil, "average_latency_ratio" => nil }
      end

    if comparison.fetch("faster")
      puts "  winner #{comparison.fetch("faster")} by #{format("%.2f", comparison.fetch("average_latency_ratio"))}x avg latency"
    end
    puts

    {
      "scenario" => scenario,
      "item_count" => props.fetch("items").length,
      "props_bytes" => props_bytes,
      "results" => {
        "http" => strip_runtime_objects(http_result),
        "stdio" => strip_runtime_objects(stdio_result)
      },
      "comparison" => comparison
    }
  end

FileUtils.mkdir_p(RESULTS_DIR)
output = {
  "generated_at" => Time.now.utc.iso8601,
  "iterations" => ITERATIONS,
  "warmup" => WARMUP,
  "http_url" => UniversalRenderer.config.url,
  "stdio_script" => UniversalRenderer.config.stdio.cli_script,
  "stdio_pool_size" => UniversalRenderer.config.stdio.pool_size,
  "scenarios" => scenario_results
}
File.write(RESULTS_FILE, JSON.pretty_generate(output))
puts "Saved JSON results to #{RESULTS_FILE}"

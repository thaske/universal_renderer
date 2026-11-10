# frozen_string_literal: true

# Stands in for the SSR renderer in supervisor specs. Serves /health on SSR_PORT.
#
# FAKE_RENDERER_MODE:
#   healthy      answers 200
#   unhealthy    listens, answers 500
#   crash        exits immediately with status 1
#   ignore_term  answers 200 and ignores SIGTERM
#   with_child   answers 200 and starts a `sleep` child, writing its pid to FAKE_RENDERER_CHILD_PID
require "socket"

mode = ENV.fetch("FAKE_RENDERER_MODE", "healthy")
exit 1 if mode == "crash"

trap("TERM", "IGNORE") if mode == "ignore_term"
if mode == "with_child"
  child = Process.spawn("sleep", "1000")
  File.write(ENV.fetch("FAKE_RENDERER_CHILD_PID"), child.to_s)
end

server = TCPServer.new("127.0.0.1", Integer(ENV.fetch("SSR_PORT")))
status = mode == "unhealthy" ? "500 Internal Server Error" : "200 OK"

loop do
  client = server.accept
  client.gets
  client.write("HTTP/1.1 #{status}\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok")
  client.close
rescue Errno::EPIPE, Errno::ECONNRESET
  next
end

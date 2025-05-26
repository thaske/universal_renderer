# WebSocket SSR Server

This document describes the new WebSocket-based Server-Side Rendering functionality that replaces the Express HTTP server with a high-performance WebSocket server using Bun's native WebSocket API.

## Overview

The WebSocket SSR server provides the same rendering capabilities as the HTTP version while enabling real-time bidirectional communication between the Ruby gem and the Node.js service. It uses uWebSockets internally through Bun's native WebSocket implementation.

## Key Benefits

- **Higher Performance**: Built on uWebSockets, one of the fastest WebSocket implementations
- **Real-time Communication**: Bidirectional messaging enables more advanced use cases
- **Better Resource Management**: Persistent connections reduce connection overhead
- **Streaming Support**: Efficient streaming of SSR content over WebSocket messages
- **Built for Bun**: Leverages Bun's native WebSocket API for optimal performance

## Usage

### NPM Package (Bun Server)

```typescript
import { createWebSocketServer } from 'universal-renderer';
import { renderToString } from 'react-dom/server';

const server = await createWebSocketServer({
  setup: async (url, props) => ({ url, props }),
  render: async (context) => ({
    body: renderToString(<App {...context} />)
  }),
  cleanup: (context) => {
    // Clean up resources
  },
  port: 3000
});
```

### Ruby Gem Configuration

Enable WebSocket mode in your Rails application:

```ruby
# config/initializers/universal_renderer.rb
UniversalRenderer.configure do |config|
  config.ssr_url = "ws://localhost:3000" # WebSocket URL
  config.use_websockets = true # Enable WebSocket mode
  config.timeout = 5 # Request timeout in seconds
end
```

Or use environment variables:

```bash
export SSR_SERVER_URL="ws://localhost:3000"
export SSR_USE_WEBSOCKETS="true"
export SSR_TIMEOUT="5"
```

### Rails Usage

The existing API remains the same - the WebSocket client is used automatically when `use_websockets` is enabled:

```ruby
# In your controller
def show
  ssr_response =
    UniversalRenderer::Client::Base.call(
      request.original_url,
      { user: current_user.as_json }
    )

  if ssr_response
    render html: ssr_response.body.html_safe
  else
    # Fallback to client-side rendering
    render :show
  end
end
```

## WebSocket Message Protocol

The WebSocket communication uses a structured JSON message format:

```typescript
interface WebSocketMessage {
  id: string;
  type:
    | "ssr_request"
    | "ssr_response"
    | "stream_request"
    | "stream_start"
    | "stream_chunk"
    | "stream_end"
    | "health_check"
    | "health_response"
    | "error";
  payload: any;
}
```

### Message Types

- **ssr_request**: Request server-side rendering
- **ssr_response**: Response with rendered content
- **stream_request**: Request streaming SSR
- **stream_start**: Streaming has started
- **stream_chunk**: A chunk of streamed content
- **stream_end**: Streaming has completed
- **health_check**: Health check request
- **health_response**: Health check response
- **error**: Error message

### Example Messages

**SSR Request:**

```json
{
  "id": "req_1_1234567890.123",
  "type": "ssr_request",
  "payload": {
    "url": "https://example.com/page",
    "props": { "user": { "name": "John" } }
  }
}
```

**SSR Response:**

```json
{
  "id": "req_1_1234567890.123",
  "type": "ssr_response",
  "payload": {
    "head": "<title>Page Title</title>",
    "body": "<div>Rendered content</div>",
    "bodyAttrs": "class=\"ssr-page\""
  }
}
```

## Streaming Support

The WebSocket server supports streaming SSR for better perceived performance:

```typescript
const server = await createWebSocketServer({
  // ... other options
  streamCallbacks: {
    onStream: async (context, writer, template) => {
      writer.write("<!DOCTYPE html>");
      writer.write("<html><head><title>Streaming</title></head><body>");

      // Stream content in chunks
      const chunks = await generateContentChunks(context);
      for (const chunk of chunks) {
        writer.write(chunk);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      writer.write("</body></html>");
      writer.end();
    },
  },
});
```

## Connection Management

The WebSocket server includes built-in connection management:

- **Automatic Reconnection**: Ruby client handles connection drops
- **Health Checks**: Built-in health check mechanism
- **Timeout Handling**: Configurable request timeouts
- **Error Recovery**: Graceful error handling and fallbacks

## Performance Configuration

The server includes optimized WebSocket settings:

```typescript
// These are set automatically
websocket: {
  maxPayloadLength: 16 * 1024 * 1024, // 16MB
  idleTimeout: 120,                    // 2 minutes
  backpressureLimit: 1024 * 1024,     // 1MB
  closeOnBackpressureLimit: false,
  sendPings: true
}
```

## Migration from HTTP

To migrate from the HTTP-based server:

1. **Update NPM package**: Use `createWebSocketServer` instead of `createServer`
2. **Update Ruby configuration**: Set `use_websockets = true` and update `ssr_url` to use `ws://` or `wss://`
3. **Update dependencies**: Add `websocket-client-simple` and `concurrent-ruby` gems
4. **Test thoroughly**: Verify SSR and streaming functionality

## Dependencies

### NPM Package

- Bun runtime (built-in WebSocket support)
- No additional dependencies required

### Ruby Gem

- `websocket-client-simple` (~> 0.8)
- `concurrent-ruby` (~> 1.2)

## Example Server

See `examples/websocket-server.ts` for a complete example implementation.

## Troubleshooting

### Connection Issues

- Verify WebSocket URL format (`ws://` or `wss://`)
- Check firewall settings for WebSocket connections
- Ensure Bun server is running and accessible

### Performance Issues

- Monitor connection count and memory usage
- Adjust timeout settings based on your use case
- Consider connection pooling for high-traffic applications

### Debugging

- Enable debug logging in both Ruby and TypeScript
- Use WebSocket debugging tools to inspect messages
- Monitor server metrics and connection health

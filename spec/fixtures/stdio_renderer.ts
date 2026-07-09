// Minimal renderer used by spec/integration/stdio_pipe_spec.rb to exercise
// the real stdin/stdout protocol against a live Bun child process.
import { createElement } from "react";
import { createRenderer } from "../../universal-renderer/src/stdio";

await createRenderer({
  setup: (url, props) => ({ url, props }),

  render: ({ url, props }) => {
    if (props.fail) throw new Error("intentional failure");

    // Stray app logging must land on stderr, not corrupt the protocol stream.
    console.log("stray log line from app code");

    return {
      head: `<title>${props.title ?? "fixture"}</title>`,
      body: `<div>${props.content ?? url}</div>`,
      bodyAttrs: { "data-echo": "yes" },
    };
  },

  streamCallbacks: {
    node: ({ props }) => {
      if (props.stream_fail) {
        return createElement(() => {
          throw new Error("intentional stream failure");
        });
      }

      return createElement(
        "div",
        { id: "stream" },
        String(props.content ?? "streamed"),
      );
    },

    head: ({ props }) => `<title>${props.title ?? "stream-fixture"}</title>`,
  },
});

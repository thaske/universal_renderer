import { default as _setup } from "@/ssr/setup";
import { head, transform } from "@/ssr/utils";
import { renderToString } from "react-dom/server.node";
import type { createServer as createHttpServer } from "universal-renderer/http";
import type { ViteDevServer } from "vite";

const port = Number(process.env.SSR_PORT ?? process.env.PORT);

let vite: ViteDevServer | undefined;
let setup: typeof _setup;
const { createServer: createViteServer } = await import("vite");
vite = await createViteServer({
  server: { middlewareMode: true },
  appType: "custom",
});
setup = (await vite.ssrLoadModule("@/ssr/setup")).default;
const { createServer }: { createServer: typeof createHttpServer } =
  (await vite.ssrLoadModule("universal-renderer/http")) as {
    createServer: typeof createHttpServer;
  };

const app = await createServer({
  middleware: vite?.middlewares,

  setup,

  render: ({ app, sheet, helmetContext }) => {
    const root = renderToString(app);
    const styles = sheet.getStyleTags();
    return {
      head: head({ helmetContext }),
      body: `${root}\n${styles}`,
    };
  },

  cleanup: ({ sheet, queryClient }) => {
    sheet?.seal();
    queryClient?.clear();
  },

  error: (err, req, res, next) => {
    vite?.ssrFixStacktrace(err);
    console.error(`${err.message}\n${err.stack}`);
    res.status(500).send("Internal Server Error");
  },

  streamCallbacks: {
    head,
    transform,
  },
});

app.listen(port, () => {
  console.log(`[SSR] Server is running on port ${port}`);
});

import setup from "@/ssr/setup";
import { head } from "@/ssr/utils";
import { renderToString } from "react-dom/server.node";
import { createRenderer } from "../../../../../universal-renderer/src/stdio";

await createRenderer({
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

  error: (err) => {
    console.error(`${err.message}\n${err.stack}`);
  },
});

import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { renderToString } from "react-dom/server.node";
import { ServerStyleSheet, StyleSheetManager } from "styled-components";
import { createServer } from "../../../../../universal-renderer/src/http/express/index";
import { App, type Props } from "../components/App";

function seedQueryClient(queryClient: QueryClient, props: Props) {
  for (const query of props.react_query || []) {
    if (!query || query.query_key === undefined) continue;
    queryClient.setQueryData(query.query_key as readonly unknown[], query.data);
  }
}

const app = await createServer({
  setup: async (_url, props: Props) => ({
    props,
    queryClient: new QueryClient(),
    sheet: new ServerStyleSheet(),
  }),

  render: async ({ props, queryClient, sheet }) => {
    seedQueryClient(queryClient, props);

    const body = renderToString(
      <StyleSheetManager sheet={sheet.instance}>
        <QueryClientProvider client={queryClient}>
          <App {...props} />
        </QueryClientProvider>
      </StyleSheetManager>
    );

    return {
      head: sheet.getStyleTags(),
      body,
    };
  },

  cleanup: ({ queryClient, sheet }) => {
    queryClient.clear();
    sheet.seal();
  },
});

app.listen(3001, "127.0.0.1", () => {
  console.log("SSR server running at http://127.0.0.1:3001");
});

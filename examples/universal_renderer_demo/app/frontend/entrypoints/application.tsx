import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { hydrateRoot } from "react-dom/client";
import { App, type Props } from "../components/App";

function seedQueryClient(queryClient: QueryClient, props: Props) {
  for (const query of props.react_query || []) {
    if (!query || query.query_key === undefined) continue;
    queryClient.setQueryData(query.query_key as readonly unknown[], query.data);
  }
}

const root = document.getElementById("root");
const propsNode = document.getElementById("ssr-props");

if (root) {
  const propsJson = propsNode?.textContent || "{}";
  const props = JSON.parse(propsJson) as Props;

  const queryClient = new QueryClient();
  seedQueryClient(queryClient, props);

  hydrateRoot(
    root,
    <QueryClientProvider client={queryClient}>
      <App {...props} />
    </QueryClientProvider>
  );
}

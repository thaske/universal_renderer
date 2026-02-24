import { HelmetProvider } from "@dr.pogodin/react-helmet";
import { createRoot, hydrateRoot } from "react-dom/client";
import { Hydrate, QueryClient, QueryClientProvider } from "react-query";
import { BrowserRouter } from "react-router";

import App from "@/App";

const rootElement = document.getElementById("root")!;

const queryClient = new QueryClient();
queryClient.setDefaultOptions({
  queries: {
    staleTime: Infinity,
  },
});

const stateEl = document.getElementById("state");
const state = JSON.parse(stateEl?.textContent ?? "{}");
stateEl?.remove();
const propsEl = document.getElementById("ssr-props");
const props = JSON.parse(propsEl?.textContent ?? "{}");

const app = (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <Hydrate state={state}>
        <BrowserRouter>
          <App {...props} />
        </BrowserRouter>
      </Hydrate>
    </QueryClientProvider>
  </HelmetProvider>
);

const hydrated = !!rootElement.children.length;
if (hydrated) {
  hydrateRoot(rootElement, app);
} else {
  createRoot(rootElement).render(app);
}

import {
  HelmetProvider,
  type HelmetDataContext,
} from "@dr.pogodin/react-helmet";
import { dehydrate, QueryClient, QueryClientProvider } from "react-query";
import { StaticRouter } from "react-router";
import { ServerStyleSheet } from "styled-components";

import App from "@/App";

type QueryData = {
  key: string;
  data: any;
};

function setup(url: string, props: any) {
  const location = new URL(url);
  const helmetContext: HelmetDataContext = {};
  const sheet = new ServerStyleSheet();

  const queryClient = new QueryClient();
  const { query_data } = props;
  if (query_data) {
    query_data.forEach(({ key, data }: QueryData) =>
      queryClient.setQueryData(key, data)
    );
  }
  const state = dehydrate(queryClient);

  const app = sheet.collectStyles(
    <HelmetProvider context={helmetContext}>
      <QueryClientProvider client={queryClient}>
        <StaticRouter location={`${location.pathname}${location.search}`}>
          <App {...props} />
        </StaticRouter>
      </QueryClientProvider>
      <script id="state" type="application/json">
        {JSON.stringify(state)}
      </script>
    </HelmetProvider>
  );

  return { app, sheet, queryClient, helmetContext };
}

export default setup;

import {
  dehydrate,
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import React from "react";
import { renderToString } from "react-dom/server";
import { Helmet, HelmetProvider } from "react-helmet-async";
import styled, { ServerStyleSheet, StyleSheetManager } from "styled-components";

export type BenchmarkScenario = "basic" | "props-heavy" | "react-stack";

export interface BenchmarkItem {
  id: number;
  name: string;
  slug: string;
  description: string;
  tags: string[];
  stats: {
    views: number;
    score: number;
    trend: number[];
  };
  flags: {
    featured: boolean;
    archived: boolean;
  };
}

export interface BenchmarkProps {
  scenario?: BenchmarkScenario;
  component?: string;
  title?: string;
  requestId?: string;
  items?: BenchmarkItem[];
  metadata?: Record<string, unknown>;
  queryState?: Record<string, unknown>;
}

export interface BenchmarkRenderOutput {
  head: string;
  body: string;
  bodyAttrs?: Record<string, string>;
}

const Shell = styled.main`
  --accent: #5b7cfa;
  color: #172033;
  background: linear-gradient(135deg, #f8fbff 0%, #eef4ff 100%);
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  min-height: 100vh;
  padding: 32px;
`;

const Card = styled.article<{ $featured: boolean }>`
  border: 1px solid ${(props) => (props.$featured ? "#5b7cfa" : "#d9e2f2")};
  border-radius: 14px;
  box-shadow: ${(props) =>
    props.$featured
      ? "0 14px 32px rgba(91, 124, 250, 0.2)"
      : "0 8px 20px rgba(23, 32, 51, 0.08)"};
  background: white;
  padding: 18px;
`;

const Grid = styled.section`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
`;

const Stat = styled.span`
  border-radius: 999px;
  background: #edf2ff;
  color: #3347a8;
  display: inline-block;
  font-size: 12px;
  font-weight: 700;
  margin: 8px 8px 0 0;
  padding: 4px 10px;
`;

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderBasic(
  url: string,
  props: BenchmarkProps,
): BenchmarkRenderOutput {
  return {
    head: `<title>${escapeHtml(props.title ?? "Benchmark")}</title>`,
    body: `<h1>Hello from ${escapeHtml(url)}</h1><p>Rendered ${escapeHtml(
      props.items?.length ?? 0,
    )} items.</p>`,
    bodyAttrs: { "data-benchmark-scenario": "basic" },
  };
}

function renderPropsHeavy(
  url: string,
  props: BenchmarkProps,
): BenchmarkRenderOutput {
  const items = props.items ?? [];
  const rows = items
    .map((item) => {
      const trend = item.stats.trend.reduce((sum, value) => sum + value, 0);
      const tags = item.tags.map(escapeHtml).join(", ");

      return `<article class="result" data-id="${item.id}" data-slug="${escapeHtml(
        item.slug,
      )}"><h2>${escapeHtml(item.name)}</h2><p>${escapeHtml(
        item.description,
      )}</p><p>${tags}</p><strong>${item.stats.views}:${item.stats.score}:${trend}</strong></article>`;
    })
    .join("");

  return {
    head: `<title>${escapeHtml(
      props.title ?? "Props-heavy benchmark",
    )}</title><meta name="benchmark-url" content="${escapeHtml(url)}">`,
    body: `<section class="props-heavy">${rows}</section><script type="application/json" data-props>${escapeHtml(
      JSON.stringify({
        metadata: props.metadata,
        queryState: props.queryState,
      }),
    )}</script>`,
    bodyAttrs: { "data-benchmark-scenario": "props-heavy" },
  };
}

function BenchmarkApp({
  items,
  title,
  requestId,
}: {
  items: BenchmarkItem[];
  title: string;
  requestId: string;
}) {
  const { data = [] } = useQuery({
    queryKey: ["benchmark-items", requestId],
    queryFn: async () => items,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return React.createElement(
    Shell,
    null,
    React.createElement(Helmet, null, [
      React.createElement("title", { key: "title" }, title),
      React.createElement("meta", {
        key: "description",
        name: "description",
        content: `SSR benchmark for ${data.length} items`,
      }),
      React.createElement("meta", {
        key: "request-id",
        name: "x-request-id",
        content: requestId,
      }),
    ]),
    React.createElement("header", null, [
      React.createElement("h1", { key: "h1" }, title),
      React.createElement(
        "p",
        { key: "p" },
        `Rendered with styled-components, react-helmet-async, and TanStack Query.`,
      ),
    ]),
    React.createElement(
      Grid,
      null,
      data.map((item) =>
        React.createElement(
          Card,
          { key: item.id, $featured: item.flags.featured },
          [
            React.createElement("h2", { key: "h2" }, item.name),
            React.createElement("p", { key: "description" }, item.description),
            React.createElement("div", { key: "stats" }, [
              React.createElement(
                Stat,
                { key: "views" },
                `${item.stats.views} views`,
              ),
              React.createElement(
                Stat,
                { key: "score" },
                `${item.stats.score} score`,
              ),
              React.createElement(
                Stat,
                { key: "tags" },
                `${item.tags.length} tags`,
              ),
            ]),
          ],
        ),
      ),
    ),
  );
}

function renderReactStack(
  _url: string,
  props: BenchmarkProps,
): BenchmarkRenderOutput {
  const items = props.items ?? [];
  const requestId = props.requestId ?? "benchmark";
  const title = props.title ?? "React stack benchmark";
  const helmetContext: { helmet?: any } = {};
  const queryClient = new QueryClient();
  const queryKey = ["benchmark-items", requestId];
  queryClient.setQueryData(queryKey, items);

  const sheet = new ServerStyleSheet();

  try {
    const app = React.createElement(
      HelmetProvider,
      { context: helmetContext },
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(
          StyleSheetManager,
          { sheet: sheet.instance },
          React.createElement(BenchmarkApp, { items, title, requestId }),
        ),
      ),
    );

    const html = renderToString(app);
    const styleTags = sheet.getStyleTags();
    const helmet = helmetContext.helmet;
    const dehydrated = dehydrate(queryClient);

    return {
      head: [
        helmet?.title?.toString() ?? `<title>${escapeHtml(title)}</title>`,
        helmet?.meta?.toString() ?? "",
        styleTags,
      ].join(""),
      body: `${html}<script type="application/json" data-react-query-state>${escapeHtml(
        JSON.stringify(dehydrated),
      )}</script>`,
      bodyAttrs: { "data-benchmark-scenario": "react-stack" },
    };
  } finally {
    sheet.seal();
    queryClient.clear();
  }
}

export function renderBenchmarkPayload(
  url: string,
  props: BenchmarkProps,
): BenchmarkRenderOutput {
  switch (props.scenario ?? "basic") {
    case "props-heavy":
      return renderPropsHeavy(url, props);
    case "react-stack":
      return renderReactStack(url, props);
    case "basic":
    default:
      return renderBasic(url, props);
  }
}

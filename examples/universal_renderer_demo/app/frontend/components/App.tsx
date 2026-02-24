import { useQuery } from "@tanstack/react-query";
import styled from "styled-components";

type DemoRow = {
  id: number;
  label: string;
  value: string;
};

type DemoPayload = {
  records: number;
  size_kb: number;
  blob: string;
  rows: DemoRow[];
};

type DemoMetrics = {
  records: number;
  size_kb: number;
  blob_bytes: number;
};

export type Props = {
  rendered_at?: string;
  demo_payload?: DemoPayload;
  react_query?: Array<{
    query_key?: unknown;
    data?: unknown;
  }>;
};

export function App({ rendered_at: renderedAt, demo_payload: payload }: Props) {
  const { data: message } = useQuery({
    queryKey: ["demo-message"],
    queryFn: async () => "React Query says: (fetched on client)",
    staleTime: 60_000,
  });
  const { data: metrics } = useQuery<DemoMetrics>({
    queryKey: ["demo-metrics"],
    queryFn: async () => ({
      records: 0,
      size_kb: 0,
      blob_bytes: 0,
    }),
    staleTime: 60_000,
  });
  const { data: firstRow } = useQuery<DemoRow | null>({
    queryKey: ["demo-first-row"],
    queryFn: async () => null,
    staleTime: 60_000,
  });

  return (
    <Card>
      <Title>UniversalRenderer Demo</Title>
      <p>{typeof message === "string" ? message : "React Query cache miss."}</p>
      <Muted>SSR timestamp: {renderedAt || "n/a"}</Muted>
      <SectionTitle>React Query cache seeds</SectionTitle>
      <Code>{JSON.stringify(metrics, null, 2)}</Code>
      <Code>{JSON.stringify(firstRow, null, 2)}</Code>
      <SectionTitle>Large prop payload</SectionTitle>
      <p>rows: {payload?.rows?.length || 0}</p>
      <p>blob bytes: {payload?.blob?.length || 0}</p>
      <Code>{JSON.stringify(payload?.rows?.slice(0, 3) || [], null, 2)}</Code>
      <SectionTitle>Try larger payloads</SectionTitle>
      <Links>
        <a href="/?records=50&size_kb=16">small</a>
        <a href="/?records=500&size_kb=128">medium</a>
        <a href="/?records=1000&size_kb=256">large</a>
      </Links>
    </Card>
  );
}

const Card = styled.main`
  font-family: sans-serif;
  padding: 2rem;
  max-width: 48rem;
  margin: 0 auto;
  border: 1px solid #ddd;
  border-radius: 12px;
`;

const Title = styled.h1`
  margin: 0 0 1rem 0;
`;

const SectionTitle = styled.h2`
  margin: 1.5rem 0 0.5rem 0;
  font-size: 1.1rem;
`;

const Muted = styled.p`
  color: #666;
  margin-bottom: 0;
`;

const Code = styled.pre`
  background: #f8f8f8;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 0.75rem;
  font-size: 0.85rem;
  overflow-x: auto;
`;

const Links = styled.p`
  display: flex;
  gap: 0.75rem;
`;

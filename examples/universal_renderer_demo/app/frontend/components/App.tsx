import { useQuery } from "@tanstack/react-query";
import styled from "styled-components";

export type Props = {
  rendered_at?: string;
  react_query?: Array<{
    query_key?: unknown;
    data?: unknown;
  }>;
};

export function App({ rendered_at: renderedAt }: Props) {
  const { data } = useQuery({
    queryKey: ["demo-message"],
    queryFn: async () => "React Query says: (fetched on client)",
    staleTime: 60_000,
  });

  return (
    <Card>
      <Title>UniversalRenderer Demo</Title>
      <p>{typeof data === "string" ? data : "React Query cache miss."}</p>
      <Muted>SSR timestamp: {renderedAt || "n/a"}</Muted>
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

const Muted = styled.p`
  color: #666;
  margin-bottom: 0;
`;

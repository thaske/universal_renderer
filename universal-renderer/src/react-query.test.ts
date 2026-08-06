import { describe, expect, it, vi } from "vitest";
import { hydrateReactQuery } from "./react-query";

const target = () => {
  const setQueryData = vi.fn();
  return { setQueryData };
};

describe("hydrateReactQuery", () => {
  it("seeds the shape the gem's add_query_data produces", () => {
    const client = target();

    const seeded = hydrateReactQuery(
      {
        react_query: [
          { query_key: ["users", 1], data: { name: "Ada" } },
          { query_key: ["flags"], data: ["beta"] },
        ],
      },
      client,
    );

    expect(seeded).toBe(2);
    expect(client.setQueryData).toHaveBeenCalledWith(["users", 1], {
      name: "Ada",
    });
    expect(client.setQueryData).toHaveBeenCalledWith(["flags"], ["beta"]);
  });

  it("returns 0 when Rails sent no query data", () => {
    const client = target();

    expect(hydrateReactQuery(undefined, client)).toBe(0);
    expect(hydrateReactQuery({}, client)).toBe(0);
    expect(hydrateReactQuery({ react_query: "nope" as any }, client)).toBe(0);
    expect(client.setQueryData).not.toHaveBeenCalled();
  });

  it("skips entries with no usable key instead of poisoning the cache", () => {
    const client = target();

    const seeded = hydrateReactQuery(
      {
        react_query: [
          { data: "orphan" },
          { query_key: [], data: "empty" },
          { query_key: ["ok"], data: 1 },
        ],
      },
      client,
    );

    expect(seeded).toBe(1);
    expect(client.setQueryData).toHaveBeenCalledOnce();
    expect(client.setQueryData).toHaveBeenCalledWith(["ok"], 1);
  });

  it("reads a custom prop name", () => {
    const client = target();

    expect(
      hydrateReactQuery({ cache: [{ query_key: ["a"], data: 1 }] }, client, {
        prop: "cache",
      }),
    ).toBe(1);
  });
});

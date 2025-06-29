import { describe, expect, it, vi } from "vitest";

describe("Bun stdio renderer", () => {
  // Skip tests if not running in Bun environment
  if (typeof Bun === "undefined") {
    it.skip("Skipping Bun stdio tests - not running in Bun environment", () => {});
    return;
  }

  describe("createRenderer", () => {
    it("should create renderer with Bun-specific stdio handling", async () => {
      // Mock Bun.stdin and Bun.stdout
      const mockStdin = {
        stream: vi.fn().mockReturnValue({
          getReader: vi.fn().mockReturnValue({
            read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
          }),
        }),
      };

      const mockStdout = {
        write: vi.fn(),
      };

      // Mock Bun globals
      const originalBun = globalThis.Bun;
      globalThis.Bun = {
        ...originalBun,
        stdin: mockStdin as any,
        stdout: mockStdout as any,
      };

      try {
        const { createRenderer } = await import("./index");

        const options = {
          setup: async () => ({ test: "bun-context" }),
          render: async () => ({
            head: "<title>Bun IO Test</title>",
            body: "<div>Bun IO content</div>",
          }),
        };

        // This should not throw
        await expect(createRenderer(options)).resolves.not.toThrow();
      } finally {
        // Restore original Bun
        globalThis.Bun = originalBun;
      }
    });

    it("should handle JSON input/output correctly", async () => {
      const testInput = JSON.stringify({ url: "/test", props: { key: "value" } });
      const expectedOutput = {
        head: "<title>Bun Test</title>",
        body: "<div>Bun rendered</div>",
        bodyAttrs: "",
      };

      let capturedOutput = "";
      const mockStdout = {
        write: vi.fn().mockImplementation((data: string) => {
          capturedOutput += data;
        }),
      };

      const mockStdin = {
        stream: vi.fn().mockReturnValue({
          getReader: vi.fn().mockReturnValue({
            read: vi.fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode(testInput + "\n"),
              })
              .mockResolvedValue({ done: true, value: undefined }),
          }),
        }),
      };

      const originalBun = globalThis.Bun;
      globalThis.Bun = {
        ...originalBun,
        stdin: mockStdin as any,
        stdout: mockStdout as any,
      };

      try {
        const { createRenderer } = await import("./index");

        const options = {
          setup: vi.fn().mockResolvedValue({ test: "context" }),
          render: vi.fn().mockResolvedValue({
            head: "<title>Bun Test</title>",
            body: "<div>Bun rendered</div>",
          }),
        };

        await createRenderer(options);

        expect(options.setup).toHaveBeenCalledWith("/test", { key: "value" });
        expect(options.render).toHaveBeenCalledWith({ test: "context" });
        expect(mockStdout.write).toHaveBeenCalledWith(
          JSON.stringify(expectedOutput) + "\n"
        );
      } finally {
        globalThis.Bun = originalBun;
      }
    });

    it("should handle errors gracefully", async () => {
      const testInput = JSON.stringify({ url: "/test", props: {} });
      const error = new Error("Bun render failed");

      let capturedOutput = "";
      const mockStdout = {
        write: vi.fn().mockImplementation((data: string) => {
          capturedOutput += data;
        }),
      };

      const mockStdin = {
        stream: vi.fn().mockReturnValue({
          getReader: vi.fn().mockReturnValue({
            read: vi.fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode(testInput + "\n"),
              })
              .mockResolvedValue({ done: true, value: undefined }),
          }),
        }),
      };

      const originalBun = globalThis.Bun;
      globalThis.Bun = {
        ...originalBun,
        stdin: mockStdin as any,
        stdout: mockStdout as any,
      };

      try {
        const { createRenderer } = await import("./index");

        const options = {
          setup: vi.fn().mockResolvedValue({}),
          render: vi.fn().mockRejectedValue(error),
          error: vi.fn(),
        };

        await createRenderer(options);

        expect(options.error).toHaveBeenCalledWith(error);
        expect(mockStdout.write).toHaveBeenCalledWith(
          JSON.stringify({
            head: "",
            body: "",
            bodyAttrs: "",
            error: "Bun render failed",
          }) + "\n"
        );
      } finally {
        globalThis.Bun = originalBun;
      }
    });
  });

  describe("error handling", () => {
    it("should throw when setup callback is missing", async () => {
      const { createRenderer } = await import("./index");

      await expect(createRenderer({ render: async () => ({ body: "test" }) } as any))
        .rejects.toThrow("setup callback is required");
    });

    it("should throw when render callback is missing", async () => {
      const { createRenderer } = await import("./index");

      await expect(createRenderer({ setup: async () => ({}) } as any))
        .rejects.toThrow("render callback is required");
    });
  });
});

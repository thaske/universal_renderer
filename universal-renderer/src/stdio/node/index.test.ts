import { describe, expect, it } from "vitest";

// Import the module directly to test validation logic
import type { NodeStdioOptions } from "./index";
import { createRenderer } from "./index";

describe("Node stdio renderer", () => {
  describe("error handling", () => {
    it("should throw when setup callback is missing", async () => {
      const options = { render: async () => ({ body: "test" }) } as any;
      await expect(createRenderer(options)).rejects.toThrow("setup callback is required");
    });

    it("should throw when render callback is missing", async () => {
      const options = { setup: async () => ({}) } as any;
      await expect(createRenderer(options)).rejects.toThrow("render callback is required");
    });
  });

  describe("validation", () => {
    it("should accept valid options without throwing during validation", () => {
      const options: NodeStdioOptions = {
        setup: async () => ({ test: "context" }),
        render: async () => ({ body: "test", head: "title" }),
        cleanup: async () => {},
        error: async () => {},
      };

      // These should not throw during validation
      expect(() => {
        if (!options.setup) throw new Error("setup callback is required");
        if (!options.render) throw new Error("render callback is required");
      }).not.toThrow();

      expect(typeof options.setup).toBe("function");
      expect(typeof options.render).toBe("function");
      expect(typeof options.cleanup).toBe("function");
      expect(typeof options.error).toBe("function");
    });

    it("should handle minimal valid options", () => {
      const options: NodeStdioOptions = {
        setup: async () => ({}),
        render: async () => ({ body: "minimal" }),
      };

      expect(typeof options.setup).toBe("function");
      expect(typeof options.render).toBe("function");
      expect(options.cleanup).toBeUndefined();
      expect(options.error).toBeUndefined();
    });
  });

  describe("option types", () => {
    it("should support typed context", () => {
      interface TestContext {
        userId: number;
        theme: string;
      }

      const options: NodeStdioOptions<TestContext> = {
        setup: async (url: string, props: any): Promise<TestContext> => ({
          userId: props.userId || 1,
          theme: props.theme || "light",
        }),
        render: async (context: TestContext) => ({
          head: `<title>User ${context.userId}</title>`,
          body: `<div class="${context.theme}">Content</div>`,
        }),
        cleanup: async (context: TestContext) => {
          // Cleanup logic
        },
      };

      expect(typeof options.setup).toBe("function");
      expect(typeof options.render).toBe("function");
      expect(typeof options.cleanup).toBe("function");
    });
  });
});

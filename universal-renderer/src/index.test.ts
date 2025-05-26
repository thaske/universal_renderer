import { describe, expect, it } from "vitest";
import { SSR_MARKERS } from "./index";

describe("SSR_MARKERS", () => {
  it("should export all required marker constants", () => {
    expect(SSR_MARKERS).toBeDefined();
    expect(SSR_MARKERS.HEAD).toBe("<!-- SSR_HEAD -->");
    expect(SSR_MARKERS.BODY).toBe("<!-- SSR_BODY -->");
  });

  it("should be a readonly object", () => {
    // Verify the object is frozen (immutable)
    expect(Object.isFrozen(SSR_MARKERS)).toBe(true);
  });
});

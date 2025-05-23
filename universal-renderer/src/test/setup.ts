import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Mock Bun global object for tests
global.Bun = {
  serve: vi.fn((config: any) => ({
    hostname: config.hostname || "localhost",
    port: config.port || 3001,
    stop: vi.fn(),
    url: new URL(
      `http://${config.hostname || "localhost"}:${config.port || 3001}`,
    ),
    reload: vi.fn(),
    requestIP: vi.fn(),
    upgrade: vi.fn(),
    publish: vi.fn(),
  })),
} as any;

// Cleanup after each test case
afterEach(() => {
  cleanup();
});

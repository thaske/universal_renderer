// @vitest-environment node

import { describe, expect, it } from "vitest";
import { installBrowserGlobals } from "./index";

describe("browser storage shim", () => {
  it("does not retain values between reads", () => {
    installBrowserGlobals();

    localStorage.setItem("current-user", "alice");
    sessionStorage.setItem("csrf-token", "secret");

    expect(localStorage.getItem("current-user")).toBeNull();
    expect(sessionStorage.getItem("csrf-token")).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

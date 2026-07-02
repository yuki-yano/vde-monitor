import { configDefaults } from "@vde-monitor/shared";
import { describe, expect, it } from "vitest";

import { createWeztermRuntime, createWeztermServerKey } from "./runtime-wezterm";

describe("createWeztermServerKey", () => {
  it("uses same serverKey for null/blank/auto", () => {
    const base = createWeztermServerKey(null);
    expect(createWeztermServerKey("")).toBe(base);
    expect(createWeztermServerKey("   ")).toBe(base);
    expect(createWeztermServerKey("auto")).toBe(base);
  });

  it("normalizes trimmed targets to same serverKey", () => {
    expect(createWeztermServerKey(" dev ")).toBe(createWeztermServerKey("dev"));
  });
});

describe("createWeztermRuntime", () => {
  it("does not expose pipe or launch capabilities", () => {
    const runtime = createWeztermRuntime({
      ...configDefaults,
      token: "test-token",
      multiplexer: {
        ...configDefaults.multiplexer,
        backend: "wezterm",
      },
    });

    expect(runtime.capabilities.pipe).toBeUndefined();
    expect(runtime.capabilities.launch).toBeUndefined();
    expect("launchAgentInSession" in runtime.actions).toBe(false);
  });
});

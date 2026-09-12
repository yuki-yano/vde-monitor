import { configDefaults } from "@vde-monitor/shared";
import { describe, expect, it } from "vitest";

import { createWeztermRuntime } from "./runtime-wezterm";

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

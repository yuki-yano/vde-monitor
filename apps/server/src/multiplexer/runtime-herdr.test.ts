import { configDefaults } from "@vde-monitor/shared";
import { describe, expect, it } from "vitest";

import { createHerdrRuntime } from "./runtime-herdr";

describe("createHerdrRuntime", () => {
  it("does not expose pipe or launch capabilities in Phase 2", () => {
    const runtime = createHerdrRuntime({
      ...configDefaults,
      token: "test-token",
      multiplexer: {
        ...configDefaults.multiplexer,
        backend: "herdr",
      },
    });

    expect(runtime.backend).toBe("herdr");
    expect(runtime.capabilities.pipe).toBeUndefined();
    expect(runtime.capabilities.launch).toBeUndefined();
    expect("launchAgentInSession" in runtime.actions).toBe(false);
  });
});

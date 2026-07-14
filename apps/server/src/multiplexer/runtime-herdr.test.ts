import { configDefaults } from "@vde-monitor/shared";
import { describe, expect, it } from "vitest";

import { createHerdrRuntime } from "./runtime-herdr";

describe("createHerdrRuntime", () => {
  it("exposes launch and shutdown capabilities but no pipe capability", async () => {
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
    expect(runtime.capabilities.launch).toBeDefined();
    expect("launchAgentInSession" in runtime.actions).toBe(false);
    await expect(runtime.dispose?.()).resolves.toBeUndefined();
  });
});

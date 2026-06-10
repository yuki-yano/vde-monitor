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
  it("returns WEZTERM_UNAVAILABLE for launch-agent on wezterm backend", async () => {
    const runtime = createWeztermRuntime({
      ...configDefaults,
      token: "test-token",
      multiplexer: {
        ...configDefaults.multiplexer,
        backend: "wezterm",
      },
    });

    const result = await runtime.actions.launchAgentInSession({
      sessionName: "dev",
      agent: "codex",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected launch-agent to fail on wezterm backend");
    }
    expect(result.error.code).toBe("WEZTERM_UNAVAILABLE");
    expect(result.error.message).toBe("launch-agent requires tmux backend");
    expect(result.rollback).toEqual({ attempted: false, ok: true });
  });
});

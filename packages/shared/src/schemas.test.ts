import { describe, expect, it } from "vitest";

import { configDefaults } from "./runtime-defaults";
import {
  configOverrideSchema,
  configSchema,
  generatedConfigTemplateSchema,
  launchAgentRequestSchema,
  notificationSubscriptionRevokeSchema,
  screenResponseSchema,
} from "./schemas";

describe("launchAgentRequestSchema", () => {
  it("accepts a minimal valid payload", () => {
    const result = launchAgentRequestSchema.safeParse({
      sessionName: "dev",
      agent: "codex",
      requestId: "req-1",
    });

    expect(result.success).toBe(true);
  });

  it("rejects conflicting cwd/worktree inputs", () => {
    const result = launchAgentRequestSchema.safeParse({
      sessionName: "dev",
      agent: "codex",
      requestId: "req-1",
      cwd: "/repo",
      worktreeBranch: "feature/x",
    });

    expect(result.success).toBe(false);
  });
});

describe("notificationSubscriptionRevokeSchema", () => {
  it("requires at least one identifier", () => {
    const result = notificationSubscriptionRevokeSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts deviceId only", () => {
    const result = notificationSubscriptionRevokeSchema.safeParse({ deviceId: "device-1" });
    expect(result.success).toBe(true);
  });
});

describe("screenResponseSchema", () => {
  it("accepts text response payload", () => {
    const result = screenResponseSchema.safeParse({
      ok: true,
      paneId: "%1",
      mode: "text",
      capturedAt: "2026-02-23T00:00:00.000Z",
      screen: "hello",
    });

    expect(result.success).toBe(true);
  });
});

describe("configSchema", () => {
  it("accepts runtime defaults", () => {
    const result = configSchema.safeParse(configDefaults);
    expect(result.success).toBe(true);
  });

  it("rejects removed keys (rateLimit/input/logs)", () => {
    const result = configSchema.safeParse({
      ...configDefaults,
      rateLimit: {
        send: { windowMs: 1000, max: 10 },
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("configOverrideSchema", () => {
  it("accepts partial override", () => {
    const result = configOverrideSchema.safeParse({
      port: 12000,
      screen: {
        maxLines: 1500,
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid includeIgnoredPaths pattern", () => {
    const result = configOverrideSchema.safeParse({
      fileNavigator: {
        includeIgnoredPaths: ["!dist/**"],
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown notification events", () => {
    const result = configOverrideSchema.safeParse({
      notifications: {
        enabledEventTypes: ["pane.error"],
      },
    });

    expect(result.success).toBe(false);
  });
});

describe("generatedConfigTemplateSchema", () => {
  it("accepts required 9-key template", () => {
    const result = generatedConfigTemplateSchema.safeParse({
      multiplexer: { backend: "tmux" },
      screen: { image: { backend: "terminal" } },
      dangerKeys: ["C-c", "C-d", "C-z"],
      dangerCommandPatterns: configDefaults.dangerCommandPatterns,
      launch: configDefaults.launch,
      usagePricing: {
        providers: configDefaults.usagePricing.providers,
      },
      workspaceTabs: { displayMode: "all" },
    });

    expect(result.success).toBe(true);
  });

  it("rejects extra keys", () => {
    const result = generatedConfigTemplateSchema.safeParse({
      multiplexer: { backend: "tmux" },
      screen: { image: { backend: "terminal" } },
      dangerKeys: ["C-c", "C-d", "C-z"],
      dangerCommandPatterns: configDefaults.dangerCommandPatterns,
      launch: configDefaults.launch,
      usagePricing: {
        providers: configDefaults.usagePricing.providers,
      },
      workspaceTabs: { displayMode: "all" },
      bind: "127.0.0.1",
    });

    expect(result.success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { configDefaults } from "./runtime-defaults";
import {
  configOverrideSchema,
  configSchema,
  generatedConfigTemplateSchema,
  launchAgentRequestSchema,
  notificationSubscriptionRevokeSchema,
  screenResponseSchema,
  usageGlobalTimelineResponseSchema,
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

describe("usageGlobalTimelineResponseSchema", () => {
  const createPayload = () => ({
    timeline: {
      paneId: "global",
      now: "2026-02-25T00:00:00.000Z",
      range: "1h",
      items: [],
      totalsMs: {
        RUNNING: 0,
        WAITING_INPUT: 0,
        WAITING_PERMISSION: 0,
        SHELL: 0,
        UNKNOWN: 0,
      },
      current: null,
    },
    paneCount: 2,
    activePaneCount: 1,
    repoRanking: {
      totalRepoCount: 1,
      byRunningTimeSum: [
        {
          repoRoot: "/repo/a",
          repoName: "a",
          totalPaneCount: 1,
          activePaneCount: 1,
          runningMs: 1000,
          runningUnionMs: 1000,
          executionCount: 2,
          approximate: false,
          approximationReason: null,
        },
      ],
      byRunningTimeUnion: [],
      byRunningTransitions: [],
    },
    fetchedAt: "2026-02-25T00:00:00.000Z",
  });

  it("accepts response with required repoRanking", () => {
    const result = usageGlobalTimelineResponseSchema.safeParse(createPayload());
    expect(result.success).toBe(true);
  });

  it("accepts approximationReason as retention_clipped", () => {
    const payload = createPayload();
    const result = usageGlobalTimelineResponseSchema.safeParse({
      ...payload,
      repoRanking: {
        ...payload.repoRanking,
        byRunningTimeSum: payload.repoRanking.byRunningTimeSum.map((item, index) =>
          index === 0
            ? { ...item, approximate: true, approximationReason: "retention_clipped" as const }
            : item,
        ),
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing repoRanking", () => {
    const payload = createPayload();
    const result = usageGlobalTimelineResponseSchema.safeParse({
      ...payload,
      repoRanking: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing ranking arrays", () => {
    const payload = createPayload();
    const result = usageGlobalTimelineResponseSchema.safeParse({
      ...payload,
      repoRanking: {
        totalRepoCount: payload.repoRanking.totalRepoCount,
        byRunningTimeSum: payload.repoRanking.byRunningTimeSum,
        byRunningTransitions: payload.repoRanking.byRunningTransitions,
      },
    });
    expect(result.success).toBe(false);
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

  it("accepts partial usage override", () => {
    const result = configOverrideSchema.safeParse({
      usage: {
        session: {
          providers: {
            codex: {
              enabled: false,
            },
          },
        },
      },
    });

    expect(result.success).toBe(true);
  });
});

describe("generatedConfigTemplateSchema", () => {
  it("accepts required generated template", () => {
    const result = generatedConfigTemplateSchema.safeParse({
      multiplexer: { backend: "tmux" },
      screen: { image: { backend: "terminal" } },
      dangerKeys: ["C-c", "C-d", "C-z"],
      dangerCommandPatterns: configDefaults.dangerCommandPatterns,
      launch: configDefaults.launch,
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
      workspaceTabs: { displayMode: "all" },
      bind: "127.0.0.1",
    });

    expect(result.success).toBe(false);
  });
});

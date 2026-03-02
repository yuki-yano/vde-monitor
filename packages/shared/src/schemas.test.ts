import { describe, expect, it } from "vitest";

import { configDefaults } from "./runtime-defaults";
import {
  configOverrideSchema,
  configSchema,
  generatedConfigTemplateSchema,
  launchAgentRequestSchema,
  notificationSubscriptionRevokeSchema,
  screenResponseSchema,
  summaryEventSchema,
  summaryPublishConnectionInfoSchema,
  summaryPublishErrorResponseSchema,
  summaryPublishRequestSchema,
  summaryPublishSuccessResponseSchema,
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

  it("accepts summary source/engine overrides", () => {
    const result = configOverrideSchema.safeParse({
      notifications: {
        summary: {
          enabled: true,
          sources: {
            claude: {
              waitMs: 25000,
              engine: {
                agent: "codex",
                model: "gpt-5.3-codex-spark",
                effort: "low",
              },
            },
          },
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("accepts summary language override", () => {
    const result = configOverrideSchema.safeParse({
      notifications: {
        summary: {
          lang: "ja",
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects unsupported summary language", () => {
    const result = configOverrideSchema.safeParse({
      notifications: {
        summary: {
          lang: "fr",
        },
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

describe("summaryEventSchema", () => {
  it("accepts valid summary event payload", () => {
    const result = summaryEventSchema.safeParse({
      ts: "2026-02-27T00:00:00.000Z",
      summary_id: "01JY0000000000000000000000",
      source_agent: "codex",
      event_type: "task_completed_summary",
      source_event_at: "2026-02-27T00:00:00.000Z",
      pane_locator: {
        tmux_pane: "%12",
        tty: "ttys001",
        cwd: "/repo",
      },
      summary: {
        pane_title: "Fix done",
        notification_title: "Fix completed",
        notification_body: "Parser fix completed and waiting for review",
      },
      engine: {
        agent: "codex",
        model: "gpt-5.3-codex-spark",
        effort: "low",
      },
      source: {
        turn_id: "turn-1",
      },
    });

    expect(result.success).toBe(true);
  });
});

describe("summaryPublishRequestSchema", () => {
  it("accepts valid publish request payload", () => {
    const result = summaryPublishRequestSchema.safeParse({
      schemaVersion: 1,
      eventId: "evt-1",
      locator: {
        source: "codex",
        runId: "run-1",
        paneId: "%12",
        eventType: "pane.task_completed",
        sequence: 1,
      },
      sourceEventAt: "2026-03-02T00:00:00.000Z",
      summary: {
        paneTitle: "Fix done",
        notificationTitle: "Fix completed",
        notificationBody: "Parser fix completed and waiting for review",
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects unsupported eventType", () => {
    const result = summaryPublishRequestSchema.safeParse({
      schemaVersion: 1,
      eventId: "evt-1",
      locator: {
        source: "codex",
        runId: "run-1",
        paneId: "%12",
        eventType: "pane.waiting_permission",
        sequence: 1,
      },
      sourceEventAt: "2026-03-02T00:00:00.000Z",
      summary: {
        paneTitle: "Fix done",
        notificationTitle: "Fix completed",
        notificationBody: "Parser fix completed and waiting for review",
      },
    });

    expect(result.success).toBe(false);
  });
});

describe("summary publish response schemas", () => {
  it("accepts success response", () => {
    const result = summaryPublishSuccessResponseSchema.safeParse({
      schemaVersion: 1,
      eventId: "evt-1",
      deduplicated: false,
    });

    expect(result.success).toBe(true);
  });

  it("accepts error response with retryAfterSec", () => {
    const result = summaryPublishErrorResponseSchema.safeParse({
      schemaVersion: 1,
      code: "rate_limit",
      message: "rate limited",
      eventId: "evt-1",
      retryAfterSec: 3,
    });

    expect(result.success).toBe(true);
  });
});

describe("summaryPublishConnectionInfoSchema", () => {
  it("accepts valid connection info payload", () => {
    const result = summaryPublishConnectionInfoSchema.safeParse({
      schemaVersion: 1,
      endpoint: "http://127.0.0.1:11080/api/notifications/summary-events",
      listenerType: "loopback",
      bind: "127.0.0.1",
      tokenRef: "summary-token",
    });

    expect(result.success).toBe(true);
  });

  it("accepts network listener payload", () => {
    const result = summaryPublishConnectionInfoSchema.safeParse({
      schemaVersion: 1,
      endpoint: "http://100.64.0.10:11080/api/notifications/summary-events",
      listenerType: "network",
      bind: "100.64.0.10",
      tokenRef: "summary-token",
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

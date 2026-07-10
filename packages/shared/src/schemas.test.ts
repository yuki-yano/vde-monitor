import { describe, expect, it } from "vitest";

import { configDefaults } from "./runtime-defaults";
import {
  acknowledgeSessionViewRequestSchema,
  codexHookEventSchema,
  configOverrideSchema,
  configSchema,
  generatedConfigTemplateSchema,
  launchAgentRequestSchema,
  notificationSubscriptionRevokeSchema,
  screenResponseSchema,
  sessionStateSchema,
  sessionStateTimelineSourceSchema,
  sessionSummarySchema,
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
        DONE: 0,
        WAITING_INPUT: 0,
        WAITING_PERMISSION: 0,
        SHELL: 0,
        UNKNOWN: 0,
      },
      current: null,
    },
    paneCount: 2,
    activePaneCount: 1,
    fetchedAt: "2026-02-25T00:00:00.000Z",
  });

  it("accepts response payload", () => {
    const result = usageGlobalTimelineResponseSchema.safeParse(createPayload());
    expect(result.success).toBe(true);
  });

  it("rejects missing fetchedAt", () => {
    const payload = createPayload();
    const result = usageGlobalTimelineResponseSchema.safeParse({
      ...payload,
      fetchedAt: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing timeline", () => {
    const payload = createPayload();
    const result = usageGlobalTimelineResponseSchema.safeParse({
      ...payload,
      timeline: undefined,
    });
    expect(result.success).toBe(false);
  });
});

describe("session completion schemas", () => {
  const summary = {
    paneId: "%1",
    sessionName: "main",
    windowIndex: 0,
    paneIndex: 0,
    paneActive: true,
    currentCommand: "codex",
    currentPath: "/repo",
    paneTty: "ttys001",
    title: null,
    customTitle: null,
    repoRoot: "/repo",
    agent: "codex",
    completion: { epoch: "epoch-1", completedSeq: 1, acknowledgedSeq: 0 },
    state: "DONE",
    stateReason: "hook:stop",
    lastMessage: null,
    lastOutputAt: null,
    lastEventAt: null,
    lastInputAt: null,
    paneDead: false,
    alternateOn: false,
    pipeAttached: false,
    pipeConflict: false,
  };

  it("accepts DONE, completion metadata, and view timeline source", () => {
    expect(sessionStateSchema.safeParse("DONE").success).toBe(true);
    expect(sessionSummarySchema.safeParse(summary).success).toBe(true);
    expect(sessionStateTimelineSourceSchema.safeParse("view").success).toBe(true);
  });

  it("requires nullable completion metadata on session summaries", () => {
    const { completion: _completion, ...missing } = summary;
    expect(sessionSummarySchema.safeParse(missing).success).toBe(false);
    expect(sessionSummarySchema.safeParse({ ...summary, completion: null }).success).toBe(true);
  });

  it("validates strict acknowledge request boundaries", () => {
    expect(
      acknowledgeSessionViewRequestSchema.safeParse({ epoch: "epoch-1", throughSeq: 0 }).success,
    ).toBe(true);
    expect(
      acknowledgeSessionViewRequestSchema.safeParse({
        epoch: "epoch-1",
        throughSeq: Number.MAX_SAFE_INTEGER,
      }).success,
    ).toBe(true);
    expect(
      acknowledgeSessionViewRequestSchema.safeParse({
        epoch: "é",
        throughSeq: 0,
      }).success,
    ).toBe(false);
    expect(
      acknowledgeSessionViewRequestSchema.safeParse({
        epoch: "epoch-1",
        throughSeq: 0,
        extra: true,
      }).success,
    ).toBe(false);
  });
});

describe("codexHookEventSchema", () => {
  const createEvent = () => ({
    ts: "2026-07-02T00:00:00.000Z",
    hook_event_name: "PermissionRequest",
    session_id: "codex-session-1",
    cwd: "/repo",
    tmux_pane: "%1",
    payload: { raw: "{}" },
  });

  it("accepts a codex hook event", () => {
    const result = codexHookEventSchema.safeParse(createEvent());
    expect(result.success).toBe(true);
  });

  it("accepts all codex hook event names", () => {
    const names = ["PreToolUse", "PostToolUse", "PermissionRequest", "Stop", "UserPromptSubmit"];
    names.forEach((name) => {
      const result = codexHookEventSchema.safeParse({
        ...createEvent(),
        hook_event_name: name,
      });
      expect(result.success).toBe(true);
    });
  });

  it("rejects claude-only Notification event name", () => {
    const result = codexHookEventSchema.safeParse({
      ...createEvent(),
      hook_event_name: "Notification",
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

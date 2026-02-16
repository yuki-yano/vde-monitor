import { describe, expect, it } from "vitest";

import { defaultConfig } from "./constants";
import {
  apiErrorSchema,
  claudeHookEventSchema,
  configOverrideSchema,
  configSchema,
  imageAttachmentSchema,
  launchAgentRequestSchema,
  launchCommandResponseSchema,
  screenResponseSchema,
  sessionStateSchema,
  wsClientMessageSchema,
  wsServerMessageSchema,
} from "./schemas";

describe("sessionStateSchema", () => {
  it("rejects DONE state", () => {
    const result = sessionStateSchema.safeParse("DONE");
    expect(result.success).toBe(false);
  });
});

describe("wsClientMessageSchema", () => {
  it("accepts send.keys with extended control keys", () => {
    const result = wsClientMessageSchema.safeParse({
      type: "send.keys",
      ts: "2025-01-01T00:00:00Z",
      data: {
        paneId: "%1",
        keys: [
          "BTab",
          "C-a",
          "C-Tab",
          "C-BTab",
          "C-Left",
          "C-Right",
          "C-Up",
          "C-Down",
          "C-Enter",
          "C-Escape",
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts send.raw with text and key items", () => {
    const result = wsClientMessageSchema.safeParse({
      type: "send.raw",
      ts: "2025-01-01T00:00:00Z",
      data: {
        paneId: "%1",
        items: [
          { kind: "text", value: "ls -la" },
          { kind: "key", value: "Enter" },
          { kind: "key", value: "C-d" },
        ],
        unsafe: true,
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown keys", () => {
    const result = wsClientMessageSchema.safeParse({
      type: "send.keys",
      ts: "2025-01-01T00:00:00Z",
      data: {
        paneId: "%1",
        keys: ["Meta-Left"],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects messages missing required data", () => {
    const result = wsClientMessageSchema.safeParse({
      type: "send.text",
      ts: "2025-01-01T00:00:00Z",
      data: { paneId: "%1" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts screen.request with mode and lines", () => {
    const result = wsClientMessageSchema.safeParse({
      type: "screen.request",
      ts: "2025-01-01T00:00:00Z",
      data: { paneId: "%1", lines: 120, mode: "image" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts screen.request with cursor", () => {
    const result = wsClientMessageSchema.safeParse({
      type: "screen.request",
      ts: "2025-01-01T00:00:00Z",
      data: { paneId: "%1", mode: "text", cursor: "cursor-1" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects client.ping with extra fields", () => {
    const result = wsClientMessageSchema.safeParse({
      type: "client.ping",
      ts: "2025-01-01T00:00:00Z",
      data: { extra: true },
    });
    expect(result.success).toBe(false);
  });

  it("rejects send.keys when keys are missing", () => {
    const result = wsClientMessageSchema.safeParse({
      type: "send.keys",
      ts: "2025-01-01T00:00:00Z",
      data: { paneId: "%1" },
    });
    expect(result.success).toBe(false);
  });
});

describe("screenResponseSchema", () => {
  it("accepts text response with screen content", () => {
    const result = screenResponseSchema.safeParse({
      ok: true,
      paneId: "%1",
      mode: "text",
      capturedAt: "2025-01-01T00:00:00Z",
      screen: "output",
    });
    expect(result.success).toBe(true);
  });

  it("accepts text response with deltas and cursor", () => {
    const result = screenResponseSchema.safeParse({
      ok: true,
      paneId: "%1",
      mode: "text",
      capturedAt: "2025-01-01T00:00:00Z",
      cursor: "cursor-2",
      full: false,
      deltas: [{ start: 1, deleteCount: 1, insertLines: ["next"] }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts image response with imageBase64", () => {
    const result = screenResponseSchema.safeParse({
      ok: true,
      paneId: "%1",
      mode: "image",
      capturedAt: "2025-01-01T00:00:00Z",
      imageBase64: "abcd",
    });
    expect(result.success).toBe(true);
  });

  it("rejects response without required fields", () => {
    const result = screenResponseSchema.safeParse({
      ok: true,
      paneId: "%1",
    });
    expect(result.success).toBe(false);
  });

  it("accepts error response with error payload", () => {
    const result = screenResponseSchema.safeParse({
      ok: false,
      paneId: "%1",
      mode: "text",
      capturedAt: "2025-01-01T00:00:00Z",
      error: { code: "INVALID_PANE", message: "bad pane" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects response with invalid mode", () => {
    const result = screenResponseSchema.safeParse({
      ok: true,
      paneId: "%1",
      mode: "video",
      capturedAt: "2025-01-01T00:00:00Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("apiErrorSchema", () => {
  it("accepts WEZTERM_UNAVAILABLE error code", () => {
    const result = apiErrorSchema.safeParse({
      code: "WEZTERM_UNAVAILABLE",
      message: "wezterm is not running",
    });
    expect(result.success).toBe(true);
  });
});

describe("imageAttachmentSchema", () => {
  it("accepts valid attachment payload", () => {
    const result = imageAttachmentSchema.safeParse({
      path: "/tmp/vde-monitor/attachments/%251/mobile-20260206-000000-abcd1234.png",
      mimeType: "image/png",
      size: 1024,
      createdAt: "2026-02-06T00:00:00.000Z",
      insertText: "/tmp/vde-monitor/attachments/%251/mobile-20260206-000000-abcd1234.png ",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unsupported mime type", () => {
    const result = imageAttachmentSchema.safeParse({
      path: "/tmp/vde-monitor/attachments/%251/mobile-20260206-000000-abcd1234.gif",
      mimeType: "image/gif",
      size: 1024,
      createdAt: "2026-02-06T00:00:00.000Z",
      insertText: "/tmp/vde-monitor/attachments/%251/mobile-20260206-000000-abcd1234.gif ",
    });
    expect(result.success).toBe(false);
  });
});

describe("wsServerMessageSchema", () => {
  it("accepts screen.response payloads", () => {
    const result = wsServerMessageSchema.safeParse({
      type: "screen.response",
      ts: "2025-01-01T00:00:00Z",
      data: {
        ok: true,
        paneId: "%1",
        mode: "image",
        capturedAt: "2025-01-01T00:00:00Z",
        imageBase64: "abcd",
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts session.updated payloads", () => {
    const result = wsServerMessageSchema.safeParse({
      type: "session.updated",
      ts: "2025-01-01T00:00:00Z",
      data: {
        session: {
          paneId: "%1",
          sessionName: "main",
          windowIndex: 0,
          paneIndex: 0,
          windowActivity: null,
          paneActive: true,
          currentCommand: "zsh",
          currentPath: "/tmp",
          paneTty: "/dev/ttys001",
          title: "title",
          customTitle: null,
          branch: "feature/worktree",
          worktreePath: "/tmp",
          worktreeDirty: true,
          worktreeLocked: true,
          worktreeLockOwner: "codex",
          worktreeLockReason: "in progress",
          worktreeMerged: false,
          repoRoot: "/tmp",
          agent: "codex",
          state: "RUNNING",
          stateReason: "recent_output",
          lastMessage: null,
          lastOutputAt: null,
          lastEventAt: null,
          lastInputAt: null,
          paneDead: false,
          alternateOn: false,
          pipeAttached: false,
          pipeConflict: false,
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts sessions.snapshot payloads", () => {
    const result = wsServerMessageSchema.safeParse({
      type: "sessions.snapshot",
      ts: "2025-01-01T00:00:00Z",
      data: {
        sessions: [
          {
            paneId: "%1",
            sessionName: "main",
            windowIndex: 0,
            paneIndex: 0,
            windowActivity: null,
            paneActive: false,
            currentCommand: null,
            currentPath: null,
            paneTty: null,
            title: null,
            customTitle: null,
            branch: null,
            worktreePath: null,
            worktreeDirty: null,
            worktreeLocked: null,
            worktreeLockOwner: null,
            worktreeLockReason: null,
            worktreeMerged: null,
            repoRoot: null,
            agent: "unknown",
            state: "UNKNOWN",
            stateReason: "no_signal",
            lastMessage: null,
            lastOutputAt: null,
            lastEventAt: null,
            lastInputAt: null,
            paneDead: false,
            alternateOn: false,
            pipeAttached: false,
            pipeConflict: false,
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts session.removed payloads", () => {
    const result = wsServerMessageSchema.safeParse({
      type: "session.removed",
      ts: "2025-01-01T00:00:00Z",
      data: { paneId: "%9" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts server.health payloads", () => {
    const result = wsServerMessageSchema.safeParse({
      type: "server.health",
      ts: "2025-01-01T00:00:00Z",
      data: { version: "0.0.1" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts server.health payloads with client config", () => {
    const result = wsServerMessageSchema.safeParse({
      type: "server.health",
      ts: "2025-01-01T00:00:00Z",
      data: {
        version: "0.0.1",
        clientConfig: {
          screen: { highlightCorrection: { codex: false, claude: true } },
          fileNavigator: { autoExpandMatchLimit: 100 },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts command.response payloads with error", () => {
    const result = wsServerMessageSchema.safeParse({
      type: "command.response",
      ts: "2025-01-01T00:00:00Z",
      data: {
        ok: false,
        error: { code: "RATE_LIMIT", message: "slow down" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts command.response payloads without error", () => {
    const result = wsServerMessageSchema.safeParse({
      type: "command.response",
      ts: "2025-01-01T00:00:00Z",
      data: { ok: true },
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown message types", () => {
    const result = wsServerMessageSchema.safeParse({
      type: "unknown.event",
      ts: "2025-01-01T00:00:00Z",
      data: {},
    });
    expect(result.success).toBe(false);
  });
});

describe("claudeHookEventSchema", () => {
  it("accepts minimal hook event", () => {
    const result = claudeHookEventSchema.safeParse({
      ts: "2025-01-01T00:00:00Z",
      hook_event_name: "Stop",
      session_id: "session",
      payload: { raw: "{}" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid hook_event_name", () => {
    const result = claudeHookEventSchema.safeParse({
      ts: "2025-01-01T00:00:00Z",
      hook_event_name: "Unknown",
      session_id: "session",
      payload: { raw: "{}" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts permission prompt event with tmux pane and fallback", () => {
    const result = claudeHookEventSchema.safeParse({
      ts: "2025-01-01T00:00:00Z",
      hook_event_name: "Notification",
      notification_type: "permission_prompt",
      session_id: "session",
      cwd: "/tmp",
      tty: "/dev/ttys001",
      tmux_pane: null,
      fallback: { cwd: "/tmp", transcript_path: "/tmp/log.jsonl" },
      payload: { raw: "{}" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid notification type", () => {
    const result = claudeHookEventSchema.safeParse({
      ts: "2025-01-01T00:00:00Z",
      hook_event_name: "Notification",
      notification_type: "other",
      session_id: "session",
      payload: { raw: "{}" },
    });
    expect(result.success).toBe(false);
  });
});

describe("launch schemas", () => {
  it("accepts launch agent request payload", () => {
    const result = launchAgentRequestSchema.safeParse({
      sessionName: "dev-main",
      agent: "codex",
      requestId: "req-1",
      windowName: "codex-work",
      cwd: "/tmp/work",
    });
    expect(result.success).toBe(true);
  });

  it("accepts launch request with vw worktree selector", () => {
    const result = launchAgentRequestSchema.safeParse({
      sessionName: "dev-main",
      agent: "codex",
      requestId: "req-1",
      agentOptions: ["--model", "gpt-5"],
      worktreeBranch: "feature/foo",
      worktreeCreateIfMissing: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects launch request windowName with control characters", () => {
    const result = launchAgentRequestSchema.safeParse({
      sessionName: "dev-main",
      agent: "codex",
      requestId: "req-1",
      windowName: "bad\tname",
    });
    expect(result.success).toBe(false);
  });

  it("rejects launch request when cwd and worktree selectors are mixed", () => {
    const result = launchAgentRequestSchema.safeParse({
      sessionName: "dev-main",
      agent: "codex",
      requestId: "req-1",
      cwd: "/tmp/work",
      worktreePath: "/tmp/worktree",
    });
    expect(result.success).toBe(false);
  });

  it("rejects createIfMissing launch request without worktreeBranch", () => {
    const result = launchAgentRequestSchema.safeParse({
      sessionName: "dev-main",
      agent: "codex",
      requestId: "req-1",
      worktreeCreateIfMissing: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects createIfMissing launch request when worktreePath is also provided", () => {
    const result = launchAgentRequestSchema.safeParse({
      sessionName: "dev-main",
      agent: "codex",
      requestId: "req-1",
      worktreePath: "/repo/.worktree/feature/foo",
      worktreeBranch: "feature/foo",
      worktreeCreateIfMissing: true,
    });
    expect(result.success).toBe(false);
  });

  it("accepts launch command response payload", () => {
    const result = launchCommandResponseSchema.safeParse({
      ok: true,
      result: {
        sessionName: "dev-main",
        agent: "claude",
        windowId: "@42",
        windowIndex: 3,
        windowName: "claude-work",
        paneId: "%128",
        launchedCommand: "claude",
        resolvedOptions: ["--dangerously-skip-permissions"],
        verification: {
          status: "verified",
          observedCommand: "claude",
          attempts: 1,
        },
      },
      rollback: {
        attempted: false,
        ok: true,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("configSchema", () => {
  it("fills default includeTruncated when missing", () => {
    const screen = { ...defaultConfig.screen };
    delete (screen as { includeTruncated?: boolean }).includeTruncated;
    const result = configSchema.safeParse({ ...defaultConfig, screen });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.screen.includeTruncated).toBe(false);
    }
  });

  it("fills default raw rate limit when missing", () => {
    const rateLimit: Partial<typeof defaultConfig.rateLimit> = { ...defaultConfig.rateLimit };
    delete rateLimit.raw;
    const result = configSchema.safeParse({ ...defaultConfig, rateLimit });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rateLimit.raw).toEqual(defaultConfig.rateLimit.raw);
    }
  });

  it("fills default multiplexer config when missing", () => {
    const result = configSchema.safeParse({
      ...defaultConfig,
      multiplexer: undefined,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.multiplexer).toEqual(defaultConfig.multiplexer);
    }
  });

  it("fills default launch config when missing", () => {
    const result = configSchema.safeParse({
      ...defaultConfig,
      launch: undefined,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.launch).toEqual(defaultConfig.launch);
    }
  });

  it("preserves launch agent options text", () => {
    const result = configSchema.safeParse({
      ...defaultConfig,
      launch: {
        agents: {
          codex: { options: ["  --model  ", "--approval-mode"] },
          claude: { options: ["  --dangerously-skip-permissions  "] },
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.launch.agents.codex.options).toEqual(["  --model  ", "--approval-mode"]);
      expect(result.data.launch.agents.claude.options).toEqual([
        "  --dangerously-skip-permissions  ",
      ]);
    }
  });

  it("rejects launch options with only whitespace", () => {
    const result = configSchema.safeParse({
      ...defaultConfig,
      launch: {
        agents: {
          codex: { options: ["   "] },
          claude: { options: [] },
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects launch options with forbidden control characters", () => {
    const result = configSchema.safeParse({
      ...defaultConfig,
      launch: {
        agents: {
          codex: { options: ["--model\ngpt"] },
          claude: { options: [] },
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects launch options with tab characters", () => {
    const result = configSchema.safeParse({
      ...defaultConfig,
      launch: {
        agents: {
          codex: { options: ["--model\tgpt"] },
          claude: { options: [] },
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts multiplexer backend values", () => {
    const backends = ["tmux", "wezterm"] as const;
    for (const backend of backends) {
      const result = configSchema.safeParse({
        ...defaultConfig,
        multiplexer: {
          ...defaultConfig.multiplexer,
          backend,
        },
      });
      expect(result.success).toBe(true);
    }
  });

  it("fills default wezterm config when missing", () => {
    const result = configSchema.safeParse({
      ...defaultConfig,
      multiplexer: {
        ...defaultConfig.multiplexer,
        wezterm: undefined,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.multiplexer.wezterm).toEqual(defaultConfig.multiplexer.wezterm);
    }
  });

  it("accepts nullable wezterm target", () => {
    const result = configSchema.safeParse({
      ...defaultConfig,
      multiplexer: {
        ...defaultConfig.multiplexer,
        wezterm: {
          ...defaultConfig.multiplexer.wezterm,
          target: null,
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("fills default wezterm target when missing", () => {
    const result = configSchema.safeParse({
      ...defaultConfig,
      multiplexer: {
        ...defaultConfig.multiplexer,
        wezterm: {
          ...defaultConfig.multiplexer.wezterm,
          target: undefined,
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.multiplexer.wezterm.target).toBe(defaultConfig.multiplexer.wezterm.target);
    }
  });

  it("rejects invalid wezterm cliPath", () => {
    const result = configSchema.safeParse({
      ...defaultConfig,
      multiplexer: {
        ...defaultConfig.multiplexer,
        wezterm: {
          cliPath: 123,
          target: "auto",
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts supported image backends", () => {
    const backends = ["alacritty", "terminal", "iterm", "wezterm", "ghostty"] as const;
    for (const backend of backends) {
      const result = configSchema.safeParse({
        ...defaultConfig,
        screen: {
          ...defaultConfig.screen,
          image: { ...defaultConfig.screen.image, backend },
        },
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects unsupported image backend", () => {
    const result = configSchema.safeParse({
      ...defaultConfig,
      screen: {
        ...defaultConfig.screen,
        image: { ...defaultConfig.screen.image, backend: "kitty" },
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects auto image backend", () => {
    const result = configSchema.safeParse({
      ...defaultConfig,
      screen: {
        ...defaultConfig.screen,
        image: { ...defaultConfig.screen.image, backend: "auto" },
      },
    });
    expect(result.success).toBe(false);
  });

  it("fills default fileNavigator config when missing", () => {
    const result = configSchema.safeParse({
      ...defaultConfig,
      fileNavigator: undefined,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fileNavigator).toEqual(defaultConfig.fileNavigator);
    }
  });

  it("accepts includeIgnoredPaths gitignore-like patterns", () => {
    const result = configSchema.safeParse({
      ...defaultConfig,
      fileNavigator: {
        includeIgnoredPaths: [
          "build/**",
          "dist/**/*.map",
          ".claude/**",
          "logs/*-debug.log",
          "**/*.snap",
        ],
        autoExpandMatchLimit: 120,
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects includeIgnoredPaths negation pattern", () => {
    const result = configSchema.safeParse({
      ...defaultConfig,
      fileNavigator: {
        includeIgnoredPaths: ["!dist/**"],
        autoExpandMatchLimit: 100,
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects includeIgnoredPaths absolute path pattern", () => {
    const result = configSchema.safeParse({
      ...defaultConfig,
      fileNavigator: {
        includeIgnoredPaths: ["/dist/**"],
        autoExpandMatchLimit: 100,
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects includeIgnoredPaths parent traversal pattern", () => {
    const result = configSchema.safeParse({
      ...defaultConfig,
      fileNavigator: {
        includeIgnoredPaths: ["../dist/**"],
        autoExpandMatchLimit: 100,
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("configOverrideSchema", () => {
  it("covers all top-level keys from configSchema", () => {
    const configKeys = Object.keys(configSchema.shape).sort();
    const overrideKeys = Object.keys(configOverrideSchema.shape).sort();
    expect(overrideKeys).toEqual(configKeys);
  });

  it("accepts deep-partial override payload", () => {
    const result = configOverrideSchema.safeParse({
      rateLimit: {
        send: {
          max: 20,
        },
      },
      fileNavigator: {
        autoExpandMatchLimit: 120,
      },
      screen: {
        image: {
          backend: "wezterm",
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid includeIgnoredPaths pattern in override", () => {
    const result = configOverrideSchema.safeParse({
      fileNavigator: {
        includeIgnoredPaths: ["!dist/**"],
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts launch options override", () => {
    const result = configOverrideSchema.safeParse({
      launch: {
        agents: {
          codex: {
            options: [" --model "],
          },
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.launch?.agents?.codex?.options).toEqual([" --model "]);
    }
  });

  it("rejects launch options override with newline", () => {
    const result = configOverrideSchema.safeParse({
      launch: {
        agents: {
          claude: {
            options: ["--flag\nbad"],
          },
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects launch options override with tab", () => {
    const result = configOverrideSchema.safeParse({
      launch: {
        agents: {
          claude: {
            options: ["--flag\tbad"],
          },
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown top-level keys in override", () => {
    const result = configOverrideSchema.safeParse({
      unknownKey: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown nested keys in override", () => {
    const result = configOverrideSchema.safeParse({
      rateLimit: {
        send: {
          unknownNested: 1,
        },
      },
    });
    expect(result.success).toBe(false);
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildCodexHookEvent,
  buildHookEvent,
  createHerdrReporter,
  deriveHerdrAgentStatus,
  extractCodexPayloadFields,
  extractPayloadFields,
  isClaudeNonInteractivePayload,
  isCodexNonInteractivePayload,
  isMainModule,
  parseHookCliArgs,
  resolveHookServerKey,
  resolveTmuxPane,
  resolveTranscriptPath,
  shouldPersistCodexHookPayload,
  shouldPersistHookPayload,
} from "./cli";

describe("hooks cli helpers", () => {
  it("resolves transcript path from cwd and session id", () => {
    const transcriptPath = resolveTranscriptPath("apps/web", "session-1");
    expect(transcriptPath).toBe(
      path.join(os.homedir(), ".claude", "projects", "apps-web", "session-1.jsonl"),
    );
  });

  it("extracts payload fields with tmux fallback from env", () => {
    const fields = extractPayloadFields(
      {
        session_id: "session-1",
        cwd: "apps/web",
        notification_type: "idle",
      },
      { TMUX_PANE: "%42" },
    );

    expect(fields.sessionId).toBe("session-1");
    expect(fields.cwd).toBe("apps/web");
    expect(fields.notificationType).toBeUndefined();
    expect(fields.tmuxPane).toBe("%42");
    expect(fields.transcriptPath).toContain(path.join(".claude", "projects", "apps-web"));
  });

  it("keeps supported notification type values in payload fields", () => {
    const fields = extractPayloadFields(
      {
        session_id: "session-1",
        notification_type: "permission_prompt",
      },
      {},
      {
        resolveTmuxPaneFn: () => null,
      },
    );

    expect(fields.notificationType).toBe("permission_prompt");
  });

  it("resolves tmux pane from display-message when TMUX_PANE is missing", () => {
    const pane = resolveTmuxPane(
      {},
      {
        spawnSyncFn: (() => ({
          status: 0,
          stdout: "%77\n",
        })) as unknown as typeof import("node:child_process").spawnSync,
      },
    );

    expect(pane).toBe("%77");
  });

  it("uses resolved tmux pane in extracted payload fields when env key is missing", () => {
    const fields = extractPayloadFields(
      {
        session_id: "session-1",
        cwd: "apps/web",
      },
      {},
      {
        resolveTmuxPaneFn: () => "%88",
      },
    );

    expect(fields.tmuxPane).toBe("%88");
  });

  it("includes fallback payload when tmux pane is missing", () => {
    const event = buildHookEvent("PostToolUse", "{}", {
      sessionId: "session-1",
      cwd: "apps/web",
      tmuxPane: null,
      transcriptPath: "/tmp/session-1.jsonl",
    });

    expect(event.fallback).toEqual({
      cwd: "apps/web",
      transcript_path: "/tmp/session-1.jsonl",
    });
  });

  it("resolves tmux server key from config", () => {
    expect(
      resolveHookServerKey({
        bind: "127.0.0.1",
        port: 11080,
        multiplexerBackend: "tmux",
        tmuxSocketName: "my/socket",
        tmuxSocketPath: "/tmp/tmux.sock",
        weztermTarget: "dev",
      }),
    ).toBe("my_socket");
  });

  it("resolves wezterm server key from config", () => {
    expect(
      resolveHookServerKey({
        bind: "127.0.0.1",
        port: 11080,
        multiplexerBackend: "wezterm",
        tmuxSocketName: "my/socket",
        tmuxSocketPath: "/tmp/tmux.sock",
        weztermTarget: " dev ",
      }),
    ).toBe("wezterm-dev");
  });

  it("resolves herdr server key from HERDR_SOCKET_PATH", () => {
    expect(
      resolveHookServerKey(
        {
          bind: "127.0.0.1",
          port: 11080,
          multiplexerBackend: "herdr",
          tmuxSocketName: null,
          tmuxSocketPath: null,
          weztermTarget: null,
        },
        { HERDR_SOCKET_PATH: "/tmp/herdr.sock" },
      ),
    ).toBe("herdr-_tmp_herdr-sock");
  });

  it("maps hook events to herdr agent statuses", () => {
    expect(deriveHerdrAgentStatus("claude", "PreToolUse")).toBe("working");
    expect(deriveHerdrAgentStatus("claude", "Notification", "permission_prompt")).toBe("blocked");
    expect(deriveHerdrAgentStatus("claude", "Stop")).toBe("idle");
    expect(deriveHerdrAgentStatus("codex", "PermissionRequest")).toBe("blocked");
  });

  it("reports herdr agent status over the socket protocol", async () => {
    const writes: string[] = [];
    const reporter = createHerdrReporter({
      socketPath: "/tmp/herdr.sock",
      paneId: "wB:p1",
      createConnection: () => ({
        setEncoding: () => undefined,
        on: () => undefined,
        once: (event: string, listener: (...args: unknown[]) => void) => {
          if (event === "connect") {
            queueMicrotask(() => listener());
          }
        },
        write: (line: string, callback?: (error?: Error) => void) => {
          writes.push(line);
          callback?.();
        },
        end: () => undefined,
        destroyed: false,
      }),
      now: () => 1783170444243,
    });

    await reporter.report({
      agent: "claude",
      status: "blocked",
      message: "hook:Notification",
    });

    expect(writes).toEqual([
      `${JSON.stringify({
        id: "hook_report_1",
        method: "pane.report_agent",
        params: {
          pane_id: "wB:p1",
          source: "vde-monitor-hook",
          agent: "claude",
          state: "blocked",
          message: "hook:Notification",
          seq: 1783170444243,
        },
      })}\n`,
    ]);
  });

  it("treats symlink entrypoint as main module", () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "vde-monitor-hooks-"));
    try {
      const realPath = path.join(baseDir, "hook-real.mjs");
      const symlinkPath = path.join(baseDir, "hook-link.mjs");
      fs.writeFileSync(realPath, "export {};\n", "utf8");
      fs.symlinkSync(realPath, symlinkPath);

      expect(isMainModule(pathToFileURL(realPath).href, symlinkPath)).toBe(true);
    } finally {
      fs.rmSync(baseDir, { recursive: true, force: true });
    }
  });

  it("falls back to legacy claude cwd encoding when transcript file exists there", () => {
    const uniqueSuffix = `${Date.now()}-${process.pid}`;
    const cwd = `/tmp/worktree/my.app-${uniqueSuffix}`;
    const sessionId = "legacy-session";
    const legacyEncoded = cwd.replace(/[/.]/g, "-");
    const legacyPath = path.join(
      os.homedir(),
      ".claude",
      "projects",
      legacyEncoded,
      `${sessionId}.jsonl`,
    );
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, "", "utf8");

    try {
      expect(resolveTranscriptPath(cwd, sessionId)).toBe(legacyPath);
    } finally {
      fs.rmSync(legacyPath, { force: true });
      fs.rmSync(path.dirname(legacyPath), { recursive: true, force: true });
    }
  });

  it("treats result-like payload as non-interactive", () => {
    expect(
      isClaudeNonInteractivePayload(
        {
          type: "result",
          session_id: "session-1",
        },
        "Stop",
      ),
    ).toBe(true);
  });

  it("detects non-interactive stop when ancestor claude process uses -p", () => {
    const processTree = new Map<number, { ppid: number; command: string }>([
      [1200, { ppid: 1100, command: "/bin/sh -c vde-monitor-claude-summary Stop" }],
      [1100, { ppid: 1000, command: "/usr/local/bin/claude -p --output-format json" }],
      [1000, { ppid: 1, command: "zsh" }],
    ]);

    expect(
      isClaudeNonInteractivePayload(
        {
          session_id: "session-1",
          cwd: "apps/web",
        },
        "Stop",
        {
          parentPid: 1200,
          lookupProcessSnapshot: (pid) => processTree.get(pid) ?? null,
        },
      ),
    ).toBe(true);
  });

  it("does not treat interactive stop as non-interactive when claude has no -p flag", () => {
    const processTree = new Map<number, { ppid: number; command: string }>([
      [2200, { ppid: 2100, command: "/bin/sh -c vde-monitor-claude-summary Stop" }],
      [2100, { ppid: 2000, command: "/usr/local/bin/claude --continue" }],
      [2000, { ppid: 1, command: "zsh" }],
    ]);

    expect(
      isClaudeNonInteractivePayload(
        {
          session_id: "session-1",
          cwd: "apps/web",
        },
        "Stop",
        {
          parentPid: 2200,
          lookupProcessSnapshot: (pid) => processTree.get(pid) ?? null,
        },
      ),
    ).toBe(false);
  });

  it("skips persisting non-interactive result payloads", () => {
    expect(
      shouldPersistHookPayload(
        {
          type: "result",
          session_id: "session-1",
        },
        "Stop",
      ),
    ).toBe(false);
  });

  it("skips persisting stop payloads when ancestor claude uses -p", () => {
    const processTree = new Map<number, { ppid: number; command: string }>([
      [3200, { ppid: 3100, command: "/bin/sh -c vde-monitor-hook Stop" }],
      [3100, { ppid: 3000, command: "/usr/local/bin/claude -p --output-format json" }],
      [3000, { ppid: 1, command: "zsh" }],
    ]);

    expect(
      shouldPersistHookPayload(
        {
          session_id: "session-1",
          cwd: "apps/web",
        },
        "Stop",
        {
          parentPid: 3200,
          lookupProcessSnapshot: (pid) => processTree.get(pid) ?? null,
        },
      ),
    ).toBe(false);
  });

  it("persists interactive stop payloads", () => {
    const processTree = new Map<number, { ppid: number; command: string }>([
      [4200, { ppid: 4100, command: "/bin/sh -c vde-monitor-hook Stop" }],
      [4100, { ppid: 4000, command: "/usr/local/bin/claude --continue" }],
      [4000, { ppid: 1, command: "zsh" }],
    ]);

    expect(
      shouldPersistHookPayload(
        {
          session_id: "session-1",
          cwd: "apps/web",
        },
        "Stop",
        {
          parentPid: 4200,
          lookupProcessSnapshot: (pid) => processTree.get(pid) ?? null,
        },
      ),
    ).toBe(true);
  });
});

describe("hook cli args", () => {
  it("treats a bare event name as a claude hook", () => {
    expect(parseHookCliArgs(["Stop"])).toEqual({ agent: "claude", hookEventName: "Stop" });
  });

  it("parses codex agent prefix", () => {
    expect(parseHookCliArgs(["codex", "PermissionRequest"])).toEqual({
      agent: "codex",
      hookEventName: "PermissionRequest",
    });
  });

  it("returns null when event name is missing", () => {
    expect(parseHookCliArgs([])).toBeNull();
    expect(parseHookCliArgs(["codex"])).toBeNull();
  });
});

describe("codex hooks cli helpers", () => {
  it("extracts codex payload fields without claude transcript reconstruction", () => {
    const fields = extractCodexPayloadFields(
      {
        session_id: "codex-session-1",
        cwd: "/repo",
      },
      {},
      {
        resolveTmuxPaneFn: () => "%9",
      },
    );

    expect(fields.sessionId).toBe("codex-session-1");
    expect(fields.cwd).toBe("/repo");
    expect(fields.tmuxPane).toBe("%9");
    expect(fields.transcriptPath).toBeNull();
  });

  it("keeps transcript path provided by the codex payload", () => {
    const fields = extractCodexPayloadFields(
      {
        session_id: "codex-session-1",
        transcript_path: "/tmp/rollout.jsonl",
      },
      {},
      {
        resolveTmuxPaneFn: () => null,
      },
    );

    expect(fields.transcriptPath).toBe("/tmp/rollout.jsonl");
  });

  it("builds a codex hook event", () => {
    const event = buildCodexHookEvent("PermissionRequest", "{}", {
      sessionId: "codex-session-1",
      cwd: "/repo",
      tmuxPane: "%9",
      transcriptPath: null,
    });

    expect(event.hook_event_name).toBe("PermissionRequest");
    expect(event.session_id).toBe("codex-session-1");
    expect(event.tmux_pane).toBe("%9");
    expect(event.payload).toEqual({ raw: "{}" });
    expect(event.fallback).toBeUndefined();
    expect("notification_type" in event).toBe(false);
  });

  it("includes fallback when codex tmux pane is missing", () => {
    const event = buildCodexHookEvent("Stop", "{}", {
      sessionId: "codex-session-1",
      cwd: "/repo",
      tmuxPane: null,
      transcriptPath: "/tmp/rollout.jsonl",
    });

    expect(event.fallback).toEqual({
      cwd: "/repo",
      transcript_path: "/tmp/rollout.jsonl",
    });
  });

  it("detects non-interactive stop when ancestor codex runs exec", () => {
    const processTree = new Map<number, { ppid: number; command: string }>([
      [5200, { ppid: 5100, command: "/bin/sh -c vde-monitor-hook codex Stop" }],
      [5100, { ppid: 5000, command: "/usr/local/bin/codex exec 'run tests'" }],
      [5000, { ppid: 1, command: "zsh" }],
    ]);

    expect(
      isCodexNonInteractivePayload(
        {
          session_id: "codex-session-1",
        },
        "Stop",
        {
          parentPid: 5200,
          lookupProcessSnapshot: (pid) => processTree.get(pid) ?? null,
        },
      ),
    ).toBe(true);
  });

  it("persists interactive codex stop payloads", () => {
    const processTree = new Map<number, { ppid: number; command: string }>([
      [6200, { ppid: 6100, command: "/bin/sh -c vde-monitor-hook codex Stop" }],
      [6100, { ppid: 6000, command: "/usr/local/bin/codex --model gpt-5" }],
      [6000, { ppid: 1, command: "zsh" }],
    ]);

    expect(
      shouldPersistCodexHookPayload(
        {
          session_id: "codex-session-1",
        },
        "Stop",
        {
          parentPid: 6200,
          lookupProcessSnapshot: (pid) => processTree.get(pid) ?? null,
        },
      ),
    ).toBe(true);
  });

  it("skips persisting codex stop payloads under codex exec", () => {
    const processTree = new Map<number, { ppid: number; command: string }>([
      [7200, { ppid: 7100, command: "/bin/sh -c vde-monitor-hook codex Stop" }],
      [7100, { ppid: 7000, command: "/usr/local/bin/codex exec --json 'run tests'" }],
      [7000, { ppid: 1, command: "zsh" }],
    ]);

    expect(
      shouldPersistCodexHookPayload(
        {
          session_id: "codex-session-1",
        },
        "Stop",
        {
          parentPid: 7200,
          lookupProcessSnapshot: (pid) => processTree.get(pid) ?? null,
        },
      ),
    ).toBe(false);
  });
});

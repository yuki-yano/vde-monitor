import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { configDefaults } from "@vde-monitor/shared";
import { describe, expect, it } from "vitest";

import {
  buildHookEvent,
  extractPayloadFields,
  isClaudeNonInteractivePayload,
  isMainModule,
  resolveHookServerKey,
  resolveTranscriptPath,
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
    expect(fields.tmuxPane).toBe("%42");
    expect(fields.transcriptPath).toContain(path.join(".claude", "projects", "apps-web"));
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
        multiplexerBackend: "tmux",
        tmuxSocketName: "my/socket",
        tmuxSocketPath: "/tmp/tmux.sock",
        weztermTarget: "dev",
        summary: configDefaults.notifications.summary,
      }),
    ).toBe("my_socket");
  });

  it("resolves wezterm server key from config", () => {
    expect(
      resolveHookServerKey({
        multiplexerBackend: "wezterm",
        tmuxSocketName: "my/socket",
        tmuxSocketPath: "/tmp/tmux.sock",
        weztermTarget: " dev ",
        summary: configDefaults.notifications.summary,
      }),
    ).toBe("wezterm-dev");
  });

  it("treats symlink entrypoint as main module", () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "vde-monitor-hooks-"));
    try {
      const realPath = path.join(baseDir, "hook-real.mjs");
      const symlinkPath = path.join(baseDir, "hook-link.mjs");
      fs.writeFileSync(realPath, "export {};\n", "utf8");
      fs.symlinkSync(realPath, symlinkPath);

      expect(isMainModule(symlinkPath, pathToFileURL(realPath).href)).toBe(true);
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

import { describe, expect, it } from "vitest";

import {
  buildDetachedProcessPlan,
  buildSummaryEvent,
  parseNotifyPayload,
  parseRuntimeArgs,
  shouldForwardHookPayload,
  shouldSkipAsyncSpawnForPayload,
} from "./claude-notify";

describe("claude notify helper", () => {
  it("parses hook event without forward command", () => {
    const parsed = parseRuntimeArgs(["Stop"]);

    expect(parsed.hookEventName).toBe("Stop");
    expect(parsed.forwardCommandArgv).toEqual([]);
    expect(parsed.errorMessage).toBeNull();
  });

  it("parses forward command after -- separator", () => {
    const parsed = parseRuntimeArgs(["Stop", "--", "vde-monitor-hook", "--flag"]);

    expect(parsed.hookEventName).toBe("Stop");
    expect(parsed.forwardCommandArgv).toEqual(["vde-monitor-hook", "--flag"]);
    expect(parsed.errorMessage).toBeNull();
  });

  it("supports --forward alias", () => {
    const parsed = parseRuntimeArgs(["Stop", "--forward", "--", "vde-monitor-hook"]);

    expect(parsed.forwardCommandArgv).toEqual(["vde-monitor-hook"]);
    expect(parsed.errorMessage).toBeNull();
  });

  it("parses async flag before hook event", () => {
    const parsed = parseRuntimeArgs(["--async", "Stop"]);

    expect(parsed.hookEventName).toBe("Stop");
    expect(parsed.asyncMode).toBe(true);
    expect(parsed.errorMessage).toBeNull();
  });

  it("parses async flag after hook event", () => {
    const parsed = parseRuntimeArgs(["Stop", "--async"]);

    expect(parsed.hookEventName).toBe("Stop");
    expect(parsed.asyncMode).toBe(true);
    expect(parsed.errorMessage).toBeNull();
  });

  it("parses payload file option", () => {
    const parsed = parseRuntimeArgs(["Stop", "--payload-file", "/tmp/payload.json"]);

    expect(parsed.hookEventName).toBe("Stop");
    expect(parsed.payloadFilePath).toBe("/tmp/payload.json");
    expect(parsed.errorMessage).toBeNull();
  });

  it("returns error when payload file path is missing", () => {
    const parsed = parseRuntimeArgs(["Stop", "--payload-file"]);

    expect(parsed.errorMessage).toMatch(/--payload-file requires/);
  });

  it("returns argument error for unknown options", () => {
    const parsed = parseRuntimeArgs(["Stop", "--unknown"]);

    expect(parsed.errorMessage).toMatch(/Unknown argument/);
  });

  it("returns error when hook event is missing", () => {
    const parsed = parseRuntimeArgs([]);

    expect(parsed.errorMessage).toBe("HookEventName is required");
  });

  it("accepts codex notify payload as positional argument", () => {
    const parsed = parseRuntimeArgs(['{"type":"agent-turn-complete"}']);

    expect(parsed.hookEventName).toBe('{"type":"agent-turn-complete"}');
    expect(parsed.errorMessage).toBeNull();
  });

  it("parses forward command and trailing codex payload from -- separator form", () => {
    const parsed = parseRuntimeArgs([
      "--",
      "/usr/local/bin/current-notify",
      "--flag",
      '{"type":"agent-turn-complete"}',
    ]);

    expect(parsed.hookEventName).toBe('{"type":"agent-turn-complete"}');
    expect(parsed.forwardCommandArgv).toEqual(["/usr/local/bin/current-notify", "--flag"]);
    expect(parsed.errorMessage).toBeNull();
  });

  it("parses async codex payload mode", () => {
    const parsed = parseRuntimeArgs(["--async", '{"type":"agent-turn-complete"}']);

    expect(parsed.hookEventName).toBe('{"type":"agent-turn-complete"}');
    expect(parsed.asyncMode).toBe(true);
    expect(parsed.errorMessage).toBeNull();
  });

  it("parses notify payload json", () => {
    expect(parseNotifyPayload('{"session_id":"session-1"}')).toEqual({
      session_id: "session-1",
    });
    expect(parseNotifyPayload("[]")).toBeNull();
    expect(parseNotifyPayload("invalid")).toBeNull();
  });

  it("builds claude summary event payload", () => {
    const summaryEvent = buildSummaryEvent(
      "Stop",
      {
        sessionId: "session-1",
        cwd: "apps/web",
        tty: "ttys001",
        tmuxPane: "%12",
        transcriptPath: "/tmp/session-1.jsonl",
        notificationType: "idle",
      },
      {
        paneTitle: "README done",
        notificationTitle: "README update",
        notificationBody: "README update and tests finished",
      },
      {
        agent: "claude",
        model: "claude-haiku-4-5",
        effort: "low",
      },
      "2026-02-27T00:00:00.000Z",
    );

    expect(summaryEvent.source_agent).toBe("claude");
    expect(summaryEvent.event_type).toBe("task_completed_summary");
    expect(summaryEvent.summary_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(summaryEvent.source_event_at).toBe("2026-02-27T00:00:00.000Z");
    expect(summaryEvent.pane_locator).toEqual({
      tmux_pane: "%12",
      tty: "ttys001",
      cwd: "apps/web",
    });
    expect(summaryEvent.summary).toEqual({
      pane_title: "README done",
      notification_title: "README update",
      notification_body: "README update and tests finished",
    });
    expect(summaryEvent.engine).toEqual({
      agent: "claude",
      model: "claude-haiku-4-5",
      effort: "low",
    });
    expect(summaryEvent.source).toEqual({
      session_id: "session-1",
      hook_event_name: "Stop",
    });
  });

  it("does not forward non-interactive stop payloads", () => {
    expect(shouldForwardHookPayload("Stop", true)).toBe(false);
  });

  it("forwards interactive stop payloads", () => {
    expect(shouldForwardHookPayload("Stop", false)).toBe(true);
  });

  it("forwards non-stop payloads", () => {
    expect(shouldForwardHookPayload("Notification", true)).toBe(true);
  });

  it("skips async spawn for non-interactive stop payloads", () => {
    const processTree = new Map<number, { ppid: number; command: string }>([
      [5200, { ppid: 5100, command: "/bin/sh -c vde-monitor-claude-summary --async Stop" }],
      [5100, { ppid: 5000, command: "/usr/local/bin/claude -p --output-format json" }],
      [5000, { ppid: 1, command: "zsh" }],
    ]);

    expect(
      shouldSkipAsyncSpawnForPayload("Stop", '{"hook_event_name":"Stop","session_id":"s1"}', {
        parentPid: 5200,
        lookupProcessSnapshot: (pid) => processTree.get(pid) ?? null,
      }),
    ).toBe(true);
  });

  it("does not skip async spawn for interactive stop payloads", () => {
    const processTree = new Map<number, { ppid: number; command: string }>([
      [6200, { ppid: 6100, command: "/bin/sh -c vde-monitor-claude-summary --async Stop" }],
      [6100, { ppid: 6000, command: "/usr/local/bin/claude --continue" }],
      [6000, { ppid: 1, command: "zsh" }],
    ]);

    expect(
      shouldSkipAsyncSpawnForPayload("Stop", '{"hook_event_name":"Stop","session_id":"s1"}', {
        parentPid: 6200,
        lookupProcessSnapshot: (pid) => processTree.get(pid) ?? null,
      }),
    ).toBe(false);
  });

  it("builds detached process plan with payload file", () => {
    const parsed = parseRuntimeArgs(["--async", "Stop", "--", "vde-monitor-hook"]);
    const plan = buildDetachedProcessPlan(parsed, "/tmp/payload.json", {
      nodeExecPath: "/usr/local/bin/node",
      mainPath: "/repo/dist/vde-monitor-claude-summary.js",
    });

    expect(plan).toEqual({
      command: "/usr/local/bin/node",
      args: [
        "/repo/dist/vde-monitor-claude-summary.js",
        "Stop",
        "--payload-file",
        "/tmp/payload.json",
        "--",
        "vde-monitor-hook",
      ],
    });
  });

  it("builds detached process plan for payload mode", () => {
    const parsed = parseRuntimeArgs([
      "--async",
      '{"type":"agent-turn-complete"}',
      "--",
      "/usr/local/bin/current-notify",
    ]);
    const plan = buildDetachedProcessPlan(parsed, "/tmp/payload.json", {
      nodeExecPath: "/usr/local/bin/node",
      mainPath: "/repo/dist/vde-monitor-summary.js",
    });

    expect(plan).toEqual({
      command: "/usr/local/bin/node",
      args: [
        "/repo/dist/vde-monitor-summary.js",
        '{"type":"agent-turn-complete"}',
        "--payload-file",
        "/tmp/payload.json",
        "--",
        "/usr/local/bin/current-notify",
      ],
    });
  });
});

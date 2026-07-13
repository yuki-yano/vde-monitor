import { describe, expect, it } from "vitest";

import type { PaneRuntimeState } from "./pane-state";

import {
  applyHerdrAgentStatusSignal,
  deriveCodexHookState,
  deriveHookState,
  hostCandidates,
  mapHookToPane,
  markHerdrLifecycleDirty,
  normalizeFingerprint,
  normalizeTitle,
  sanitizePaneTitle,
} from "./monitor-utils";

describe("monitor-utils", () => {
  it("normalizes fingerprints and limits lines", () => {
    const input = "a  \n b  \n c  \n";
    expect(normalizeFingerprint(input, 2)).toBe(" b\n c");
  });

  it("normalizes titles", () => {
    expect(normalizeTitle("  hello  ")).toBe("hello");
    expect(normalizeTitle("   ")).toBeNull();
    expect(normalizeTitle(null)).toBeNull();
  });

  it("sanitizes pane titles", () => {
    expect(sanitizePaneTitle("  hello  ")).toBe("hello");
    expect(sanitizePaneTitle("   ")).toBeNull();
    expect(sanitizePaneTitle(null)).toBeNull();
  });

  it("rejects kitty graphics protocol artifacts as pane titles", () => {
    expect(sanitizePaneTitle("Ga=q,s=1,v=1")).toBeNull();
    expect(sanitizePaneTitle("Ga=q,s=1,v=1,i=31")).toBeNull();
    expect(sanitizePaneTitle("Ga=T,f=100,s=10,v=20;QUFBQQ==")).toBeNull();
    expect(sanitizePaneTitle("Gi=1,a=d")).toBeNull();
  });

  it("rejects pane titles containing control characters", () => {
    expect(sanitizePaneTitle("abc\u001b[0m")).toBeNull();
    expect(sanitizePaneTitle("abc\u0007def")).toBeNull();
  });

  it("keeps ordinary pane titles that merely start with G", () => {
    expect(sanitizePaneTitle("Go")).toBe("Go");
    expect(sanitizePaneTitle("Gemini answers")).toBe("Gemini answers");
    expect(sanitizePaneTitle("G=1")).toBe("G=1");
  });

  it("derives hook state from events", () => {
    expect(deriveHookState("Notification", "permission_prompt")).toEqual({
      state: "WAITING_PERMISSION",
      reason: "hook:permission_prompt",
    });
    expect(deriveHookState("Stop")).toEqual({ state: "WAITING_INPUT", reason: "hook:stop" });
    expect(deriveHookState("PreToolUse")).toEqual({ state: "RUNNING", reason: "hook:PreToolUse" });
    expect(deriveHookState("UnknownEvent")).toBeNull();
  });

  it("derives codex hook state from events", () => {
    expect(deriveCodexHookState("PermissionRequest")).toEqual({
      state: "WAITING_PERMISSION",
      reason: "hook:permission_request",
    });
    expect(deriveCodexHookState("Stop")).toEqual({ state: "WAITING_INPUT", reason: "hook:stop" });
    expect(deriveCodexHookState("UserPromptSubmit")).toEqual({
      state: "RUNNING",
      reason: "hook:UserPromptSubmit",
    });
    expect(deriveCodexHookState("PreToolUse")).toEqual({
      state: "RUNNING",
      reason: "hook:PreToolUse",
    });
    expect(deriveCodexHookState("PostToolUse")).toEqual({
      state: "RUNNING",
      reason: "hook:PostToolUse",
    });
    expect(deriveCodexHookState("Notification")).toBeNull();
  });

  it("marks Herdr lifecycle events with a pane identity as dirty", () => {
    const marked: Array<[string, "herdr"]> = [];
    const markDirty = (paneId: string, source: "herdr") => {
      marked.push([paneId, source]);
    };

    markHerdrLifecycleDirty({ paneId: "wB:p1" }, markDirty);
    markHerdrLifecycleDirty({ paneId: null }, markDirty);

    expect(marked).toEqual([["wB:p1", "herdr"]]);
  });

  it("clears a stale Herdr status when the backend reports unknown", () => {
    const state: Pick<
      PaneRuntimeState,
      "herdrAgentStatus" | "pendingAgentLifecycleEvents" | "lastEventAt"
    > = {
      herdrAgentStatus: {
        agentStatus: "working",
        at: "2026-07-02T00:00:00.000Z",
      },
      pendingAgentLifecycleEvents: [],
      lastEventAt: "2026-07-02T00:00:00.000Z",
    };

    applyHerdrAgentStatusSignal(state, {
      agentStatus: "unknown",
      at: "2026-07-02T00:00:01.000Z",
    });

    expect(state.herdrAgentStatus).toBeNull();
    expect(state.pendingAgentLifecycleEvents).toEqual([]);
    expect(state.lastEventAt).toBe("2026-07-02T00:00:01.000Z");
  });

  it("maps hook to pane by tmux pane id first", () => {
    const panes = [{ paneId: "1", paneTty: "tty1", currentPath: "/tmp" }];
    expect(mapHookToPane(panes, { tmux_pane: "1" })).toBe("1");
  });

  it("maps a cmux hook by controlling tty instead of a stale ambient surface id", () => {
    const panes = [
      { paneId: "surface-1", paneTty: "/dev/tty1", currentPath: "/tmp" },
      { paneId: "surface-2", paneTty: "/dev/tty2", currentPath: "/var" },
    ];
    expect(
      mapHookToPane(panes, {
        cmux_surface: "surface-2",
        tty: "tty1",
      }),
    ).toBe("surface-1");
  });

  it("rejects a cmux hook when its controlling tty is missing or ambiguous", () => {
    const panes = [
      { paneId: "surface-1", paneTty: "/dev/tty1", currentPath: "/tmp" },
      { paneId: "surface-2", paneTty: "/dev/tty1", currentPath: "/var" },
    ];

    expect(mapHookToPane(panes, { cmux_surface: "surface-1" })).toBeNull();
    expect(mapHookToPane(panes, { cmux_surface: "surface-1", tty: "tty1" })).toBeNull();
  });

  it("does not match a blank tty to a pane whose tty is missing", () => {
    const panes = [{ paneId: "surface-1", paneTty: null, currentPath: "/tmp" }];

    expect(mapHookToPane(panes, { cmux_surface: "surface-1", tty: "  " })).toBeNull();
    expect(mapHookToPane(panes, { tty: "  ", cwd: "/tmp" })).toBe("surface-1");
  });

  it("maps hook to pane by herdr pane id before fallback matching", () => {
    const panes = [{ paneId: "wA:p1", paneTty: null, currentPath: "/tmp" }];
    expect(mapHookToPane(panes, { herdr_pane: "wB:p2", cwd: "/tmp" })).toBe("wB:p2");
  });

  it("maps hook to pane by tty when unique", () => {
    const panes = [
      { paneId: "1", paneTty: "tty1", currentPath: "/tmp" },
      { paneId: "2", paneTty: "tty2", currentPath: "/var" },
    ];
    expect(mapHookToPane(panes, { tty: "tty2" })).toBe("2");
  });

  it("returns null when tty matches multiple panes", () => {
    const panes = [
      { paneId: "1", paneTty: "tty1", currentPath: "/tmp" },
      { paneId: "2", paneTty: "tty1", currentPath: "/var" },
    ];
    expect(mapHookToPane(panes, { tty: "tty1" })).toBeNull();
  });

  it("maps hook to pane by cwd when unique", () => {
    const panes = [
      { paneId: "1", paneTty: "tty1", currentPath: "/tmp" },
      { paneId: "2", paneTty: "tty2", currentPath: "/var" },
    ];
    expect(mapHookToPane(panes, { cwd: "/var" })).toBe("2");
  });

  it("exposes host candidates", () => {
    expect(hostCandidates.size).toBeGreaterThan(0);
  });
});

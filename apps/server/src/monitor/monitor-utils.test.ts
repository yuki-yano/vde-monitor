import { describe, expect, it } from "vitest";

import {
  deriveCodexHookState,
  deriveHookState,
  hostCandidates,
  mapHookToPane,
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

  it("maps hook to pane by tmux pane id first", () => {
    const panes = [{ paneId: "1", paneTty: "tty1", currentPath: "/tmp" }];
    expect(mapHookToPane(panes, { tmux_pane: "1" })).toBe("1");
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

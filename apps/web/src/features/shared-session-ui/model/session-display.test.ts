import type { SessionSummary } from "@vde-monitor/shared";
import { describe, expect, it } from "vitest";

import {
  isSessionEditorState,
  resolveSessionDisplayTitle,
  resolveSessionStateLabel,
  resolveSessionStateTone,
} from "./session-display";

const buildSession = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
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
  agent: "unknown",
  state: "UNKNOWN",
  stateReason: "no_signal",
  lastMessage: null,
  lastOutputAt: null,
  lastEventAt: null,
  lastInputAt: null,
  repoRoot: null,
  paneDead: false,
  alternateOn: false,
  pipeAttached: false,
  pipeConflict: false,
  ...overrides,
});

describe("resolveSessionDisplayTitle", () => {
  it("prefers customTitle then title then sessionName", () => {
    expect(
      resolveSessionDisplayTitle(buildSession({ customTitle: "Custom", title: "Title" })),
    ).toBe("Custom");
    expect(resolveSessionDisplayTitle(buildSession({ title: "Title" }))).toBe("Title");
    expect(resolveSessionDisplayTitle(buildSession({ title: null }))).toBe("main");
  });
});

describe("session state display helpers", () => {
  it("identifies editor sessions and maps label/tone", () => {
    const editorSession = buildSession({
      state: "UNKNOWN",
      currentCommand: "nvim",
    });

    expect(isSessionEditorState(editorSession)).toBe(true);
    expect(resolveSessionStateLabel(editorSession)).toBe("EDITOR");
    expect(resolveSessionStateTone(editorSession)).toBe("editor");
  });

  it("returns default state mapping for non-editor sessions", () => {
    const waitingSession = buildSession({
      state: "WAITING_INPUT",
    });

    expect(isSessionEditorState(waitingSession)).toBe(false);
    expect(resolveSessionStateLabel(waitingSession)).toBe("WAITING");
    expect(resolveSessionStateTone(waitingSession)).toBe("waiting");
  });
});

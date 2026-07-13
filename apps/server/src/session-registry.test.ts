import { describe, expect, it, vi } from "vitest";

import type { SessionDetail } from "@vde-monitor/shared";

import { createSessionRegistry } from "./session-registry";

const makeDetail = (overrides: Partial<SessionDetail> = {}): SessionDetail => ({
  paneId: "pane-1",
  sessionId: "session",
  sessionName: "session",
  windowId: "window-0",
  windowIndex: 0,
  paneIndex: 0,
  paneActive: true,
  currentCommand: null,
  currentPath: "/tmp",
  paneTty: "tty1",
  title: null,
  customTitle: null,
  repoRoot: null,
  agent: "codex",
  state: "RUNNING",
  stateReason: "reason",
  lastMessage: null,
  lastOutputAt: null,
  lastEventAt: null,
  lastInputAt: null,
  paneDead: false,
  alternateOn: false,
  pipeAttached: false,
  pipeConflict: false,
  startCommand: null,
  panePid: null,
  completion: null,
  ...overrides,
});

describe("createSessionRegistry", () => {
  it("notifies onChanged when a new session is added", () => {
    const registry = createSessionRegistry();
    const listener = vi.fn();
    registry.onChanged(listener);

    registry.update(makeDetail());

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not notify onChanged when the same detail is updated again", () => {
    const registry = createSessionRegistry();
    const listener = vi.fn();
    registry.onChanged(listener);

    registry.update(makeDetail());
    registry.update(makeDetail());

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not notify onChanged when only summary-excluded fields change", () => {
    const registry = createSessionRegistry();
    const listener = vi.fn();
    registry.onChanged(listener);

    registry.update(makeDetail({ startCommand: "codex", panePid: 100 }));
    registry.update(makeDetail({ startCommand: "claude", panePid: 200 }));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("notifies onChanged when a summary field changes", () => {
    const registry = createSessionRegistry();
    const listener = vi.fn();
    registry.onChanged(listener);

    registry.update(makeDetail());
    registry.update(makeDetail({ lastOutputAt: "2026-07-04T00:00:00.000Z" }));

    expect(listener).toHaveBeenCalledTimes(2);
  });
});

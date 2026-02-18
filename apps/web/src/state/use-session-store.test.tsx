import { act, renderHook } from "@testing-library/react";
import type { SessionSummary } from "@vde-monitor/shared";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { useSessionStore } from "./use-session-store";

const createSession = (paneId: string, overrides?: Partial<SessionSummary>): SessionSummary => ({
  paneId,
  sessionName: "session",
  windowIndex: 0,
  paneIndex: 0,
  windowActivity: null,
  paneActive: true,
  currentCommand: null,
  currentPath: null,
  paneTty: null,
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
  ...overrides,
});

describe("useSessionStore", () => {
  const createWrapper = () => {
    const store = createStore();
    return ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={store}>{children}</JotaiProvider>
    );
  };

  it("applies snapshots and keeps latest per pane", () => {
    const { result } = renderHook(() => useSessionStore(), { wrapper: createWrapper() });
    const first = createSession("pane-1", { title: "first" });
    const second = createSession("pane-1", { title: "second" });
    const third = createSession("pane-2");

    act(() => {
      result.current.applySessionsSnapshot([first, second, third]);
    });

    expect(result.current.sessions).toHaveLength(2);
    expect(result.current.getSessionDetail("pane-1")?.title).toBe("second");
  });

  it("updates and removes sessions", () => {
    const { result } = renderHook(() => useSessionStore(), { wrapper: createWrapper() });
    const session = createSession("pane-1");

    act(() => {
      result.current.applySessionsSnapshot([session]);
    });

    act(() => {
      result.current.updateSession({ ...session, title: "updated" });
    });

    expect(result.current.getSessionDetail("pane-1")?.title).toBe("updated");

    act(() => {
      result.current.removeSession("pane-1");
    });

    expect(result.current.getSessionDetail("pane-1")).toBeNull();
  });
});

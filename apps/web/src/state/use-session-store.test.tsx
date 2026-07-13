import { act, renderHook } from "@testing-library/react";
import type { SessionSummary } from "@vde-monitor/shared";
import { Provider as JotaiProvider, createStore } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { useSessionStore } from "./use-session-store";

const createSession = (paneId: string, overrides?: Partial<SessionSummary>): SessionSummary => ({
  paneId,
  sessionId: "session-id-1",
  sessionName: "session",
  windowId: "window-id-1",
  windowIndex: 0,
  paneIndex: 0,
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
  completion: null,
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

  it("keeps the sessions array reference when a snapshot has identical content", () => {
    const { result } = renderHook(() => useSessionStore(), { wrapper: createWrapper() });

    act(() => {
      result.current.applySessionsSnapshot([createSession("pane-1"), createSession("pane-2")]);
    });
    const previous = result.current.sessions;

    act(() => {
      result.current.applySessionsSnapshot([createSession("pane-1"), createSession("pane-2")]);
    });

    expect(result.current.sessions).toBe(previous);
  });

  it("keeps unchanged session references when one session changes in a snapshot", () => {
    const { result } = renderHook(() => useSessionStore(), { wrapper: createWrapper() });

    act(() => {
      result.current.applySessionsSnapshot([createSession("pane-1"), createSession("pane-2")]);
    });
    const [previousFirst] = result.current.sessions;

    act(() => {
      result.current.applySessionsSnapshot([
        createSession("pane-1"),
        createSession("pane-2", { state: "WAITING_INPUT" }),
      ]);
    });

    expect(result.current.sessions[0]).toBe(previousFirst);
    expect(result.current.sessions[1]?.state).toBe("WAITING_INPUT");
  });

  it("keeps the sessions array reference when setSessions receives identical content", () => {
    const { result } = renderHook(() => useSessionStore(), { wrapper: createWrapper() });

    act(() => {
      result.current.setSessions([createSession("pane-1")]);
    });
    const previous = result.current.sessions;

    act(() => {
      result.current.setSessions([createSession("pane-1")]);
    });

    expect(result.current.sessions).toBe(previous);
  });

  it("keeps the sessions array reference when updateSession receives an identical session", () => {
    const { result } = renderHook(() => useSessionStore(), { wrapper: createWrapper() });

    act(() => {
      result.current.applySessionsSnapshot([createSession("pane-1")]);
    });
    const previous = result.current.sessions;

    act(() => {
      result.current.updateSession(createSession("pane-1"));
    });

    expect(result.current.sessions).toBe(previous);
  });

  it("keeps other session references when updateSession changes one session", () => {
    const { result } = renderHook(() => useSessionStore(), { wrapper: createWrapper() });

    act(() => {
      result.current.applySessionsSnapshot([createSession("pane-1"), createSession("pane-2")]);
    });
    const [, previousSecond] = result.current.sessions;

    act(() => {
      result.current.updateSession(createSession("pane-1", { state: "SHELL" }));
    });

    expect(result.current.sessions[0]?.state).toBe("SHELL");
    expect(result.current.sessions[1]).toBe(previousSecond);
  });

  it("appends an unknown session on updateSession", () => {
    const { result } = renderHook(() => useSessionStore(), { wrapper: createWrapper() });

    act(() => {
      result.current.applySessionsSnapshot([createSession("pane-1")]);
    });

    act(() => {
      result.current.updateSession(createSession("pane-9"));
    });

    expect(result.current.sessions.map((session) => session.paneId)).toEqual(["pane-1", "pane-9"]);
  });

  // Regression coverage for the toSessionDetail cache. getSessionDetail used
  // to build a brand-new object via spread on every single call, so even
  // when the underlying SessionSummary reference for a pane never changed
  // (e.g. an SSE tick that only touched a *different* pane), every consumer
  // reading `session` saw a new object every render and could never bail out
  // of useMemo/React.memo. This exercises the real useSessionStore path
  // (not a hand-rolled mock) so it reflects actual production behavior.
  it("returns a stable SessionDetail reference across repeated getSessionDetail calls for an unchanged session", () => {
    const { result } = renderHook(() => useSessionStore(), { wrapper: createWrapper() });

    act(() => {
      result.current.applySessionsSnapshot([createSession("pane-1"), createSession("pane-2")]);
    });

    const first = result.current.getSessionDetail("pane-1");
    const second = result.current.getSessionDetail("pane-1");

    expect(first).not.toBeNull();
    expect(second).toBe(first);
  });

  it("returns a new SessionDetail reference once the underlying session actually changes", () => {
    const { result } = renderHook(() => useSessionStore(), { wrapper: createWrapper() });

    act(() => {
      result.current.applySessionsSnapshot([createSession("pane-1")]);
    });
    const before = result.current.getSessionDetail("pane-1");

    act(() => {
      result.current.updateSession(createSession("pane-1", { state: "WAITING_INPUT" }));
    });
    const after = result.current.getSessionDetail("pane-1");

    expect(after).not.toBe(before);
    expect(after?.state).toBe("WAITING_INPUT");
  });

  it("keeps pane-1's SessionDetail reference stable when an unrelated pane-2 tick occurs", () => {
    const { result } = renderHook(() => useSessionStore(), { wrapper: createWrapper() });

    act(() => {
      result.current.applySessionsSnapshot([createSession("pane-1"), createSession("pane-2")]);
    });
    const paneOneBefore = result.current.getSessionDetail("pane-1");

    // Simulate an SSE tick that re-parses the whole sessions payload but only
    // pane-2's content actually changed; reconcileSessions should keep
    // pane-1's SessionSummary reference, and the detail cache should follow.
    act(() => {
      result.current.applySessionsSnapshot([
        createSession("pane-1"),
        createSession("pane-2", { state: "WAITING_INPUT" }),
      ]);
    });
    const paneOneAfter = result.current.getSessionDetail("pane-1");

    expect(paneOneAfter).toBe(paneOneBefore);
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

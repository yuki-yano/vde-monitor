import { describe, expect, it, vi } from "vitest";

import {
  closeLogFileCandidate,
  createNextLogResolveRequestId,
  initializeLogResolveRequest,
  isCurrentLogResolveRequest,
  openLogFileCandidateModalState,
  setLogResolveErrorIfCurrent,
} from "./useSessionFiles-log-resolve-state";
import type { SessionFilesUiAction } from "./useSessionFiles-ui-state-machine";

describe("useSessionFiles log resolve state helpers", () => {
  it("increments and validates request id", () => {
    const activeLogResolveRequestIdRef = { current: 5 };
    const requestId = createNextLogResolveRequestId(activeLogResolveRequestIdRef);
    expect(requestId).toBe(6);
    expect(
      isCurrentLogResolveRequest({
        activeLogResolveRequestIdRef,
        requestId: 6,
      }),
    ).toBe(true);
    expect(
      isCurrentLogResolveRequest({
        activeLogResolveRequestIdRef,
        requestId: 5,
      }),
    ).toBe(false);
  });

  it("dispatches a single closeLogFileCandidate action to reset log candidate state", () => {
    const dispatch = vi.fn();
    closeLogFileCandidate(dispatch);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "closeLogFileCandidate" });
  });

  it("initializes log resolve request by incrementing id and dispatching startLogResolve", () => {
    const activeLogResolveRequestIdRef = { current: 2 };
    const dispatch = vi.fn();

    const requestId = initializeLogResolveRequest({
      activeLogResolveRequestIdRef,
      dispatch,
    });

    expect(requestId).toBe(3);
    expect(dispatch).toHaveBeenCalledWith({ type: "startLogResolve" });
  });

  it("sets resolve error only when request is current", () => {
    const dispatch = vi.fn();
    const activeLogResolveRequestIdRef = { current: 10 };
    setLogResolveErrorIfCurrent({
      activeLogResolveRequestIdRef,
      requestId: 9,
      dispatch,
      message: "old request",
    });
    expect(dispatch).not.toHaveBeenCalled();

    setLogResolveErrorIfCurrent({
      activeLogResolveRequestIdRef,
      requestId: 10,
      dispatch,
      message: "current request",
    });
    const action = dispatch.mock.calls[0]?.[0] as SessionFilesUiAction;
    expect(action).toEqual({ type: "set", key: "fileResolveError", value: "current request" });
  });

  it("opens log candidate modal state with values", () => {
    const dispatch = vi.fn();

    openLogFileCandidateModalState({
      dispatch,
      reference: "index.ts",
      paneId: "%1",
      line: 42,
      items: [{ path: "src/index.ts", name: "index.ts" }],
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "openLogFileCandidate",
      reference: "index.ts",
      paneId: "%1",
      line: 42,
      items: [{ path: "src/index.ts", name: "index.ts" }],
    });
  });
});

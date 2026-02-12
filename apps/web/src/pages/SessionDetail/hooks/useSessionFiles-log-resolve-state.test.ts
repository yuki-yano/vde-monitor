import { describe, expect, it, vi } from "vitest";

import {
  createNextLogResolveRequestId,
  initializeLogResolveRequest,
  isCurrentLogResolveRequest,
  openLogFileCandidateModalState,
  resetLogFileCandidateState,
  setLogResolveErrorIfCurrent,
} from "./useSessionFiles-log-resolve-state";

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

  it("resets log candidate state", () => {
    const setLogFileCandidateModalOpen = vi.fn();
    const setLogFileCandidateReference = vi.fn();
    const setLogFileCandidatePaneId = vi.fn();
    const setLogFileCandidateLine = vi.fn();
    const setLogFileCandidateItems = vi.fn();

    resetLogFileCandidateState({
      setLogFileCandidateModalOpen,
      setLogFileCandidateReference,
      setLogFileCandidatePaneId,
      setLogFileCandidateLine,
      setLogFileCandidateItems,
    });

    expect(setLogFileCandidateModalOpen).toHaveBeenCalledWith(false);
    expect(setLogFileCandidateReference).toHaveBeenCalledWith(null);
    expect(setLogFileCandidatePaneId).toHaveBeenCalledWith(null);
    expect(setLogFileCandidateLine).toHaveBeenCalledWith(null);
    expect(setLogFileCandidateItems).toHaveBeenCalledWith([]);
  });

  it("initializes log resolve request by incrementing id and clearing ui state", () => {
    const activeLogResolveRequestIdRef = { current: 2 };
    const setFileResolveError = vi.fn();
    const setLogFileCandidateModalOpen = vi.fn();
    const setLogFileCandidateReference = vi.fn();
    const setLogFileCandidatePaneId = vi.fn();
    const setLogFileCandidateLine = vi.fn();
    const setLogFileCandidateItems = vi.fn();

    const requestId = initializeLogResolveRequest({
      activeLogResolveRequestIdRef,
      setFileResolveError,
      setLogFileCandidateModalOpen,
      setLogFileCandidateReference,
      setLogFileCandidatePaneId,
      setLogFileCandidateLine,
      setLogFileCandidateItems,
    });

    expect(requestId).toBe(3);
    expect(setFileResolveError).toHaveBeenCalledWith(null);
    expect(setLogFileCandidateModalOpen).toHaveBeenCalledWith(false);
    expect(setLogFileCandidateItems).toHaveBeenCalledWith([]);
  });

  it("sets resolve error only when request is current", () => {
    const setFileResolveError = vi.fn();
    const activeLogResolveRequestIdRef = { current: 10 };
    setLogResolveErrorIfCurrent({
      activeLogResolveRequestIdRef,
      requestId: 9,
      setFileResolveError,
      message: "old request",
    });
    expect(setFileResolveError).not.toHaveBeenCalled();

    setLogResolveErrorIfCurrent({
      activeLogResolveRequestIdRef,
      requestId: 10,
      setFileResolveError,
      message: "current request",
    });
    expect(setFileResolveError).toHaveBeenCalledWith("current request");
  });

  it("opens log candidate modal state with values", () => {
    const setLogFileCandidateModalOpen = vi.fn();
    const setLogFileCandidateReference = vi.fn();
    const setLogFileCandidatePaneId = vi.fn();
    const setLogFileCandidateLine = vi.fn();
    const setLogFileCandidateItems = vi.fn();

    openLogFileCandidateModalState({
      setLogFileCandidateModalOpen,
      setLogFileCandidateReference,
      setLogFileCandidatePaneId,
      setLogFileCandidateLine,
      setLogFileCandidateItems,
      reference: "index.ts",
      paneId: "%1",
      line: 42,
      items: [{ path: "src/index.ts", name: "index.ts" }],
    });

    expect(setLogFileCandidateReference).toHaveBeenCalledWith("index.ts");
    expect(setLogFileCandidatePaneId).toHaveBeenCalledWith("%1");
    expect(setLogFileCandidateLine).toHaveBeenCalledWith(42);
    expect(setLogFileCandidateItems).toHaveBeenCalledWith([
      { path: "src/index.ts", name: "index.ts" },
    ]);
    expect(setLogFileCandidateModalOpen).toHaveBeenCalledWith(true);
  });
});

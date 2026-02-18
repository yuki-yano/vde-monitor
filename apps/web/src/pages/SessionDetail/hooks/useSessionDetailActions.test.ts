import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSessionDetailActions } from "./useSessionDetailActions";

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

describe("useSessionDetailActions", () => {
  it("closes quick panel and log modal before opening target pane in new window", () => {
    const closeQuickPanel = vi.fn();
    const closeLogModal = vi.fn();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const { result } = renderHook(() =>
      useSessionDetailActions({
        paneId: "pane-current",
        selectedPaneId: null,
        closeQuickPanel,
        closeLogModal,
        touchSession: vi.fn(async () => undefined),
        focusPane: vi.fn(async () => ({ ok: true })),
        setScreenError: vi.fn(),
      }),
    );

    act(() => {
      result.current.handleOpenPaneInNewWindow("pane target/2");
    });

    expect(closeQuickPanel).toHaveBeenCalledTimes(1);
    expect(closeLogModal).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith(
      "/sessions/pane%20target%2F2",
      "_blank",
      "noopener,noreferrer",
    );
    const openOrder = openSpy.mock.invocationCallOrder[0];
    const closeQuickOrder = closeQuickPanel.mock.invocationCallOrder[0];
    const closeLogOrder = closeLogModal.mock.invocationCallOrder[0];
    expect(openOrder).toBeDefined();
    expect(closeQuickOrder).toBeDefined();
    expect(closeLogOrder).toBeDefined();
    if (openOrder == null || closeQuickOrder == null || closeLogOrder == null) {
      throw new Error("missing invocation order");
    }
    expect(closeQuickOrder).toBeLessThan(openOrder);
    expect(closeLogOrder).toBeLessThan(openOrder);

    openSpy.mockRestore();
  });

  it("closes quick panel and log modal before opening selected pane in new tab", () => {
    const closeQuickPanel = vi.fn();
    const closeLogModal = vi.fn();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const { result } = renderHook(() =>
      useSessionDetailActions({
        paneId: "pane-current",
        selectedPaneId: "pane target/1",
        closeQuickPanel,
        closeLogModal,
        touchSession: vi.fn(async () => undefined),
        focusPane: vi.fn(async () => ({ ok: true })),
        setScreenError: vi.fn(),
      }),
    );

    act(() => {
      result.current.handleOpenInNewTab();
    });

    expect(closeQuickPanel).toHaveBeenCalledTimes(1);
    expect(closeLogModal).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith(
      "/sessions/pane%20target%2F1",
      "_blank",
      "noopener,noreferrer",
    );
    const openOrder = openSpy.mock.invocationCallOrder[0];
    const closeQuickOrder = closeQuickPanel.mock.invocationCallOrder[0];
    const closeLogOrder = closeLogModal.mock.invocationCallOrder[0];
    expect(openOrder).toBeDefined();
    expect(closeQuickOrder).toBeDefined();
    expect(closeLogOrder).toBeDefined();
    if (openOrder == null || closeQuickOrder == null || closeLogOrder == null) {
      throw new Error("missing invocation order");
    }
    expect(closeQuickOrder).toBeLessThan(openOrder);
    expect(closeLogOrder).toBeLessThan(openOrder);

    openSpy.mockRestore();
  });
});

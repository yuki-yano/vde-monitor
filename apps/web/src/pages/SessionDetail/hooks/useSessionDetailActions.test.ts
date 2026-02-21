import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSessionDetailActions } from "./useSessionDetailActions";

const navigateMock = vi.hoisted(() => vi.fn());
const mockUseWorkspaceTabs = vi.hoisted(
  () =>
    ({
      enabled: false as boolean,
      activeTabId: "system:sessions",
      tabs: [],
      openSessionTab: vi.fn<(paneId: string) => void>(),
      activateTab: vi.fn<(tabId: string) => void>(),
      closeTab: vi.fn<(tabId: string) => void>(),
      reorderTabs: vi.fn<(activeTabId: string, overTabId: string) => void>(),
      reorderTabsByClosableOrder: vi.fn<(orderedClosableTabIds: string[]) => void>(),
    }) satisfies {
      enabled: boolean;
      activeTabId: string;
      tabs: unknown[];
      openSessionTab: (paneId: string) => void;
      activateTab: (tabId: string) => void;
      closeTab: (tabId: string) => void;
      reorderTabs: (activeTabId: string, overTabId: string) => void;
      reorderTabsByClosableOrder: (orderedClosableTabIds: string[]) => void;
    },
);

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@/features/pwa-tabs/context/workspace-tabs-context", () => ({
  useWorkspaceTabs: () => mockUseWorkspaceTabs,
}));

describe("useSessionDetailActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWorkspaceTabs.enabled = false;
    mockUseWorkspaceTabs.activeTabId = "system:sessions";
    mockUseWorkspaceTabs.tabs = [];
    mockUseWorkspaceTabs.openSessionTab = vi.fn();
    mockUseWorkspaceTabs.activateTab = vi.fn();
    mockUseWorkspaceTabs.closeTab = vi.fn();
    mockUseWorkspaceTabs.reorderTabs = vi.fn();
    mockUseWorkspaceTabs.reorderTabsByClosableOrder = vi.fn();
  });

  it("uses workspace tab open when pwa tabs are enabled", () => {
    const closeQuickPanel = vi.fn();
    const closeLogModal = vi.fn();
    const openSessionTab = vi.fn();
    mockUseWorkspaceTabs.enabled = true;
    mockUseWorkspaceTabs.openSessionTab = openSessionTab;
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
    expect(openSessionTab).toHaveBeenCalledWith("pane target/1");
    expect(openSpy).not.toHaveBeenCalled();

    openSpy.mockRestore();
  });

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

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  activateTabMock,
  closeTabMock,
  usePwaTabsDndMock,
  usePwaWorkspaceTabsVMMock,
  workspaceTabsState,
} = vi.hoisted(() => ({
  activateTabMock: vi.fn(),
  closeTabMock: vi.fn(),
  usePwaTabsDndMock: vi.fn(),
  usePwaWorkspaceTabsVMMock: vi.fn(),
  workspaceTabsState: {
    activeTabId: "session:pane-a",
    tabs: [] as unknown[],
  },
}));

const sessionsTab = {
  id: "system:sessions",
  kind: "system" as const,
  paneId: null,
  systemRoute: "sessions" as const,
  closable: false,
  lastActivatedAt: 1,
};
const paneATab = {
  id: "session:pane-a",
  kind: "session" as const,
  paneId: "pane-a",
  systemRoute: null,
  closable: true,
  lastActivatedAt: 3,
};
const paneBTab = {
  id: "session:pane-b",
  kind: "session" as const,
  paneId: "pane-b",
  systemRoute: null,
  closable: true,
  lastActivatedAt: 2,
};
const paneAGroup = { key: "session:one", label: "ONE", tabs: [paneATab] };
const paneBGroup = { key: "session:two", label: "TWO", tabs: [paneBTab] };
const tabGroups = [paneAGroup, paneBGroup];

vi.mock("../context/workspace-tabs-context", () => ({
  useWorkspaceTabs: () => ({
    enabled: true,
    activeTabId: workspaceTabsState.activeTabId,
    tabs: workspaceTabsState.tabs,
    activateTab: activateTabMock,
    closeTab: closeTabMock,
    reorderTabs: vi.fn(),
    reorderTabsByClosableOrder: vi.fn(),
  }),
}));

vi.mock("../hooks/usePwaWorkspaceTabsVM", () => ({
  usePwaWorkspaceTabsVM: usePwaWorkspaceTabsVMMock,
}));

vi.mock("../hooks/usePwaTabsDnd", () => ({
  toGroupSortableId: (key: string) => `group:${key}`,
  toTabSortableId: (id: string) => `tab:${id}`,
  TAB_LAYOUT_TRANSITION: "none",
  animateGroupLayoutChanges: () => false,
  animateTabLayoutChanges: () => false,
  usePwaTabsDnd: usePwaTabsDndMock,
}));

import { PwaWorkspaceTabs } from "./PwaWorkspaceTabs";

const showOnlyPaneB = () => {
  workspaceTabsState.activeTabId = paneBTab.id;
  workspaceTabsState.tabs = [sessionsTab, paneBTab];
  usePwaWorkspaceTabsVMMock.mockReturnValue({
    fixedSessionsTab: sessionsTab,
    closableTabs: [paneBTab],
    tabGroups: [paneBGroup],
    resolveTabLabel: (tab: { paneId: string | null }) => (tab.paneId === "pane-b" ? "B" : "S"),
    resolveTabStateClass: () => "state",
  });
  usePwaTabsDndMock.mockReturnValue({
    sensors: [],
    dragKind: null,
    activeDragGroup: null,
    displayedGroupSortableItems: ["group:session:two"],
    orderedTabGroups: [paneBGroup],
    collisionDetection: vi.fn(),
    handleDragStart: vi.fn(),
    handleDragOver: vi.fn(),
    handleDragEnd: vi.fn(),
    handleDragCancel: vi.fn(),
  });
};

describe("PwaWorkspaceTabs keyboard accessibility", () => {
  beforeEach(() => {
    activateTabMock.mockReset();
    closeTabMock.mockReset();
    workspaceTabsState.activeTabId = paneATab.id;
    workspaceTabsState.tabs = [sessionsTab, paneATab, paneBTab];
    usePwaWorkspaceTabsVMMock.mockReturnValue({
      fixedSessionsTab: sessionsTab,
      closableTabs: [paneATab, paneBTab],
      tabGroups,
      resolveTabLabel: (tab: { paneId: string | null }) =>
        tab.paneId === "pane-a" ? "A" : tab.paneId === "pane-b" ? "B" : "S",
      resolveTabStateClass: () => "state",
    });
    usePwaTabsDndMock.mockReturnValue({
      sensors: [],
      dragKind: null,
      activeDragGroup: null,
      displayedGroupSortableItems: ["group:session:one", "group:session:two"],
      orderedTabGroups: tabGroups,
      collisionDetection: vi.fn(),
      handleDragStart: vi.fn(),
      handleDragOver: vi.fn(),
      handleDragEnd: vi.fn(),
      handleDragCancel: vi.fn(),
    });
  });

  it("keeps one roving tab stop and moves focus with ArrowRight", () => {
    render(<PwaWorkspaceTabs />);

    const sessions = screen.getByRole("tab", { name: "S" });
    const paneA = screen.getByRole("tab", { name: "A" });
    const paneB = screen.getByRole("tab", { name: "B" });
    expect(sessions.getAttribute("tabindex")).toBe("-1");
    expect(paneA.getAttribute("tabindex")).toBe("0");
    expect(paneB.getAttribute("tabindex")).toBe("-1");
    expect(paneA.parentElement?.getAttribute("role")).toBeNull();
    expect(paneA.parentElement?.getAttribute("tabindex")).toBeNull();
    expect(paneA.hasAttribute("aria-pressed")).toBe(false);
    expect(paneA.hasAttribute("aria-roledescription")).toBe(false);
    expect(paneA.getAttribute("aria-disabled")).toBe("false");
    expect(paneA.hasAttribute("aria-describedby")).toBe(true);
    const reorderPaneAGroup = screen.getByRole("button", {
      name: "Reorder session group ONE",
    });
    const reorderPaneBGroup = screen.getByRole("button", {
      name: "Reorder session group TWO",
    });
    const tablist = screen.getByRole("tablist", { name: "PWA workspace tabs" });
    expect(screen.getAllByRole("tablist")).toEqual([tablist]);
    const controlsGroup = screen.getByRole("group", { name: "Workspace tab controls" });
    expect(reorderPaneAGroup.closest('[role="group"]')).toBe(controlsGroup);
    expect(reorderPaneAGroup.closest('[role="tablist"]')).toBeNull();
    expect(
      [...tablist.querySelectorAll<HTMLElement>("button, a, input, select, textarea")].every(
        (element) => element.getAttribute("role") === "tab",
      ),
    ).toBe(true);
    const closeButton = screen.getByRole("button", { name: "Close A" });
    expect(closeButton.closest('[role="group"]')).toBe(controlsGroup);
    expect(closeButton.closest('[role="tablist"]')).toBeNull();
    const sequentialTabStops = [...document.querySelectorAll<HTMLButtonElement>("button")].filter(
      (button) => button.tabIndex >= 0 && !button.disabled,
    );
    expect(sequentialTabStops).toEqual([paneA, reorderPaneAGroup, reorderPaneBGroup]);
    expect(sequentialTabStops.map((element) => element.getAttribute("role") ?? "button")).toEqual([
      "tab",
      "button",
      "button",
    ]);

    paneA.focus();
    fireEvent.keyDown(paneA, { key: "ArrowRight" });

    expect(document.activeElement).toBe(paneB);
    expect(activateTabMock).toHaveBeenCalledWith(paneBTab.id);
  });

  it("leaves Arrow key events to the keyboard drag sensor while dragging", () => {
    usePwaTabsDndMock.mockReturnValue({
      sensors: [],
      dragKind: "tab",
      activeDragGroup: null,
      displayedGroupSortableItems: ["group:session:one", "group:session:two"],
      orderedTabGroups: tabGroups,
      collisionDetection: vi.fn(),
      handleDragStart: vi.fn(),
      handleDragOver: vi.fn(),
      handleDragEnd: vi.fn(),
      handleDragCancel: vi.fn(),
    });
    render(<PwaWorkspaceTabs />);

    const paneA = screen.getByRole("tab", { name: "A" });
    paneA.focus();
    const eventWasNotCanceled = fireEvent.keyDown(paneA, { key: "ArrowRight" });

    expect(eventWasNotCanceled).toBe(true);
    expect(document.activeElement).toBe(paneA);
    expect(activateTabMock).not.toHaveBeenCalled();
  });

  it("closes the focused active tab with Delete and restores focus to its successor", () => {
    const { rerender } = render(<PwaWorkspaceTabs />);

    const paneA = screen.getByRole("tab", { name: "A" });
    paneA.focus();
    fireEvent.keyDown(paneA, { key: "Delete" });

    expect(closeTabMock).toHaveBeenCalledWith(paneATab.id);
    expect(paneA.getAttribute("aria-keyshortcuts")).toBe("Delete");

    showOnlyPaneB();
    rerender(<PwaWorkspaceTabs />);

    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "B" }));
  });

  it("restores focus to the next active tab after the close button removes the current tab", () => {
    const { rerender } = render(<PwaWorkspaceTabs />);
    const closeButton = screen.getByRole("button", { name: "Close A" });
    expect(closeButton.getAttribute("tabindex")).toBe("-1");
    closeButton.focus();

    fireEvent.click(closeButton);
    expect(closeTabMock).toHaveBeenCalledWith(paneATab.id);

    showOnlyPaneB();
    rerender(<PwaWorkspaceTabs />);

    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "B" }));
  });

  it("restores focus when automatic dismissal removes the focused active tab", () => {
    const { rerender } = render(<PwaWorkspaceTabs />);
    screen.getByRole("tab", { name: "A" }).focus();

    showOnlyPaneB();
    rerender(<PwaWorkspaceTabs />);

    expect(closeTabMock).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "B" }));
  });

  it("moves focus to the successor group control when its focused group disappears", () => {
    const { rerender } = render(<PwaWorkspaceTabs />);
    screen.getByRole("button", { name: "Reorder session group ONE" }).focus();

    showOnlyPaneB();
    rerender(<PwaWorkspaceTabs />);

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Reorder session group TWO" }),
    );
  });
});

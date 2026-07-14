import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { activateTabMock, usePwaTabsDndMock, usePwaWorkspaceTabsVMMock } = vi.hoisted(() => ({
  activateTabMock: vi.fn(),
  usePwaTabsDndMock: vi.fn(),
  usePwaWorkspaceTabsVMMock: vi.fn(),
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
const tabGroup = { key: "session:one", label: "ONE", tabs: [paneATab, paneBTab] };

vi.mock("../context/workspace-tabs-context", () => ({
  useWorkspaceTabs: () => ({
    enabled: true,
    activeTabId: paneATab.id,
    tabs: [sessionsTab, paneATab, paneBTab],
    activateTab: activateTabMock,
    closeTab: vi.fn(),
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

describe("PwaWorkspaceTabs keyboard accessibility", () => {
  beforeEach(() => {
    activateTabMock.mockReset();
    usePwaWorkspaceTabsVMMock.mockReturnValue({
      fixedSessionsTab: sessionsTab,
      closableTabs: [paneATab, paneBTab],
      tabGroups: [tabGroup],
      resolveTabLabel: (tab: { paneId: string | null }) =>
        tab.paneId === "pane-a" ? "A" : tab.paneId === "pane-b" ? "B" : "S",
      resolveTabStateClass: () => "state",
    });
    usePwaTabsDndMock.mockReturnValue({
      sensors: [],
      dragKind: null,
      activeDragGroup: null,
      displayedGroupSortableItems: ["group:session:one"],
      orderedTabGroups: [tabGroup],
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
      displayedGroupSortableItems: ["group:session:one"],
      orderedTabGroups: [tabGroup],
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
});

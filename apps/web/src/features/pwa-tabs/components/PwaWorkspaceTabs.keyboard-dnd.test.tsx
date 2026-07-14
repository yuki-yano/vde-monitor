import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { reorderTabsByClosableOrderMock } = vi.hoisted(() => ({
  reorderTabsByClosableOrderMock: vi.fn(),
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

vi.mock("../context/workspace-tabs-context", () => ({
  useWorkspaceTabs: () => ({
    enabled: true,
    activeTabId: paneATab.id,
    tabs: [sessionsTab, paneATab, paneBTab],
    activateTab: vi.fn(),
    closeTab: vi.fn(),
    reorderTabs: vi.fn(),
    reorderTabsByClosableOrder: reorderTabsByClosableOrderMock,
  }),
}));

vi.mock("../hooks/usePwaWorkspaceTabsVM", () => ({
  usePwaWorkspaceTabsVM: () => ({
    fixedSessionsTab: sessionsTab,
    closableTabs: [paneATab, paneBTab],
    tabGroups: [paneAGroup, paneBGroup],
    resolveTabLabel: (tab: { paneId: string | null }) =>
      tab.paneId === "pane-a" ? "A" : tab.paneId === "pane-b" ? "B" : "S",
    resolveTabStateClass: () => "state",
  }),
}));

import { PwaWorkspaceTabs } from "./PwaWorkspaceTabs";

const buildRect = (left: number): DOMRect => ({
  x: left,
  y: 0,
  left,
  top: 0,
  right: left + 80,
  bottom: 32,
  width: 80,
  height: 32,
  toJSON: () => ({}),
});

describe("PwaWorkspaceTabs keyboard group reordering", () => {
  beforeEach(() => {
    reorderTabsByClosableOrderMock.mockReset();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const groupKey = this.getAttribute("data-group-key");
        if (groupKey === paneAGroup.key) return buildRect(0);
        if (groupKey === paneBGroup.key) return buildRect(100);
        return buildRect(0);
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lifts, moves, and drops a portaled group control with the keyboard", async () => {
    render(<PwaWorkspaceTabs />);
    const firstGroupControl = screen.getByRole("button", {
      name: "Reorder session group ONE",
    });
    expect(firstGroupControl.closest('[role="group"]')).toBe(
      screen.getByRole("group", { name: "Workspace tab controls" }),
    );
    firstGroupControl.focus();

    fireEvent.keyDown(firstGroupControl, { key: " ", code: "Space" });
    await waitFor(() => {
      expect(
        document.querySelector('[data-group-key="session:one"]')?.getAttribute("data-dragging"),
      ).toBe("true");
    });
    fireEvent.keyDown(document, { key: "ArrowRight", code: "ArrowRight" });
    await waitFor(() => {
      expect(
        document.querySelector<HTMLElement>('[data-group-key="session:one"]')?.style.transform,
      ).toContain("100px");
    });
    fireEvent.keyDown(document, { key: " ", code: "Space" });

    await waitFor(() => {
      expect(reorderTabsByClosableOrderMock).toHaveBeenCalledWith([paneBTab.id, paneATab.id]);
    });
  });
});

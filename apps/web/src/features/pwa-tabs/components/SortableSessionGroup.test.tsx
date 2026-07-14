import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildSessionGroupLabelByKey } from "../model/session-group-label";
import type { WorkspaceTab } from "../model/workspace-tabs";
import { SortableSessionGroup } from "./SortableSessionGroup";

const { groupKeyDownMock } = vi.hoisted(() => ({
  groupKeyDownMock: vi.fn(),
}));

vi.mock("@dnd-kit/sortable", async () => {
  const actual = await vi.importActual<typeof import("@dnd-kit/sortable")>("@dnd-kit/sortable");
  return {
    ...actual,
    useSortable: ({ id }: { id: string }) => ({
      attributes: {},
      listeners: id.startsWith("group:") ? { onKeyDown: groupKeyDownMock } : {},
      setActivatorNodeRef: vi.fn(),
      setNodeRef: vi.fn(),
      transform: null,
      transition: null,
      isDragging: false,
    }),
  };
});

const buildTab = (paneId: string): WorkspaceTab => ({
  id: `session:${paneId}`,
  kind: "session",
  paneId,
  systemRoute: null,
  closable: true,
  lastActivatedAt: 0,
});

describe("SortableSessionGroup", () => {
  beforeEach(() => {
    groupKeyDownMock.mockReset();
  });

  it("makes visual and accessible labels unique for same-named session groups", () => {
    const labelByKey = buildSessionGroupLabelByKey([
      { key: "session:workspace-1", name: "same-name" },
      { key: "session:workspace-2", name: "same-name" },
    ]);
    const groups = [
      {
        key: "session:workspace-1",
        label: labelByKey.get("session:workspace-1")!,
        tabs: [buildTab("surface-1")],
      },
      {
        key: "session:workspace-2",
        label: labelByKey.get("session:workspace-2")!,
        tabs: [buildTab("surface-2")],
      },
    ];

    const controlsGroup = document.createElement("div");
    controlsGroup.setAttribute("role", "group");
    controlsGroup.setAttribute("aria-label", "Workspace tab controls");
    document.body.append(controlsGroup);
    const view = render(
      <div role="tablist" aria-label="PWA workspace tabs">
        {groups.map((group) => (
          <SortableSessionGroup
            key={group.key}
            group={group}
            groupSortableId={`group:${group.key}`}
            activeTabId=""
            dragKind={null}
            groupColumnStart={groups.indexOf(group) * 2 + 1}
            controlsGroupElement={controlsGroup}
            resolveTabLabel={(tab) => tab.paneId ?? tab.id}
            resolveTabStateClass={() => "bg-latte-overlay0/80"}
            onActivateTab={vi.fn()}
            onCloseTab={vi.fn()}
          />
        ))}
      </div>,
    );

    const firstButton = screen.getByRole("button", {
      name: "Reorder session group SAME·1",
    });
    const secondButton = screen.getByRole("button", {
      name: "Reorder session group SAME·2",
    });

    expect(firstButton.textContent).toBe("SAME·1");
    expect(secondButton.textContent).toBe("SAME·2");
    expect(firstButton.getAttribute("aria-label")).not.toBe(
      secondButton.getAttribute("aria-label"),
    );
    expect(firstButton.closest('[role="group"]')?.getAttribute("aria-label")).toBe(
      "Workspace tab controls",
    );
    expect(firstButton.closest('[role="tablist"]')).toBeNull();
    expect(screen.getByRole("tablist", { name: "PWA workspace tabs" }).contains(firstButton)).toBe(
      false,
    );

    firstButton.focus();
    fireEvent.keyDown(firstButton, { key: " " });
    fireEvent.keyDown(firstButton, { key: "ArrowRight" });
    fireEvent.keyDown(firstButton, { key: " " });
    expect(groupKeyDownMock.mock.calls.map(([event]) => event.key)).toEqual([
      " ",
      "ArrowRight",
      " ",
    ]);

    view.unmount();
    controlsGroup.remove();
  });
});

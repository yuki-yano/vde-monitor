import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { buildSessionGroupLabelByKey } from "../model/session-group-label";
import type { WorkspaceTab } from "../model/workspace-tabs";
import { SortableSessionGroup } from "./SortableSessionGroup";

vi.mock("@dnd-kit/sortable", async () => {
  const actual = await vi.importActual<typeof import("@dnd-kit/sortable")>("@dnd-kit/sortable");
  return {
    ...actual,
    useSortable: () => ({
      attributes: {},
      listeners: {},
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

    render(
      <>
        {groups.map((group) => (
          <SortableSessionGroup
            key={group.key}
            group={group}
            groupSortableId={`group:${group.key}`}
            activeTabId=""
            dragKind={null}
            resolveTabLabel={(tab) => tab.paneId ?? tab.id}
            resolveTabStateClass={() => "bg-latte-overlay0/80"}
            onActivateTab={vi.fn()}
            onCloseTab={vi.fn()}
          />
        ))}
      </>,
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
  });
});

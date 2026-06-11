import { DndContext, DragOverlay, MeasuringStrategy } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { LayoutPanelTop } from "lucide-react";
import { useEffect, useRef } from "react";

import { useWorkspaceTabs } from "../context/workspace-tabs-context";
import { usePwaWorkspaceTabsVM } from "../hooks/usePwaWorkspaceTabsVM";
import { toGroupSortableId, usePwaTabsDnd } from "../hooks/usePwaTabsDnd";
import { SortableSessionGroup } from "./SortableSessionGroup";
import { StaticTabChip } from "./StaticTabChip";

const PWA_TABS_OFFSET_CSS_VAR = "--vde-pwa-tabs-offset";

export const PwaWorkspaceTabs = () => {
  const {
    enabled,
    activeTabId,
    tabs,
    activateTab,
    closeTab,
    reorderTabs,
    reorderTabsByClosableOrder,
  } = useWorkspaceTabs();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { fixedSessionsTab, closableTabs, tabGroups, resolveTabLabel, resolveTabStateClass } =
    usePwaWorkspaceTabsVM(tabs);

  const {
    sensors,
    dragKind,
    activeDragGroup,
    displayedGroupSortableItems,
    orderedTabGroups,
    collisionDetection,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  } = usePwaTabsDnd({
    tabGroups,
    closableTabs,
    reorderTabs,
    reorderTabsByClosableOrder,
  });

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    if (!enabled) {
      document.documentElement.style.removeProperty(PWA_TABS_OFFSET_CSS_VAR);
      return;
    }
    const element = rootRef.current;
    if (!element) {
      return;
    }
    const applyOffset = () => {
      const nextHeight = Math.max(0, Math.ceil(element.getBoundingClientRect().height));
      document.documentElement.style.setProperty(PWA_TABS_OFFSET_CSS_VAR, `${nextHeight}px`);
    };
    applyOffset();
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => applyOffset());
    resizeObserver?.observe(element);
    window.addEventListener("resize", applyOffset);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", applyOffset);
      document.documentElement.style.removeProperty(PWA_TABS_OFFSET_CSS_VAR);
    };
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  return (
    <div
      ref={rootRef}
      className="pointer-events-none fixed inset-x-0 top-0 z-[90] pb-2 pt-[env(safe-area-inset-top)]"
    >
      <div
        aria-hidden="true"
        className="bg-latte-mantle absolute inset-x-0 top-0 h-[env(safe-area-inset-top)]"
      />
      <div className="border-latte-lavender/30 bg-latte-mantle shadow-accent-panel pointer-events-auto w-full border-b px-2 py-1.5 backdrop-blur-xl">
        <div
          role="tablist"
          aria-label="PWA workspace tabs"
          className="no-scrollbar overflow-x-auto"
        >
          <div className="flex min-w-max items-center gap-1.5">
            {fixedSessionsTab && (
              <button
                type="button"
                role="tab"
                aria-selected={activeTabId === fixedSessionsTab.id}
                onClick={() => activateTab(fixedSessionsTab.id)}
                className={[
                  "border-latte-surface2/70 bg-latte-base/88 text-latte-subtext0 hover:text-latte-text hover:border-latte-lavender/60 inline-flex min-w-0 items-center gap-1.5 rounded-xl border px-2 py-1.5 text-[11px] font-semibold transition",
                  "data-[active=true]:bg-latte-lavender/18 data-[active=true]:text-latte-text data-[active=true]:border-latte-blue/85 data-[active=true]:shadow-accent-outline data-[active=true]:font-bold",
                ].join(" ")}
                data-active={activeTabId === fixedSessionsTab.id ? "true" : "false"}
              >
                <span className="bg-latte-blue/85 h-2.5 w-2.5 rounded-full border border-white/45" />
                <LayoutPanelTop className="h-3.5 w-3.5" />
                <span>S</span>
              </button>
            )}
            <DndContext
              sensors={sensors}
              collisionDetection={collisionDetection}
              measuring={{
                droppable: {
                  strategy: MeasuringStrategy.Always,
                },
              }}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <SortableContext
                items={displayedGroupSortableItems}
                strategy={horizontalListSortingStrategy}
              >
                {orderedTabGroups.map((group) => (
                  <SortableSessionGroup
                    key={group.key}
                    group={group}
                    groupSortableId={toGroupSortableId(group.key)}
                    activeTabId={activeTabId}
                    dragKind={dragKind}
                    resolveTabLabel={resolveTabLabel}
                    resolveTabStateClass={resolveTabStateClass}
                    onActivateTab={activateTab}
                    onCloseTab={closeTab}
                  />
                ))}
              </SortableContext>
              <DragOverlay>
                {activeDragGroup && (
                  <div className="border-latte-surface2/75 bg-latte-mantle/96 shadow-accent-panel flex items-center gap-1.5 rounded-xl border px-1.5 py-1.5 backdrop-blur-xl">
                    <span className="text-latte-text bg-latte-base/92 rounded-md px-1.5 py-1 text-[10px] font-semibold tracking-wide">
                      {activeDragGroup.label}
                    </span>
                    {activeDragGroup.tabs.map((tab) => (
                      <StaticTabChip
                        key={tab.id}
                        tab={tab}
                        label={resolveTabLabel(tab)}
                        active={activeTabId === tab.id}
                        statusClassName={resolveTabStateClass(tab)}
                      />
                    ))}
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          </div>
        </div>
      </div>
    </div>
  );
};

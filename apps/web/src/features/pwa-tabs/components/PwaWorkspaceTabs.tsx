import {
  closestCenter,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  type AnimateLayoutChanges,
  arrayMove,
  defaultAnimateLayoutChanges,
  horizontalListSortingStrategy,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Grid2x2, LayoutPanelTop, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSessions } from "@/state/session-context";

import { useWorkspaceTabs } from "../context/workspace-tabs-context";
import {
  buildSessionGroupLabelByName,
  normalizeSessionGroupName,
} from "../model/session-group-label";
import {
  SYSTEM_CHAT_GRID_TAB_ID,
  SYSTEM_SESSIONS_TAB_ID,
  type WorkspaceTab,
} from "../model/workspace-tabs";

type WorkspaceTabGroup = {
  key: string;
  label: string;
  tabs: WorkspaceTab[];
};

type DragKind = "tab" | "group" | null;

type SortableTabItemProps = {
  tab: WorkspaceTab;
  tabSortableId: string;
  label: string;
  active: boolean;
  showGridIcon: boolean;
  dragKind: DragKind;
  statusClassName: string;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
};

type SortableSessionGroupProps = {
  group: WorkspaceTabGroup;
  groupSortableId: string;
  activeTabId: string;
  dragKind: DragKind;
  resolveTabLabel: (tab: WorkspaceTab) => string;
  resolveTabStateClass: (tab: WorkspaceTab) => string;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
};

type StaticTabChipProps = {
  tab: WorkspaceTab;
  label: string;
  active: boolean;
  statusClassName: string;
};

const TAB_SORTABLE_ID_PREFIX = "tab:";
const GROUP_SORTABLE_ID_PREFIX = "group:";
const TAB_LAYOUT_TRANSITION = "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)";
const PWA_TABS_OFFSET_CSS_VAR = "--vde-pwa-tabs-offset";

const toTabSortableId = (tabId: string) => `${TAB_SORTABLE_ID_PREFIX}${tabId}`;
const fromTabSortableId = (sortableId: string): string | null =>
  sortableId.startsWith(TAB_SORTABLE_ID_PREFIX)
    ? sortableId.slice(TAB_SORTABLE_ID_PREFIX.length)
    : null;

const toGroupSortableId = (groupKey: string) => `${GROUP_SORTABLE_ID_PREFIX}${groupKey}`;
const fromGroupSortableId = (sortableId: string): string | null =>
  sortableId.startsWith(GROUP_SORTABLE_ID_PREFIX)
    ? sortableId.slice(GROUP_SORTABLE_ID_PREFIX.length)
    : null;

const resolveStateTone = (state: string | null | undefined) => {
  if (state === "RUNNING") {
    return "bg-latte-green/85";
  }
  if (state === "WAITING_INPUT") {
    return "bg-latte-peach/85";
  }
  if (state === "WAITING_PERMISSION") {
    return "bg-latte-peach/85";
  }
  if (state === "ERROR") {
    return "bg-latte-red/85";
  }
  return "bg-latte-overlay0/80";
};

const resolveSessionGroupMeta = (
  tab: WorkspaceTab,
  sessionByPaneId: Map<string, ReturnType<typeof useSessions>["sessions"][number]>,
  sessionGroupLabelByName: Map<string, string>,
) => {
  if (tab.kind !== "session" || tab.paneId == null) {
    return { groupKey: "system", groupLabel: "SYS" };
  }
  const session = sessionByPaneId.get(tab.paneId);
  const sessionName = normalizeSessionGroupName(session?.sessionName);
  return {
    groupKey: `session:${sessionName}`,
    groupLabel: sessionGroupLabelByName.get(sessionName) ?? sessionName.slice(0, 4).toUpperCase(),
  };
};

const SortableTabItem = ({
  tab,
  tabSortableId,
  label,
  active,
  showGridIcon,
  dragKind,
  statusClassName,
  onActivate,
  onClose,
}: SortableTabItemProps) => {
  const sortableDisabled = dragKind === "group";
  const showCloseButton = active && dragKind == null;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tabSortableId,
    disabled: sortableDisabled,
    animateLayoutChanges: animateTabLayoutChanges,
    transition: {
      duration: 180,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    },
  });
  const style = {
    transform: CSS.Transform.toString(transform) ?? undefined,
    transition: dragKind === "group" ? undefined : (transition ?? TAB_LAYOUT_TRANSITION),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative flex items-center gap-1"
      data-dragging={isDragging ? "true" : "false"}
      {...attributes}
      {...listeners}
    >
      {showGridIcon && (
        <span className="text-latte-overlay1 inline-flex h-4 w-4 items-center justify-center">
          <Grid2x2 className="h-3 w-3" />
        </span>
      )}
      <button
        type="button"
        role="tab"
        aria-selected={active}
        onClick={() => onActivate(tab.id)}
        onContextMenu={(event) => {
          event.preventDefault();
        }}
        className={[
          "border-latte-surface2/70 bg-latte-base/88 text-latte-subtext0 hover:text-latte-text hover:border-latte-lavender/60 inline-flex min-w-0 items-center gap-1.5 rounded-xl border py-1.5 pl-2 text-[11px] font-semibold transition",
          "touch-pan-x select-none [-webkit-touch-callout:none] [-webkit-user-select:none] [user-select:none]",
          "data-[active=true]:bg-latte-lavender/18 data-[active=true]:text-latte-text data-[active=true]:border-latte-blue/85 data-[active=true]:shadow-accent-outline data-[active=true]:font-bold",
          showCloseButton ? "min-w-[4.2rem] pr-5" : "pr-2",
          isDragging ? "opacity-90" : "",
        ].join(" ")}
        data-active={active ? "true" : "false"}
      >
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full border border-white/45 ${statusClassName}`}
          aria-hidden="true"
        />
        <span className="max-w-[5.2rem] truncate">{label}</span>
      </button>
      {showCloseButton && (
        <button
          type="button"
          className="text-latte-overlay1 hover:text-latte-text hover:bg-latte-surface1/55 absolute right-[3px] top-1/2 inline-flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-sm transition"
          aria-label={`Close ${label}`}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            onClose(tab.id);
          }}
        >
          <X className="h-3 w-3 translate-y-[0.5px]" />
        </button>
      )}
    </div>
  );
};

const animateGroupLayoutChanges: AnimateLayoutChanges = (args) => {
  if (args.isSorting || args.wasDragging) {
    return true;
  }
  return defaultAnimateLayoutChanges(args);
};

const animateTabLayoutChanges: AnimateLayoutChanges = (args) => {
  if (args.isSorting || args.wasDragging) {
    return true;
  }
  return defaultAnimateLayoutChanges(args);
};

const SortableSessionGroup = ({
  group,
  groupSortableId,
  activeTabId,
  dragKind,
  resolveTabLabel,
  resolveTabStateClass,
  onActivateTab,
  onCloseTab,
}: SortableSessionGroupProps) => {
  const sortableDisabled = dragKind === "tab";
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: groupSortableId,
    disabled: sortableDisabled,
    animateLayoutChanges: animateGroupLayoutChanges,
    transition: {
      duration: 220,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    },
  });
  const style = {
    transform: CSS.Transform.toString(transform) ?? undefined,
    transition: transition ?? undefined,
    zIndex: isDragging ? 40 : undefined,
  };
  const latestTabInGroup = group.tabs.reduce<WorkspaceTab | null>((latest, candidate) => {
    if (latest == null) {
      return candidate;
    }
    if (candidate.lastActivatedAt > latest.lastActivatedAt) {
      return candidate;
    }
    if (candidate.lastActivatedAt === latest.lastActivatedAt && candidate.id === activeTabId) {
      return candidate;
    }
    return latest;
  }, null);
  const isActiveGroup = group.tabs.some((tab) => tab.id === activeTabId);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "border-latte-surface2/65 relative flex items-center gap-1.5 border-l pl-1.5",
        isDragging ? "opacity-45" : "",
      ].join(" ")}
      data-group-key={group.key}
      data-dragging={isDragging ? "true" : "false"}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`Reorder session group ${group.label}`}
        onClick={(event) => {
          if (event.defaultPrevented || isDragging) {
            return;
          }
          if (latestTabInGroup == null) {
            return;
          }
          onActivateTab(latestTabInGroup.id);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
        }}
        className={[
          "text-latte-overlay1 bg-latte-base/70 hover:bg-latte-base/85 rounded-md border border-transparent px-1.5 py-1 text-[10px] font-semibold tracking-wide transition",
          isActiveGroup
            ? "text-latte-text border-latte-lavender/45 bg-latte-lavender/20 shadow-accent-sm"
            : "",
          "cursor-grab touch-pan-x select-none [-webkit-touch-callout:none] [-webkit-user-select:none] [user-select:none] active:cursor-grabbing",
          isDragging ? "bg-latte-base/90 text-latte-text" : "",
        ].join(" ")}
        {...attributes}
        {...listeners}
      >
        {group.label}
      </button>
      <SortableContext
        items={group.tabs.map((tab) => toTabSortableId(tab.id))}
        strategy={rectSortingStrategy}
      >
        {group.tabs.map((tab) => {
          const label = resolveTabLabel(tab);
          const isActive = activeTabId === tab.id;
          const stateClass = resolveTabStateClass(tab);
          return (
            <SortableTabItem
              key={tab.id}
              tab={tab}
              tabSortableId={toTabSortableId(tab.id)}
              label={label}
              active={isActive}
              showGridIcon={tab.id === SYSTEM_CHAT_GRID_TAB_ID}
              dragKind={dragKind}
              statusClassName={stateClass}
              onActivate={onActivateTab}
              onClose={onCloseTab}
            />
          );
        })}
      </SortableContext>
    </div>
  );
};

const StaticTabChip = ({ tab, label, active, statusClassName }: StaticTabChipProps) => {
  return (
    <div className="flex items-center gap-1">
      {tab.id === SYSTEM_CHAT_GRID_TAB_ID && (
        <span className="text-latte-overlay1 inline-flex h-4 w-4 items-center justify-center">
          <Grid2x2 className="h-3 w-3" />
        </span>
      )}
      <div
        className={[
          "border-latte-surface2/70 bg-latte-base/92 text-latte-subtext0 inline-flex min-w-0 items-center gap-1.5 rounded-xl border py-1.5 pl-2 text-[11px] font-semibold",
          active ? "text-latte-text pr-4.5 min-w-[3.8rem]" : "pr-2",
        ].join(" ")}
      >
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full border border-white/45 ${statusClassName}`}
          aria-hidden="true"
        />
        <span className="max-w-[5.2rem] truncate">{label}</span>
      </div>
    </div>
  );
};

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
  const { sessions } = useSessions();
  const [dragKind, setDragKind] = useState<DragKind>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [previewGroupSortableItems, setPreviewGroupSortableItems] = useState<string[] | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sessionByPaneId = useMemo(
    () => new Map(sessions.map((session) => [session.paneId, session])),
    [sessions],
  );
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 500, tolerance: 10 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const fixedSessionsTab = tabs.find((tab) => tab.id === SYSTEM_SESSIONS_TAB_ID);
  const closableTabs = tabs.filter((tab) => tab.closable);
  const sessionGroupLabelByName = useMemo(() => {
    const sessionNames = closableTabs.flatMap((tab) => {
      if (tab.kind !== "session" || tab.paneId == null) {
        return [];
      }
      return [normalizeSessionGroupName(sessionByPaneId.get(tab.paneId)?.sessionName)];
    });
    return buildSessionGroupLabelByName(sessionNames);
  }, [closableTabs, sessionByPaneId]);
  const tabGroups = useMemo(() => {
    const groups = new Map<string, WorkspaceTabGroup>();
    closableTabs.forEach((tab) => {
      const groupMeta = resolveSessionGroupMeta(tab, sessionByPaneId, sessionGroupLabelByName);
      const current = groups.get(groupMeta.groupKey);
      if (current) {
        current.tabs.push(tab);
        return;
      }
      groups.set(groupMeta.groupKey, {
        key: groupMeta.groupKey,
        label: groupMeta.groupLabel,
        tabs: [tab],
      });
    });
    return [...groups.values()];
  }, [closableTabs, sessionByPaneId, sessionGroupLabelByName]);

  const resolveTabLabel = (tab: WorkspaceTab) => {
    if (tab.id === SYSTEM_SESSIONS_TAB_ID) {
      return "S";
    }
    if (tab.id === SYSTEM_CHAT_GRID_TAB_ID) {
      return "G";
    }
    if (tab.kind === "session" && tab.paneId != null) {
      const session = sessionByPaneId.get(tab.paneId);
      if (!session) {
        return tab.paneId;
      }
      const hasWindowIndex =
        typeof session.windowIndex === "number" && Number.isFinite(session.windowIndex);
      const hasPaneIndex =
        typeof session.paneIndex === "number" && Number.isFinite(session.paneIndex);
      if (hasWindowIndex && hasPaneIndex) {
        return `${session.windowIndex}-${session.paneIndex}`;
      }
      return tab.paneId;
    }
    return "T";
  };

  const resolveTabStateClass = (tab: WorkspaceTab) => {
    if (tab.kind !== "session" || tab.paneId == null) {
      return "bg-latte-blue/85";
    }
    return resolveStateTone(sessionByPaneId.get(tab.paneId)?.state);
  };

  const activeDragGroup = useMemo(() => {
    if (dragKind !== "group" || activeDragId == null) {
      return null;
    }
    const groupKey = fromGroupSortableId(activeDragId);
    if (groupKey == null) {
      return null;
    }
    return tabGroups.find((group) => group.key === groupKey) ?? null;
  }, [activeDragId, dragKind, tabGroups]);

  const baseGroupSortableItems = useMemo(
    () => tabGroups.map((group) => toGroupSortableId(group.key)),
    [tabGroups],
  );
  const displayedGroupSortableItems = useMemo(() => {
    if (dragKind !== "group" || previewGroupSortableItems == null) {
      return baseGroupSortableItems;
    }
    if (previewGroupSortableItems.length !== baseGroupSortableItems.length) {
      return baseGroupSortableItems;
    }
    const baseSet = new Set(baseGroupSortableItems);
    if (previewGroupSortableItems.some((sortableId) => !baseSet.has(sortableId))) {
      return baseGroupSortableItems;
    }
    return previewGroupSortableItems;
  }, [baseGroupSortableItems, dragKind, previewGroupSortableItems]);
  const groupBySortableId = useMemo(
    () => new Map(tabGroups.map((group) => [toGroupSortableId(group.key), group] as const)),
    [tabGroups],
  );
  const orderedTabGroups = useMemo(() => {
    const ordered = displayedGroupSortableItems
      .map((sortableId) => groupBySortableId.get(sortableId))
      .filter((group): group is WorkspaceTabGroup => group != null);
    if (ordered.length !== tabGroups.length) {
      return tabGroups;
    }
    return ordered;
  }, [displayedGroupSortableItems, groupBySortableId, tabGroups]);

  const reorderSessionGroups = useCallback(
    (activeGroupKey: string, overGroupKey: string) => {
      const groupKeys = tabGroups.map((group) => group.key);
      const fromIndex = groupKeys.indexOf(activeGroupKey);
      const toIndex = groupKeys.indexOf(overGroupKey);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
        return;
      }
      const reorderedGroupKeys = arrayMove(groupKeys, fromIndex, toIndex);
      const groupByKey = new Map(tabGroups.map((group) => [group.key, group]));
      const orderedClosableTabIds = reorderedGroupKeys.flatMap(
        (groupKey) => groupByKey.get(groupKey)?.tabs.map((tab) => tab.id) ?? [],
      );
      if (orderedClosableTabIds.length !== closableTabs.length) {
        return;
      }
      reorderTabsByClosableOrder(orderedClosableTabIds);
    },
    [closableTabs.length, reorderTabsByClosableOrder, tabGroups],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const activeId = event.active.id;
      setActiveDragId(typeof activeId === "string" ? activeId : null);
      if (typeof activeId !== "string") {
        setDragKind(null);
        setPreviewGroupSortableItems(null);
        return;
      }
      if (fromGroupSortableId(activeId) != null) {
        setDragKind("group");
        setPreviewGroupSortableItems(baseGroupSortableItems);
        return;
      }
      if (fromTabSortableId(activeId) != null) {
        setDragKind("tab");
        setPreviewGroupSortableItems(null);
        return;
      }
      setDragKind(null);
      setPreviewGroupSortableItems(null);
    },
    [baseGroupSortableItems],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      if (dragKind !== "group") {
        return;
      }
      const activeId = event.active.id;
      const overId = event.over?.id;
      if (typeof activeId !== "string" || typeof overId !== "string") {
        return;
      }
      if (fromGroupSortableId(activeId) == null || fromGroupSortableId(overId) == null) {
        return;
      }
      setPreviewGroupSortableItems((previous) => {
        const current = previous ?? baseGroupSortableItems;
        const fromIndex = current.indexOf(activeId);
        const toIndex = current.indexOf(overId);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
          return previous;
        }
        return arrayMove(current, fromIndex, toIndex);
      });
    },
    [baseGroupSortableItems, dragKind],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeId = event.active.id;
      const overId = event.over?.id;
      const currentDragKind = dragKind;
      const currentPreviewGroupSortableItems = previewGroupSortableItems;
      setDragKind(null);
      setActiveDragId(null);
      setPreviewGroupSortableItems(null);
      if (typeof activeId !== "string" || typeof overId !== "string") {
        return;
      }
      const activeTabId = fromTabSortableId(activeId);
      const overTabId = fromTabSortableId(overId);
      if (activeTabId != null && overTabId != null) {
        reorderTabs(activeTabId, overTabId);
        return;
      }
      const activeGroupKey = fromGroupSortableId(activeId);
      const overGroupKey = fromGroupSortableId(overId);
      if (activeGroupKey != null && overGroupKey != null) {
        if (currentDragKind === "group" && currentPreviewGroupSortableItems != null) {
          const orderedGroupKeys = currentPreviewGroupSortableItems
            .map((sortableId) => fromGroupSortableId(sortableId))
            .filter((groupKey): groupKey is string => groupKey != null);
          if (orderedGroupKeys.length === tabGroups.length) {
            const groupByKey = new Map(tabGroups.map((group) => [group.key, group]));
            const orderedClosableTabIds = orderedGroupKeys.flatMap(
              (groupKey) => groupByKey.get(groupKey)?.tabs.map((tab) => tab.id) ?? [],
            );
            if (orderedClosableTabIds.length === closableTabs.length) {
              reorderTabsByClosableOrder(orderedClosableTabIds);
              return;
            }
          }
        }
        reorderSessionGroups(activeGroupKey, overGroupKey);
      }
    },
    [
      closableTabs.length,
      dragKind,
      previewGroupSortableItems,
      reorderSessionGroups,
      reorderTabs,
      reorderTabsByClosableOrder,
      tabGroups,
    ],
  );

  const handleDragCancel = useCallback(() => {
    setDragKind(null);
    setActiveDragId(null);
    setPreviewGroupSortableItems(null);
  }, []);
  const tabGroupKeyBySortableId = useMemo(() => {
    const map = new Map<string, string>();
    tabGroups.forEach((group) => {
      group.tabs.forEach((tab) => {
        map.set(toTabSortableId(tab.id), group.key);
      });
    });
    return map;
  }, [tabGroups]);

  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      const activeId = args.active.id;
      if (typeof activeId !== "string") {
        return closestCenter(args);
      }
      const activeGroupKey = fromGroupSortableId(activeId);
      const activeTabId = fromTabSortableId(activeId);
      if (activeGroupKey == null && activeTabId == null) {
        return closestCenter(args);
      }
      const scopedDroppableContainers = args.droppableContainers.filter((container) => {
        if (typeof container.id !== "string") {
          return false;
        }
        if (activeGroupKey != null) {
          return container.id.startsWith(GROUP_SORTABLE_ID_PREFIX);
        }
        if (activeTabId != null) {
          if (!container.id.startsWith(TAB_SORTABLE_ID_PREFIX)) {
            return false;
          }
          const activeTabGroupKey = tabGroupKeyBySortableId.get(activeId);
          if (activeTabGroupKey == null) {
            return true;
          }
          return tabGroupKeyBySortableId.get(container.id) === activeTabGroupKey;
        }
        return false;
      });
      return closestCenter({
        ...args,
        droppableContainers:
          scopedDroppableContainers.length > 0
            ? scopedDroppableContainers
            : args.droppableContainers,
      });
    },
    [tabGroupKeyBySortableId],
  );

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

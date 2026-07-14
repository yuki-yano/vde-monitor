import {
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  type AnimateLayoutChanges,
  arrayMove,
  defaultAnimateLayoutChanges,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { useCallback, useMemo, useState } from "react";

import type { WorkspaceTab } from "../model/workspace-tabs";
import type { WorkspaceTabGroup } from "./usePwaWorkspaceTabsVM";

export type DragKind = "tab" | "group" | null;

export const TAB_SORTABLE_ID_PREFIX = "tab:";
export const GROUP_SORTABLE_ID_PREFIX = "group:";
export const TAB_LAYOUT_TRANSITION = "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)";

export const toTabSortableId = (tabId: string) => `${TAB_SORTABLE_ID_PREFIX}${tabId}`;
export const fromTabSortableId = (sortableId: string): string | null =>
  sortableId.startsWith(TAB_SORTABLE_ID_PREFIX)
    ? sortableId.slice(TAB_SORTABLE_ID_PREFIX.length)
    : null;

export const toGroupSortableId = (groupKey: string) => `${GROUP_SORTABLE_ID_PREFIX}${groupKey}`;
export const fromGroupSortableId = (sortableId: string): string | null =>
  sortableId.startsWith(GROUP_SORTABLE_ID_PREFIX)
    ? sortableId.slice(GROUP_SORTABLE_ID_PREFIX.length)
    : null;

const resolveHorizontalSortableKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  if (event.code !== "ArrowLeft" && event.code !== "ArrowRight") {
    return sortableKeyboardCoordinates(event, args);
  }
  const activeId = args.context.active?.id;
  if (typeof activeId !== "string") {
    return sortableKeyboardCoordinates(event, args);
  }
  const sortablePrefix = activeId.startsWith(GROUP_SORTABLE_ID_PREFIX)
    ? GROUP_SORTABLE_ID_PREFIX
    : activeId.startsWith(TAB_SORTABLE_ID_PREFIX)
      ? TAB_SORTABLE_ID_PREFIX
      : null;
  if (sortablePrefix == null) {
    return sortableKeyboardCoordinates(event, args);
  }
  const candidates = args.context.droppableContainers
    .getEnabled()
    .filter((container) => {
      if (typeof container.id !== "string" || !container.id.startsWith(sortablePrefix)) {
        return false;
      }
      return container.node.current != null || args.context.droppableRects.has(container.id);
    })
    .sort((left, right) => {
      const leftRect =
        left.node.current?.getBoundingClientRect() ?? args.context.droppableRects.get(left.id);
      const rightRect =
        right.node.current?.getBoundingClientRect() ?? args.context.droppableRects.get(right.id);
      return (leftRect?.left ?? 0) - (rightRect?.left ?? 0);
    });
  const overId = args.context.over?.id;
  const currentId =
    typeof overId === "string" && overId.startsWith(sortablePrefix) ? overId : activeId;
  const currentIndex = candidates.findIndex((container) => container.id === currentId);
  const targetIndex = currentIndex + (event.code === "ArrowRight" ? 1 : -1);
  const target = candidates[targetIndex];
  const targetRect = target
    ? (target.node.current?.getBoundingClientRect() ?? args.context.droppableRects.get(target.id))
    : null;
  if (targetRect == null) {
    return undefined;
  }
  event.preventDefault();
  return { x: targetRect.left, y: targetRect.top };
};

export const animateGroupLayoutChanges: AnimateLayoutChanges = (args) => {
  if (args.isSorting || args.wasDragging) {
    return true;
  }
  return defaultAnimateLayoutChanges(args);
};

export const animateTabLayoutChanges: AnimateLayoutChanges = (args) => {
  if (args.isSorting || args.wasDragging) {
    return true;
  }
  return defaultAnimateLayoutChanges(args);
};

type UsePwaTabsDndParams = {
  tabGroups: WorkspaceTabGroup[];
  closableTabs: WorkspaceTab[];
  reorderTabs: (activeTabId: string, overTabId: string) => void;
  reorderTabsByClosableOrder: (orderedTabIds: string[]) => void;
};

export const usePwaTabsDnd = ({
  tabGroups,
  closableTabs,
  reorderTabs,
  reorderTabsByClosableOrder,
}: UsePwaTabsDndParams) => {
  const [dragKind, setDragKind] = useState<DragKind>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [previewGroupSortableItems, setPreviewGroupSortableItems] = useState<string[] | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 500, tolerance: 10 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: resolveHorizontalSortableKeyboardCoordinates,
    }),
  );

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

  const tabGroupKeyBySortableId = useMemo(() => {
    const map = new Map<string, string>();
    tabGroups.forEach((group) => {
      group.tabs.forEach((tab) => {
        map.set(toTabSortableId(tab.id), group.key);
      });
    });
    return map;
  }, [tabGroups]);

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

  return {
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
  };
};

import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef } from "react";

import { mapAnchorIndex } from "./scroll-stability";

type Range = { startIndex: number; endIndex: number };

const SCROLL_KEYS = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
  " ",
]);

type UseStableVirtuosoScrollParams = {
  items: string[];
  isAtBottom: boolean;
  enabled?: boolean;
  isUserScrolling?: boolean;
  scrollerRef?: RefObject<HTMLDivElement | null>;
  onUserScrollStateChange?: (isScrolling: boolean) => void;
};

const getItemOffset = (scroller: HTMLDivElement, index: number) => {
  const item = scroller.querySelector<HTMLElement>(`[data-index="${index}"]`);
  if (!item) return null;
  const scrollerRect = scroller.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  return itemRect.top - scrollerRect.top;
};

const clampIndex = (index: number, length: number) => {
  if (length <= 0) return 0;
  if (index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
};

const getItem = (scroller: HTMLDivElement, index: number) =>
  scroller.querySelector<HTMLElement>(`[data-index="${index}"]`);

const getItemHeight = (item: HTMLElement | null) =>
  item ? item.getBoundingClientRect().height : null;

const resolveScrollDelta = ({
  nextOffset,
  prevOffset,
  prevAnchorHeight,
  nextHeight,
  nextIndex,
  anchorIndex,
}: {
  nextOffset: number | null;
  prevOffset: number | null;
  prevAnchorHeight: number | null;
  nextHeight: number | null;
  nextIndex: number;
  anchorIndex: number;
}) => {
  if (nextOffset != null && prevOffset != null) {
    return nextOffset - prevOffset;
  }
  const lineHeight = prevAnchorHeight ?? nextHeight;
  if (!lineHeight || nextIndex === anchorIndex) {
    return null;
  }
  return (nextIndex - anchorIndex) * lineHeight;
};

const shouldSuppressCorrection = ({
  isInternalUserScrolling,
  isExternalUserScrolling,
}: {
  isInternalUserScrolling: boolean;
  isExternalUserScrolling: boolean;
}) => isInternalUserScrolling || isExternalUserScrolling;

export const useStableVirtuosoScroll = ({
  items,
  isAtBottom,
  enabled = true,
  isUserScrolling,
  scrollerRef: scrollerRefProp,
  onUserScrollStateChange,
}: UseStableVirtuosoScrollParams) => {
  const internalScrollerRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = scrollerRefProp ?? internalScrollerRef;
  const anchorIndexRef = useRef(0);
  const prevAnchorIndexRef = useRef(0);
  const prevAnchorOffsetRef = useRef<number | null>(null);
  const prevAnchorHeightRef = useRef<number | null>(null);
  const prevScrollTopRef = useRef<number | null>(null);
  const prevItemsRef = useRef(items);
  const itemsRef = useRef(items);
  const enabledRef = useRef(enabled);
  const isAtBottomRef = useRef(isAtBottom);
  const isExternalUserScrollingRef = useRef(Boolean(isUserScrolling));
  const isUserScrollingRef = useRef(false);
  const scrollEndTimerRef = useRef<number | null>(null);
  const isAdjustingRef = useRef(false);
  const onUserScrollStateChangeRef = useRef(onUserScrollStateChange);

  useLayoutEffect(() => {
    itemsRef.current = items;
    enabledRef.current = enabled;
    isAtBottomRef.current = isAtBottom;
    isExternalUserScrollingRef.current = Boolean(isUserScrolling);
  }, [enabled, isAtBottom, isUserScrolling, items]);

  useEffect(() => {
    onUserScrollStateChangeRef.current = onUserScrollStateChange;
  }, [onUserScrollStateChange]);

  const updateBaseline = useCallback(
    (index: number) => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const clamped = clampIndex(index, itemsRef.current.length);
      const item = getItem(scroller, clamped);
      const offset = item ? getItemOffset(scroller, clamped) : null;
      const height = getItemHeight(item);
      prevAnchorOffsetRef.current = offset;
      prevAnchorHeightRef.current = height;
      prevAnchorIndexRef.current = clamped;
      prevScrollTopRef.current = scroller.scrollTop;
    },
    [scrollerRef],
  );

  const handleRangeChanged = useCallback(
    (range: Range) => {
      anchorIndexRef.current = range.startIndex;
      if (
        (isUserScrollingRef.current || isExternalUserScrollingRef.current) &&
        prevItemsRef.current === itemsRef.current
      ) {
        updateBaseline(range.startIndex);
      }
    },
    [updateBaseline],
  );

  const withAdjustingScroll = useCallback((scroller: HTMLDivElement, nextScrollTop: number) => {
    isAdjustingRef.current = true;
    scroller.scrollTop = nextScrollTop;
    window.requestAnimationFrame(() => {
      isAdjustingRef.current = false;
    });
  }, []);

  const applyAnchorCorrection = useCallback(
    (scroller: HTMLDivElement, prevItems: string[], nextItems: string[]) => {
      const anchorIndex = clampIndex(prevAnchorIndexRef.current, prevItems.length);
      const nextIndex = mapAnchorIndex(prevItems, nextItems, anchorIndex);
      const nextItem = getItem(scroller, nextIndex);
      const nextOffset = nextItem ? getItemOffset(scroller, nextIndex) : null;
      const nextHeight = getItemHeight(nextItem);
      const delta = resolveScrollDelta({
        nextOffset,
        prevOffset: prevAnchorOffsetRef.current,
        prevAnchorHeight: prevAnchorHeightRef.current,
        nextHeight,
        nextIndex,
        anchorIndex,
      });

      if (delta != null && Math.abs(delta) >= 0.5) {
        withAdjustingScroll(scroller, scroller.scrollTop + delta);
        return nextIndex;
      }
      if (prevScrollTopRef.current != null) {
        withAdjustingScroll(scroller, prevScrollTopRef.current);
      }
      return nextIndex;
    },
    [withAdjustingScroll],
  );

  const isScrollCorrectionSuppressed = useCallback(() => {
    return shouldSuppressCorrection({
      isInternalUserScrolling: isUserScrollingRef.current,
      isExternalUserScrolling: isExternalUserScrollingRef.current,
    });
  }, []);

  const resetStabilityState = useCallback(() => {
    prevAnchorOffsetRef.current = null;
    prevAnchorHeightRef.current = null;
    prevScrollTopRef.current = null;
    prevAnchorIndexRef.current = 0;
  }, []);

  const flushPendingCorrection = useCallback(() => {
    if (!enabledRef.current || isScrollCorrectionSuppressed()) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const prevItems = prevItemsRef.current;
    const nextItems = itemsRef.current;
    if (prevItems === nextItems) {
      updateBaseline(anchorIndexRef.current);
      return;
    }

    const nextIndex = isAtBottomRef.current
      ? clampIndex(anchorIndexRef.current, nextItems.length)
      : applyAnchorCorrection(scroller, prevItems, nextItems);
    prevItemsRef.current = nextItems;
    anchorIndexRef.current = nextIndex;
    updateBaseline(nextIndex);
  }, [applyAnchorCorrection, isScrollCorrectionSuppressed, scrollerRef, updateBaseline]);

  const setUserScrolling = useCallback(
    (value: boolean, flushPending = true) => {
      if (isUserScrollingRef.current === value) return;
      isUserScrollingRef.current = value;
      onUserScrollStateChangeRef.current?.(value);
      if (!value && flushPending) {
        flushPendingCorrection();
      }
    },
    [flushPendingCorrection],
  );

  const scheduleScrollEnd = useCallback(() => {
    if (scrollEndTimerRef.current != null) {
      window.clearTimeout(scrollEndTimerRef.current);
    }
    scrollEndTimerRef.current = window.setTimeout(() => {
      scrollEndTimerRef.current = null;
      setUserScrolling(false);
    }, 120);
  }, [setUserScrolling]);

  const startUserScroll = useCallback(() => {
    if (isAdjustingRef.current) return;
    if (prevItemsRef.current === itemsRef.current) {
      updateBaseline(anchorIndexRef.current);
    }
    setUserScrolling(true);
    scheduleScrollEnd();
  }, [scheduleScrollEnd, setUserScrolling, updateBaseline]);

  const handleScrollEvent = useCallback(() => {
    if (isAdjustingRef.current) return;
    if (isUserScrollingRef.current) {
      if (prevItemsRef.current === itemsRef.current) {
        updateBaseline(anchorIndexRef.current);
      }
      scheduleScrollEnd();
      return;
    }
    updateBaseline(anchorIndexRef.current);
  }, [scheduleScrollEnd, updateBaseline]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (SCROLL_KEYS.has(event.key)) {
        startUserScroll();
      }
    },
    [startUserScroll],
  );

  useLayoutEffect(() => {
    if (!enabled) return undefined;
    const scroller = scrollerRef.current;
    if (!scroller) return undefined;
    scroller.addEventListener("scroll", handleScrollEvent, { passive: true });
    scroller.addEventListener("wheel", startUserScroll, { passive: true });
    scroller.addEventListener("touchmove", startUserScroll, { passive: true });
    scroller.addEventListener("pointerdown", startUserScroll, { passive: true });
    scroller.addEventListener("keydown", handleKeyDown);
    return () => {
      scroller.removeEventListener("scroll", handleScrollEvent);
      scroller.removeEventListener("wheel", startUserScroll);
      scroller.removeEventListener("touchmove", startUserScroll);
      scroller.removeEventListener("pointerdown", startUserScroll);
      scroller.removeEventListener("keydown", handleKeyDown);
      if (scrollEndTimerRef.current != null) {
        window.clearTimeout(scrollEndTimerRef.current);
        scrollEndTimerRef.current = null;
      }
      setUserScrolling(false, false);
    };
  }, [enabled, handleKeyDown, handleScrollEvent, scrollerRef, setUserScrolling, startUserScroll]);

  useEffect(() => {
    return () => {
      if (scrollEndTimerRef.current != null) {
        window.clearTimeout(scrollEndTimerRef.current);
        scrollEndTimerRef.current = null;
      }
      setUserScrolling(false, false);
    };
  }, [setUserScrolling]);

  useLayoutEffect(() => {
    if (!enabled) {
      prevItemsRef.current = items;
      resetStabilityState();
      return;
    }

    const scroller = scrollerRef.current;
    const prevItems = prevItemsRef.current;
    const itemsChanged = prevItems !== items;
    if (itemsChanged && isScrollCorrectionSuppressed()) {
      return;
    }

    if (scroller) {
      const currentIndex =
        itemsChanged && !isAtBottom
          ? applyAnchorCorrection(scroller, prevItems, items)
          : clampIndex(anchorIndexRef.current, items.length);
      anchorIndexRef.current = currentIndex;
      updateBaseline(currentIndex);
    }

    prevItemsRef.current = items;
  }, [
    items,
    isAtBottom,
    enabled,
    scrollerRef,
    updateBaseline,
    applyAnchorCorrection,
    isScrollCorrectionSuppressed,
    resetStabilityState,
  ]);

  return {
    scrollerRef,
    handleRangeChanged,
  };
};

export const __testables = {
  shouldSuppressCorrection,
};

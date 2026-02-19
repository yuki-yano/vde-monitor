import { useAtom } from "jotai";
import { type MutableRefObject, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { VirtuosoHandle } from "react-virtuoso";

import type { ScreenMode } from "@/lib/screen-loading";

import { screenAtBottomAtom, screenForceFollowAtom } from "../atoms/screenAtoms";

const FORCE_FOLLOW_FALLBACK_MS = 5000;

type UseScreenScrollParams = {
  paneId: string;
  mode: ScreenMode;
  screenLinesLength: number;
  isUserScrollingRef: MutableRefObject<boolean>;
  onFlushPending: () => void;
  onClearPending: () => void;
};

export const useScreenScroll = ({
  paneId,
  mode,
  screenLinesLength,
  isUserScrollingRef,
  onFlushPending,
  onClearPending,
}: UseScreenScrollParams) => {
  const [isAtBottom, setIsAtBottom] = useAtom(screenAtBottomAtom);
  const [forceFollow, setForceFollow] = useAtom(screenForceFollowAtom);

  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const forceFollowTimerRef = useRef<number | null>(null);
  const prevModeRef = useRef<ScreenMode>(mode);
  const prevPaneIdRef = useRef<string>(paneId);
  const snapToBottomRef = useRef(false);

  const stopForceFollow = useCallback(() => {
    setForceFollow(false);
    if (forceFollowTimerRef.current != null) {
      window.clearTimeout(forceFollowTimerRef.current);
      forceFollowTimerRef.current = null;
    }
  }, [setForceFollow]);

  const scrollToBottom = useCallback(
    (behavior: "auto" | "smooth" = "auto") => {
      if (screenLinesLength === 0) return false;
      const hasVirtuoso = Boolean(virtuosoRef.current);
      const hasScroller = Boolean(scrollerRef.current);
      if (!hasVirtuoso && !hasScroller) {
        return false;
      }
      if (virtuosoRef.current) {
        const index = screenLinesLength - 1;
        virtuosoRef.current.scrollToIndex({ index, align: "end", behavior });
      }
      if (isAtBottom) {
        stopForceFollow();
      } else {
        setForceFollow(true);
        if (forceFollowTimerRef.current != null) {
          window.clearTimeout(forceFollowTimerRef.current);
        }
        forceFollowTimerRef.current = window.setTimeout(() => {
          stopForceFollow();
        }, FORCE_FOLLOW_FALLBACK_MS);
      }
      if (!hasVirtuoso) {
        window.requestAnimationFrame(() => {
          const scroller = scrollerRef.current;
          if (scroller != null) {
            scroller.scrollTo({ top: scroller.scrollHeight, left: 0, behavior });
          }
        });
      }
      return true;
    },
    [isAtBottom, screenLinesLength, setForceFollow, stopForceFollow],
  );

  const handleAtBottomChange = useCallback(
    (value: boolean) => {
      setIsAtBottom(value);
      if (value) {
        stopForceFollow();
        onFlushPending();
      }
    },
    [onFlushPending, setIsAtBottom, stopForceFollow],
  );

  const handleUserScrollStateChange = useCallback(
    (value: boolean) => {
      isUserScrollingRef.current = value;
      if (!value) {
        onFlushPending();
      }
    },
    [isUserScrollingRef, onFlushPending],
  );

  useEffect(() => {
    const prevMode = prevModeRef.current;
    if (prevMode === "image" && mode === "text") {
      snapToBottomRef.current = true;
    }
    prevModeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (prevPaneIdRef.current !== paneId) {
      snapToBottomRef.current = true;
      prevPaneIdRef.current = paneId;
    }
  }, [paneId]);

  useLayoutEffect(() => {
    if (!snapToBottomRef.current || mode !== "text" || screenLinesLength === 0) {
      return;
    }
    const didSnap = scrollToBottom("auto");
    if (didSnap) {
      snapToBottomRef.current = false;
    }
  }, [mode, screenLinesLength, scrollToBottom]);

  useEffect(() => {
    if (mode !== "text") {
      setIsAtBottom(true);
      stopForceFollow();
      onClearPending();
    }
  }, [mode, onClearPending, setIsAtBottom, stopForceFollow]);

  useEffect(() => {
    return () => {
      stopForceFollow();
    };
  }, [stopForceFollow]);

  return {
    isAtBottom,
    forceFollow,
    scrollToBottom,
    handleAtBottomChange,
    handleUserScrollStateChange,
    virtuosoRef,
    scrollerRef,
  };
};

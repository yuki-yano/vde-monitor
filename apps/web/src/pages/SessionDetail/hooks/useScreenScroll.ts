import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
} from "react";
import type { VirtuosoHandle } from "react-virtuoso";

import type { ScreenMode } from "@/lib/screen-loading";

type UseScreenScrollParams = {
  paneId: string;
  mode: ScreenMode;
  screenLinesLength: number;
  isUserScrollingRef: MutableRefObject<boolean>;
  onFlushPending: () => void;
  onClearPending: () => void;
};

type ScreenScrollState = {
  isAtBottom: boolean;
  shouldFollowOutput: boolean;
};

type ScreenScrollAction =
  | { type: "measure-bottom"; value: boolean }
  | { type: "pause-following" }
  | { type: "resume-following" }
  | { type: "reset-context" };

const initialScreenScrollState: ScreenScrollState = {
  isAtBottom: true,
  shouldFollowOutput: true,
};

const reduceScreenScrollState = (
  state: ScreenScrollState,
  action: ScreenScrollAction,
): ScreenScrollState => {
  switch (action.type) {
    case "measure-bottom":
      return {
        isAtBottom: action.value,
        shouldFollowOutput: action.value ? true : state.shouldFollowOutput,
      };
    case "pause-following":
      return { ...state, shouldFollowOutput: false };
    case "resume-following":
      return { ...state, shouldFollowOutput: true };
    case "reset-context":
      return { isAtBottom: true, shouldFollowOutput: false };
  }
};

export const useScreenScroll = ({
  paneId,
  mode,
  screenLinesLength,
  isUserScrollingRef,
  onFlushPending,
  onClearPending,
}: UseScreenScrollParams) => {
  const [{ isAtBottom, shouldFollowOutput }, dispatchScrollState] = useReducer(
    reduceScreenScrollState,
    initialScreenScrollState,
  );

  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const onClearPendingRef = useRef(onClearPending);
  // react-doctor-disable-next-line no-event-handler
  const prevModeRef = useRef<ScreenMode>(mode);
  const prevPaneIdRef = useRef<string>(paneId);
  const didInitializeContextRef = useRef(false);
  const snapToBottomRef = useRef(mode === "text");

  useLayoutEffect(() => {
    onClearPendingRef.current = onClearPending;
  }, [onClearPending]);

  const stopFollowingOutput = useCallback(() => {
    dispatchScrollState({ type: "pause-following" });
  }, []);

  const scrollToBottom = useCallback(
    (behavior: "auto" | "smooth" = "auto") => {
      if (screenLinesLength === 0) return false;
      const hasVirtuoso = Boolean(virtuosoRef.current);
      const hasScroller = Boolean(scrollerRef.current);
      if (!hasVirtuoso && !hasScroller) {
        return false;
      }
      dispatchScrollState({ type: "resume-following" });
      if (virtuosoRef.current) {
        const index = screenLinesLength - 1;
        virtuosoRef.current.scrollToIndex({ index, align: "end", behavior });
      }
      if (!hasVirtuoso) {
        window.requestAnimationFrame(() => {
          const scroller = scrollerRef.current;
          if (scroller != null) {
            scroller.scrollTo({ top: scroller.scrollHeight, behavior });
          }
        });
      }
      return true;
    },
    [screenLinesLength],
  );

  const handleAtBottomChange = useCallback(
    (value: boolean) => {
      dispatchScrollState({ type: "measure-bottom", value });
      if (value && !isUserScrollingRef.current) {
        onFlushPending();
      }
    },
    [isUserScrollingRef, onFlushPending],
  );

  const handleUserScrollStateChange = useCallback(
    (value: boolean) => {
      isUserScrollingRef.current = value;
      if (value) {
        stopFollowingOutput();
        return;
      }
      onFlushPending();
    },
    [isUserScrollingRef, onFlushPending, stopFollowingOutput],
  );

  useLayoutEffect(() => {
    const isInitialContext = !didInitializeContextRef.current;
    const modeChanged = prevModeRef.current !== mode;
    const paneChanged = prevPaneIdRef.current !== paneId;
    if (!isInitialContext && !modeChanged && !paneChanged) {
      return;
    }

    isUserScrollingRef.current = false;
    dispatchScrollState({ type: "reset-context" });
    onClearPending();
    snapToBottomRef.current = mode === "text";
    prevModeRef.current = mode;
    prevPaneIdRef.current = paneId;
    didInitializeContextRef.current = true;
  }, [isUserScrollingRef, mode, onClearPending, paneId]);

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
    return () => {
      isUserScrollingRef.current = false;
      onClearPendingRef.current();
    };
  }, [isUserScrollingRef]);

  return {
    isAtBottom,
    shouldFollowOutput,
    scrollToBottom,
    handleAtBottomChange,
    handleUserScrollStateChange,
    virtuosoRef,
    scrollerRef,
  };
};

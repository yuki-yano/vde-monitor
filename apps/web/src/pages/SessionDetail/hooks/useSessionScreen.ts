import type { ScreenResponse } from "@vde-monitor/shared";
import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { VirtuosoHandle } from "react-virtuoso";

import { renderAnsiLines } from "@/lib/ansi";
import { applyScreenDeltas } from "@/lib/screen-delta";
import {
  initialScreenLoadingState,
  screenLoadingReducer,
  type ScreenMode,
} from "@/lib/screen-loading";
import type { Theme } from "@/lib/theme";

import { DISCONNECTED_MESSAGE } from "../sessionDetailUtils";

type UseSessionScreenParams = {
  paneId: string;
  connected: boolean;
  connectionIssue: string | null;
  requestScreen: (
    paneId: string,
    options: { lines?: number; mode?: "text" | "image"; cursor?: string },
  ) => Promise<ScreenResponse>;
  resolvedTheme: Theme;
  agent?: string | null;
};

export const useSessionScreen = ({
  paneId,
  connected,
  connectionIssue,
  requestScreen,
  resolvedTheme,
  agent,
}: UseSessionScreenParams) => {
  const [mode, setMode] = useState<ScreenMode>("text");
  const [screen, setScreen] = useState<string>("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [screenLoadingState, dispatchScreenLoading] = useReducer(
    screenLoadingReducer,
    initialScreenLoadingState,
  );
  const [modeLoaded, setModeLoaded] = useState({ text: false, image: false });
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [forceFollow, setForceFollow] = useState(false);

  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const forceFollowTimerRef = useRef<number | null>(null);
  const prevModeRef = useRef<ScreenMode>(mode);
  const snapToBottomRef = useRef(false);
  const screenRef = useRef<string>("");
  const imageRef = useRef<string | null>(null);
  const modeLoadedRef = useRef(modeLoaded);
  const modeSwitchRef = useRef<ScreenMode | null>(null);
  const refreshInFlightRef = useRef<null | { id: number; mode: ScreenMode }>(null);
  const refreshRequestIdRef = useRef(0);
  const cursorRef = useRef<string | null>(null);
  const screenLinesRef = useRef<string[]>([]);

  const resolvedAgent = useMemo(() => {
    if (agent === "codex" || agent === "claude") {
      return agent;
    }
    return "unknown";
  }, [agent]);

  const screenLines = useMemo(() => {
    if (mode !== "text") {
      return [];
    }
    return renderAnsiLines(screen || "No screen data", resolvedTheme, {
      agent: resolvedAgent,
    });
  }, [mode, screen, resolvedAgent, resolvedTheme]);

  const scrollToBottom = useCallback(
    (behavior: "auto" | "smooth" = "auto") => {
      if (!virtuosoRef.current || screenLines.length === 0) return;
      const index = screenLines.length - 1;
      virtuosoRef.current.scrollToIndex({ index, align: "end", behavior });
      setForceFollow(true);
      if (forceFollowTimerRef.current !== null) {
        window.clearTimeout(forceFollowTimerRef.current);
      }
      forceFollowTimerRef.current = window.setTimeout(() => {
        setForceFollow(false);
        forceFollowTimerRef.current = null;
      }, 500);
      window.requestAnimationFrame(() => {
        const scroller = scrollerRef.current;
        if (scroller) {
          scroller.scrollTo({ top: scroller.scrollHeight, left: 0, behavior });
        }
      });
    },
    [screenLines.length],
  );

  const handleAtBottomChange = useCallback((value: boolean) => {
    setIsAtBottom(value);
    if (value) {
      setForceFollow(false);
      if (forceFollowTimerRef.current !== null) {
        window.clearTimeout(forceFollowTimerRef.current);
        forceFollowTimerRef.current = null;
      }
    }
  }, []);

  const isScreenLoading = screenLoadingState.loading && screenLoadingState.mode === mode;

  useEffect(() => {
    const prevMode = prevModeRef.current;
    if (prevMode === "image" && mode === "text") {
      snapToBottomRef.current = true;
    }
    prevModeRef.current = mode;
  }, [mode]);

  useLayoutEffect(() => {
    if (!snapToBottomRef.current || mode !== "text") {
      return;
    }
    scrollToBottom("auto");
    snapToBottomRef.current = false;
  }, [mode, screenLines.length, scrollToBottom]);

  useEffect(() => {
    if (mode !== "text") {
      setIsAtBottom(true);
      setForceFollow(false);
    }
  }, [mode]);

  useEffect(() => {
    return () => {
      if (forceFollowTimerRef.current !== null) {
        window.clearTimeout(forceFollowTimerRef.current);
      }
    };
  }, []);

  const refreshScreen = useCallback(async () => {
    if (!paneId) return;
    if (!connected) {
      refreshInFlightRef.current = null;
      modeSwitchRef.current = null;
      dispatchScreenLoading({ type: "reset" });
      if (!connectionIssue) {
        setError(DISCONNECTED_MESSAGE);
      }
      return;
    }
    const requestId = (refreshRequestIdRef.current += 1);
    const inflight = refreshInFlightRef.current;
    const isModeOverride = inflight && inflight.mode !== mode;
    if (inflight && !isModeOverride) {
      return;
    }
    const isModeSwitch = modeSwitchRef.current === mode;
    const shouldShowLoading = isModeSwitch || !modeLoadedRef.current[mode];
    setError(null);
    if (shouldShowLoading) {
      dispatchScreenLoading({ type: "start", mode });
    }
    refreshInFlightRef.current = { id: requestId, mode };
    try {
      const options: { mode: ScreenMode; cursor?: string } = { mode };
      if (mode === "text" && cursorRef.current) {
        options.cursor = cursorRef.current;
      }
      const response = await requestScreen(paneId, options);
      if (refreshInFlightRef.current?.id !== requestId) {
        return;
      }
      if (!response.ok) {
        setError(response.error?.message ?? "Failed to capture screen");
        return;
      }
      setFallbackReason(response.fallbackReason ?? null);
      if (response.mode === "image") {
        const nextImage = response.imageBase64 ?? null;
        if (imageRef.current !== nextImage || screenRef.current !== "") {
          startTransition(() => {
            setImageBase64(nextImage);
            setScreen("");
          });
          imageRef.current = nextImage;
          screenRef.current = "";
        }
      } else {
        const nextCursor = response.cursor ?? null;
        const shouldUseFull = response.full || response.screen !== undefined || !response.deltas;
        if (shouldUseFull) {
          const nextScreen = response.screen ?? "";
          const nextLines = nextScreen.replace(/\r\n/g, "\n").split("\n");
          screenLinesRef.current = nextLines;
          cursorRef.current = nextCursor;
          if (screenRef.current !== nextScreen || imageRef.current !== null) {
            startTransition(() => {
              setScreen(nextScreen);
              setImageBase64(null);
            });
            screenRef.current = nextScreen;
            imageRef.current = null;
          }
        } else {
          const applied = applyScreenDeltas(screenLinesRef.current, response.deltas ?? []);
          if (!applied.ok) {
            cursorRef.current = null;
            return;
          }
          const nextLines = applied.lines;
          const nextScreen = nextLines.join("\n");
          screenLinesRef.current = nextLines;
          cursorRef.current = nextCursor;
          if (screenRef.current !== nextScreen || imageRef.current !== null) {
            startTransition(() => {
              setScreen(nextScreen);
              setImageBase64(null);
            });
            screenRef.current = nextScreen;
            imageRef.current = null;
          }
        }
      }
      setModeLoaded((prev) => ({ ...prev, [mode]: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Screen request failed");
    } finally {
      if (refreshInFlightRef.current?.id === requestId) {
        refreshInFlightRef.current = null;
        if (shouldShowLoading) {
          dispatchScreenLoading({ type: "finish", mode });
        }
        if (isModeSwitch && modeSwitchRef.current === mode) {
          modeSwitchRef.current = null;
        }
      }
    }
  }, [connected, connectionIssue, mode, paneId, requestScreen]);

  useEffect(() => {
    refreshScreen();
  }, [refreshScreen]);

  useEffect(() => {
    if (!connected) {
      refreshInFlightRef.current = null;
      modeSwitchRef.current = null;
      dispatchScreenLoading({ type: "reset" });
      if (!connectionIssue && !error) {
        setError(DISCONNECTED_MESSAGE);
      }
      return;
    }
    if (error === DISCONNECTED_MESSAGE) {
      setError(null);
    }
  }, [connected, connectionIssue, error]);

  useEffect(() => {
    if (!paneId || !connected) {
      return;
    }
    const intervalMs = mode === "image" ? 2000 : 1000;
    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      refreshScreen();
    }, intervalMs);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [connected, mode, paneId, refreshScreen]);

  useEffect(() => {
    modeLoadedRef.current = modeLoaded;
  }, [modeLoaded]);

  useEffect(() => {
    setModeLoaded({ text: false, image: false });
    dispatchScreenLoading({ type: "reset" });
    modeSwitchRef.current = null;
    screenRef.current = "";
    imageRef.current = null;
    cursorRef.current = null;
    screenLinesRef.current = [];
    setScreen("");
    setImageBase64(null);
  }, [paneId]);

  const handleModeChange = useCallback(
    (value: ScreenMode) => {
      if (value === mode) return;
      if (!connected) {
        modeSwitchRef.current = null;
        dispatchScreenLoading({ type: "reset" });
        setMode(value);
        return;
      }
      cursorRef.current = null;
      screenLinesRef.current = [];
      modeSwitchRef.current = value;
      dispatchScreenLoading({ type: "start", mode: value });
      setMode(value);
    },
    [connected, mode],
  );

  return {
    mode,
    screenLines,
    imageBase64,
    fallbackReason,
    error,
    setScreenError: setError,
    isScreenLoading,
    isAtBottom,
    handleAtBottomChange,
    forceFollow,
    refreshScreen,
    scrollToBottom,
    handleModeChange,
    virtuosoRef,
    scrollerRef,
  };
};

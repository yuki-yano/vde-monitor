import type { HighlightCorrectionConfig, ScreenResponse } from "@vde-monitor/shared";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { startTransition, useCallback, useEffect, useMemo, useRef } from "react";

import { renderAnsiLines } from "@/lib/ansi";
import {
  type ScreenMode,
  initialScreenLoadingState,
  screenLoadingReducer,
} from "@/lib/screen-loading";
import type { Theme } from "@/lib/theme";

import {
  screenErrorAtom,
  screenFallbackReasonAtom,
  screenImageAtom,
  screenLoadingAtom,
  screenModeAtom,
  screenTextAtom,
} from "../atoms/screenAtoms";
import { DISCONNECTED_MESSAGE } from "../sessionDetailUtils";
import { useScreenFetch } from "./useScreenFetch";
import { useScreenMode } from "./useScreenMode";
import { useScreenScroll } from "./useScreenScroll";
import { useScreenWrapMode } from "./useScreenWrapMode";

type UseSessionScreenParams = {
  paneId: string;
  connected: boolean;
  connectionIssue: string | null;
  resolvedTheme: Theme;
  sessionAgent: string | null;
  highlightCorrections: HighlightCorrectionConfig;
  requestScreen: (
    paneId: string,
    options: { lines?: number; mode?: "text" | "image"; cursor?: string },
  ) => Promise<ScreenResponse>;
};

export const useSessionScreen = ({
  paneId,
  connected,
  connectionIssue,
  resolvedTheme,
  sessionAgent,
  highlightCorrections,
  requestScreen,
}: UseSessionScreenParams) => {
  const [screenText, setScreen] = useAtom(screenTextAtom);
  const [imageBase64, setImageBase64] = useAtom(screenImageAtom);
  const [screenLoadingState, setScreenLoadingState] = useAtom(screenLoadingAtom);
  const setScreenFallbackReason = useSetAtom(screenFallbackReasonAtom);
  const setScreenError = useSetAtom(screenErrorAtom);
  const mode = useAtomValue(screenModeAtom);
  const { wrapMode, toggleWrapMode } = useScreenWrapMode();

  const isUserScrollingRef = useRef(false);
  const pendingScreenRef = useRef<string | null>(null);
  const screenRef = useRef<string>("");
  const imageRef = useRef<string | null>(null);
  const modeSwitchRef = useRef<ScreenMode | null>(null);
  const cursorRef = useRef<string | null>(null);
  const screenLinesRef = useRef<string[]>([]);

  const dispatchScreenLoading = useCallback(
    (event: Parameters<typeof screenLoadingReducer>[1]) => {
      setScreenLoadingState((prev) => screenLoadingReducer(prev, event));
    },
    [setScreenLoadingState],
  );

  const { modeLoaded, modeLoadedRef, handleModeChange, markModeLoaded } = useScreenMode({
    connected,
    paneId,
    dispatchScreenLoading,
    modeSwitchRef,
    cursorRef,
    screenLinesRef,
  });

  const flushPendingScreen = useCallback(() => {
    const pending = pendingScreenRef.current;
    if (pending == null) return;
    pendingScreenRef.current = null;
    startTransition(() => {
      setScreen(pending);
      setImageBase64(null);
    });
    screenRef.current = pending;
    imageRef.current = null;
  }, [setImageBase64, setScreen]);

  const clearPendingScreen = useCallback(() => {
    pendingScreenRef.current = null;
  }, []);

  const screenLines = useMemo(() => {
    if (mode !== "text") {
      return [];
    }
    const isTextLoading = screenLoadingState.loading && screenLoadingState.mode === "text";
    if (screenText.length === 0 && (isTextLoading || !modeLoaded.text)) {
      return [];
    }
    const agent = sessionAgent === "codex" || sessionAgent === "claude" ? sessionAgent : "unknown";
    return renderAnsiLines(screenText || "No screen data", resolvedTheme, {
      agent,
      highlightCorrections,
    });
  }, [
    highlightCorrections,
    mode,
    modeLoaded.text,
    resolvedTheme,
    screenLoadingState.loading,
    screenLoadingState.mode,
    screenText,
    sessionAgent,
  ]);

  const {
    isAtBottom,
    forceFollow,
    scrollToBottom,
    handleAtBottomChange,
    handleUserScrollStateChange,
    virtuosoRef,
    scrollerRef,
  } = useScreenScroll({
    paneId,
    mode,
    screenLinesLength: screenLines.length,
    isUserScrollingRef,
    onFlushPending: flushPendingScreen,
    onClearPending: clearPendingScreen,
  });

  const { refreshScreen, error, setError, fallbackReason, pollingPauseReason } = useScreenFetch({
    paneId,
    connected,
    connectionIssue,
    requestScreen,
    mode,
    isAtBottom,
    isUserScrollingRef,
    modeLoadedRef,
    modeSwitchRef,
    screenRef,
    imageRef,
    cursorRef,
    screenLinesRef,
    pendingScreenRef,
    setScreen,
    setImageBase64,
    dispatchScreenLoading,
    onModeLoaded: markModeLoaded,
  });

  const hasBlockingScreenError = error != null && error !== DISCONNECTED_MESSAGE;
  const isInitialModeLoading = !connectionIssue && !hasBlockingScreenError && !modeLoaded[mode];
  const isScreenLoading =
    (screenLoadingState.loading && screenLoadingState.mode === mode) || isInitialModeLoading;

  useEffect(() => {
    setScreenLoadingState(initialScreenLoadingState);
    modeSwitchRef.current = null;
    screenRef.current = "";
    imageRef.current = null;
    cursorRef.current = null;
    screenLinesRef.current = [];
    pendingScreenRef.current = null;
    setScreen("");
    setImageBase64(null);
    setScreenFallbackReason(null);
    setScreenError(null);
  }, [
    paneId,
    setImageBase64,
    setScreen,
    setScreenError,
    setScreenFallbackReason,
    setScreenLoadingState,
  ]);

  useEffect(() => {
    if (connected) {
      setScreenError(null);
      return;
    }
    setScreenError(connectionIssue ?? DISCONNECTED_MESSAGE);
  }, [connected, connectionIssue, setScreenError]);

  return {
    mode,
    wrapMode,
    screenLines,
    imageBase64,
    fallbackReason,
    error,
    pollingPauseReason,
    setScreenError: setError,
    isScreenLoading,
    isAtBottom,
    handleAtBottomChange,
    handleUserScrollStateChange,
    forceFollow,
    refreshScreen,
    scrollToBottom,
    handleModeChange,
    toggleWrapMode,
    virtuosoRef,
    scrollerRef,
  };
};

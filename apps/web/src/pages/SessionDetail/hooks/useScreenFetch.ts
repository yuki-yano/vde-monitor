import type { ScreenResponse } from "@vde-monitor/shared";
import { useAtom } from "jotai";
import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  startTransition,
  useCallback,
  useEffect,
  useRef,
} from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import { resolveUnknownErrorMessage } from "@/lib/api-utils";
import { applyScreenDeltas } from "@/lib/screen-delta";
import type { ScreenLoadingEvent, ScreenMode } from "@/lib/screen-loading";
import { resolveScreenPollIntervalMs } from "@/lib/screen-polling";
import { useVisibilityPolling } from "@/lib/use-visibility-polling";

import { screenErrorAtom, screenFallbackReasonAtom } from "../atoms/screenAtoms";
import { DISCONNECTED_MESSAGE } from "../sessionDetailUtils";
import {
  initialScreenFetchLifecycleState,
  type ScreenFetchLifecycleAction,
  type ScreenFetchLifecycleAttempt,
  screenFetchLifecycleReducer,
} from "./screen-fetch-lifecycle";
import { useScreenPollingPauseReason } from "./useScreenPollingPauseReason";

const normalizeScreenText = (text: string) => text.replace(/\r\n/g, "\n");

const shouldUseFullResponse = (response: ScreenResponse) =>
  response.full || response.screen != null || !response.deltas;

const buildScreenOptions = (mode: ScreenMode, cursor: string | null) => {
  const options: { mode: ScreenMode; cursor?: string } = { mode };
  if (mode === "text" && cursor) {
    options.cursor = cursor;
  }
  return options;
};

const shouldSuppressTextRender = (
  mode: ScreenMode,
  isAtBottom: boolean,
  isUserScrolling: boolean,
) => mode === "text" && !isAtBottom && isUserScrolling;

type UseScreenFetchParams = {
  paneId: string;
  connected: boolean;
  connectionIssue: string | null;
  requestScreen: (
    paneId: string,
    options: { lines?: number; mode?: "text" | "image"; cursor?: string },
  ) => Promise<ScreenResponse>;
  mode: ScreenMode;
  isAtBottom: boolean;
  isUserScrollingRef: MutableRefObject<boolean>;
  modeLoadedRef: MutableRefObject<{ text: boolean; image: boolean }>;
  modeSwitchRef: MutableRefObject<ScreenMode | null>;
  screenRef: MutableRefObject<string>;
  imageRef: MutableRefObject<string | null>;
  cursorRef: MutableRefObject<string | null>;
  screenLinesRef: MutableRefObject<string[]>;
  pendingScreenRef: MutableRefObject<string | null>;
  setScreen: Dispatch<SetStateAction<string>>;
  setImageBase64: Dispatch<SetStateAction<string | null>>;
  dispatchScreenLoading: Dispatch<ScreenLoadingEvent>;
  onModeLoaded: (mode: ScreenMode) => void;
};

export const useScreenFetch = ({
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
  onModeLoaded,
}: UseScreenFetchParams) => {
  const [fallbackReason, setFallbackReason] = useAtom(screenFallbackReasonAtom);
  const [error, setError] = useAtom(screenErrorAtom);
  const pollingPauseReason = useScreenPollingPauseReason({
    connected,
    connectionIssue,
  });
  const refreshLifecycleRef = useRef(initialScreenFetchLifecycleState);
  const applyRefreshLifecycleAction = useCallback((action: ScreenFetchLifecycleAction) => {
    refreshLifecycleRef.current = screenFetchLifecycleReducer(refreshLifecycleRef.current, action);
    return refreshLifecycleRef.current;
  }, []);

  const canPollScreen = useCallback(
    () => connectionIssue !== API_ERROR_MESSAGES.unauthorized,
    [connectionIssue],
  );

  const updateImageScreen = useCallback(
    (nextImage: string | null) => {
      if (imageRef.current !== nextImage || screenRef.current !== "") {
        startTransition(() => {
          setImageBase64(nextImage);
          setScreen("");
        });
        imageRef.current = nextImage;
        screenRef.current = "";
        pendingScreenRef.current = null;
      }
    },
    [imageRef, pendingScreenRef, screenRef, setImageBase64, setScreen],
  );

  const updateTextScreen = useCallback(
    (
      nextScreen: string,
      nextLines: string[],
      nextCursor: string | null,
      suppressRender: boolean,
    ) => {
      screenLinesRef.current = nextLines;
      cursorRef.current = nextCursor;
      if (suppressRender) {
        pendingScreenRef.current = nextScreen;
        return;
      }
      if (screenRef.current !== nextScreen || imageRef.current != null) {
        startTransition(() => {
          setScreen(nextScreen);
          setImageBase64(null);
        });
        screenRef.current = nextScreen;
        imageRef.current = null;
        pendingScreenRef.current = null;
      }
    },
    [cursorRef, imageRef, pendingScreenRef, screenLinesRef, screenRef, setImageBase64, setScreen],
  );

  const applyTextResponse = useCallback(
    (response: ScreenResponse, suppressRender: boolean) => {
      const nextCursor = response.cursor ?? null;
      if (shouldUseFullResponse(response)) {
        const nextScreen = response.screen ?? "";
        const nextLines = normalizeScreenText(nextScreen).split("\n");
        updateTextScreen(nextScreen, nextLines, nextCursor, suppressRender);
        return;
      }
      const applied = applyScreenDeltas(screenLinesRef.current, response.deltas ?? []);
      if (!applied.ok) {
        cursorRef.current = null;
        return;
      }
      const nextLines = applied.lines;
      const nextScreen = nextLines.join("\n");
      updateTextScreen(nextScreen, nextLines, nextCursor, suppressRender);
    },
    [cursorRef, screenLinesRef, updateTextScreen],
  );

  const resetDisconnectedState = useCallback(
    (skipWhenErrorPresent: boolean) => {
      applyRefreshLifecycleAction({ type: "reset" });
      modeSwitchRef.current = null;
      dispatchScreenLoading({ type: "reset" });
      const shouldSetDisconnectedError = !connectionIssue && (!skipWhenErrorPresent || !error);
      if (shouldSetDisconnectedError) {
        setError(DISCONNECTED_MESSAGE);
      }
    },
    [
      applyRefreshLifecycleAction,
      connectionIssue,
      dispatchScreenLoading,
      error,
      modeSwitchRef,
      setError,
    ],
  );

  const beginRefreshAttempt = useCallback((): ScreenFetchLifecycleAttempt | null => {
    const nextLifecycle = applyRefreshLifecycleAction({
      type: "request",
      mode,
      modeSwitch: modeSwitchRef.current,
      modeLoaded: modeLoadedRef.current,
    });
    const attempt = nextLifecycle.latestAttempt;
    if (!attempt) {
      return null;
    }
    setError(null);
    if (attempt.shouldShowLoading) {
      dispatchScreenLoading({ type: "start", mode });
    }
    return attempt;
  }, [
    applyRefreshLifecycleAction,
    dispatchScreenLoading,
    mode,
    modeLoadedRef,
    modeSwitchRef,
    setError,
  ]);

  const applyRefreshResponse = useCallback(
    (response: ScreenResponse, suppressRender: boolean) => {
      if (!response.ok) {
        setError(response.error?.message ?? API_ERROR_MESSAGES.screenCapture);
        return;
      }
      setFallbackReason(response.fallbackReason ?? null);
      if (response.mode === "image") {
        updateImageScreen(response.imageBase64 ?? null);
      } else {
        applyTextResponse(response, suppressRender);
      }
      onModeLoaded(mode);
    },
    [applyTextResponse, mode, onModeLoaded, setError, setFallbackReason, updateImageScreen],
  );

  const finishRefreshAttempt = useCallback(
    (attempt: ScreenFetchLifecycleAttempt) => {
      if (refreshLifecycleRef.current.inFlight?.id !== attempt.requestId) {
        return;
      }
      applyRefreshLifecycleAction({ type: "finish", requestId: attempt.requestId });
      if (attempt.shouldShowLoading) {
        dispatchScreenLoading({ type: "finish", mode });
      }
      if (attempt.isModeSwitch && modeSwitchRef.current === mode) {
        modeSwitchRef.current = null;
      }
    },
    [applyRefreshLifecycleAction, dispatchScreenLoading, mode, modeSwitchRef],
  );

  const refreshScreen = useCallback(async () => {
    if (!paneId) return;
    if (!connected) {
      resetDisconnectedState(false);
      return;
    }
    const attempt = beginRefreshAttempt();
    if (!attempt) {
      return;
    }
    try {
      const response = await requestScreen(paneId, buildScreenOptions(mode, cursorRef.current));
      if (refreshLifecycleRef.current.inFlight?.id !== attempt.requestId) {
        return;
      }
      const suppressRender = shouldSuppressTextRender(mode, isAtBottom, isUserScrollingRef.current);
      applyRefreshResponse(response, suppressRender);
    } catch (err) {
      setError(resolveUnknownErrorMessage(err, API_ERROR_MESSAGES.screenRequestFailed));
    } finally {
      finishRefreshAttempt(attempt);
    }
  }, [
    applyRefreshResponse,
    beginRefreshAttempt,
    connected,
    cursorRef,
    finishRefreshAttempt,
    isAtBottom,
    isUserScrollingRef,
    mode,
    paneId,
    requestScreen,
    resetDisconnectedState,
    setError,
  ]);
  const pollScreen = useCallback(() => {
    void refreshScreen();
  }, [refreshScreen]);

  useEffect(() => {
    refreshScreen();
  }, [refreshScreen]);

  useEffect(() => {
    if (!connected) {
      resetDisconnectedState(true);
      return;
    }
    if (error === DISCONNECTED_MESSAGE) {
      setError(null);
    }
  }, [connected, error, resetDisconnectedState, setError]);

  useVisibilityPolling({
    enabled: Boolean(paneId) && connected,
    intervalMs: resolveScreenPollIntervalMs(mode),
    shouldPoll: canPollScreen,
    onTick: pollScreen,
    onResume: pollScreen,
  });

  return {
    refreshScreen,
    error,
    setError,
    fallbackReason,
    pollingPauseReason,
  };
};

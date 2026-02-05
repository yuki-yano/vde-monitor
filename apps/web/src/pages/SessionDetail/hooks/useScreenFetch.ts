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
import { applyScreenDeltas } from "@/lib/screen-delta";
import type { ScreenLoadingEvent, ScreenMode } from "@/lib/screen-loading";
import { useRestoreTrigger } from "@/lib/use-restore-trigger";

import { screenErrorAtom, screenFallbackReasonAtom } from "../atoms/screenAtoms";
import { DISCONNECTED_MESSAGE } from "../sessionDetailUtils";

const normalizeScreenText = (text: string) => text.replace(/\r\n/g, "\n");

const shouldUseFullResponse = (response: ScreenResponse) =>
  response.full || response.screen !== undefined || !response.deltas;

const buildScreenOptions = (mode: ScreenMode, cursor: string | null) => {
  const options: { mode: ScreenMode; cursor?: string } = { mode };
  if (mode === "text" && cursor) {
    options.cursor = cursor;
  }
  return options;
};

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
  const refreshInFlightRef = useRef<null | { id: number; mode: ScreenMode }>(null);
  const refreshRequestIdRef = useRef(0);

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
      if (screenRef.current !== nextScreen || imageRef.current !== null) {
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
      const response = await requestScreen(paneId, buildScreenOptions(mode, cursorRef.current));
      if (refreshInFlightRef.current?.id !== requestId) {
        return;
      }
      if (!response.ok) {
        setError(response.error?.message ?? API_ERROR_MESSAGES.screenCapture);
        return;
      }
      setFallbackReason(response.fallbackReason ?? null);
      const suppressRender = mode === "text" && !isAtBottom && isUserScrollingRef.current;
      if (response.mode === "image") {
        updateImageScreen(response.imageBase64 ?? null);
      } else {
        applyTextResponse(response, suppressRender);
      }
      onModeLoaded(mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : API_ERROR_MESSAGES.screenRequestFailed);
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
  }, [
    applyTextResponse,
    connected,
    connectionIssue,
    cursorRef,
    dispatchScreenLoading,
    isAtBottom,
    isUserScrollingRef,
    mode,
    modeLoadedRef,
    modeSwitchRef,
    onModeLoaded,
    paneId,
    requestScreen,
    setError,
    setFallbackReason,
    updateImageScreen,
  ]);

  useEffect(() => {
    refreshScreen();
  }, [refreshScreen]);

  useRestoreTrigger(() => {
    if (!paneId || !connected) {
      return;
    }
    if (connectionIssue === API_ERROR_MESSAGES.unauthorized) {
      return;
    }
    void refreshScreen();
  });

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
  }, [connected, connectionIssue, dispatchScreenLoading, error, modeSwitchRef, setError]);

  useEffect(() => {
    if (!paneId || !connected) {
      return;
    }
    const intervalMs = mode === "image" ? 2000 : 1000;
    let intervalId: number | null = null;
    const canPoll = () => {
      if (document.hidden) return false;
      if (connectionIssue === API_ERROR_MESSAGES.unauthorized) return false;
      if (navigator.onLine === false) return false;
      return true;
    };
    const stop = () => {
      if (intervalId === null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    };
    const start = () => {
      if (intervalId !== null) return;
      intervalId = window.setInterval(() => {
        if (!canPoll()) {
          stop();
          return;
        }
        refreshScreen();
      }, intervalMs);
    };
    const handleResume = () => {
      if (!canPoll()) {
        stop();
        return;
      }
      refreshScreen();
      start();
    };

    if (canPoll()) {
      start();
    }

    window.addEventListener("visibilitychange", handleResume);
    window.addEventListener("online", handleResume);
    window.addEventListener("focus", handleResume);
    window.addEventListener("offline", stop);

    return () => {
      stop();
      window.removeEventListener("visibilitychange", handleResume);
      window.removeEventListener("online", handleResume);
      window.removeEventListener("focus", handleResume);
      window.removeEventListener("offline", stop);
    };
  }, [connected, connectionIssue, mode, paneId, refreshScreen]);

  return {
    refreshScreen,
    error,
    setError,
    fallbackReason,
  };
};

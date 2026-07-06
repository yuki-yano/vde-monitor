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
  type ScreenFetchLifecycleAction,
  type ScreenFetchLifecycleAttempt,
  initialScreenFetchLifecycleState,
  screenFetchLifecycleReducer,
} from "./screen-fetch-lifecycle";
import { useScreenPollingPauseReason } from "./useScreenPollingPauseReason";
import { useScreenStream } from "./useScreenStream";

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

// Suppress renders while the user is actively scrolling (any axis, even at the
// bottom): committing screen updates mid-gesture triggers stick-to-bottom
// scrolls that cancel scroll momentum and clamp horizontal position.
// Pending screens are flushed when the user-scroll state ends.
const shouldSuppressTextRender = (mode: ScreenMode, isUserScrolling: boolean) =>
  mode === "text" && isUserScrolling;

type UseScreenFetchParams = {
  paneId: string;
  connected: boolean;
  connectionIssue: string | null;
  requestScreen: (
    paneId: string,
    options: { lines?: number; mode?: "text" | "image"; cursor?: string },
  ) => Promise<ScreenResponse>;
  mode: ScreenMode;
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
  /** Base path for API calls (e.g. "/api" or "https://host/api"). Defaults to "/api". */
  apiBasePath?: string;
  /** Bearer token for SSE authentication. SSE is disabled when null. */
  token?: string | null;
};

type CommitTextScreenRefsParams = {
  nextScreen: string;
  nextLines: string[];
  nextCursor: string | null;
  pendingScreen: string | null;
  screenLinesRef: MutableRefObject<string[]>;
  cursorRef: MutableRefObject<string | null>;
  screenRef: MutableRefObject<string>;
  imageRef: MutableRefObject<string | null>;
  pendingScreenRef: MutableRefObject<string | null>;
};

const commitTextScreenRefs = ({
  nextScreen,
  nextLines,
  nextCursor,
  pendingScreen,
  screenLinesRef,
  cursorRef,
  screenRef,
  imageRef,
  pendingScreenRef,
}: CommitTextScreenRefsParams) => {
  screenLinesRef.current = nextLines;
  cursorRef.current = nextCursor;
  pendingScreenRef.current = pendingScreen;
  if (pendingScreen == null) {
    screenRef.current = nextScreen;
    imageRef.current = null;
  }
};

export const useScreenFetch = ({
  paneId,
  connected,
  connectionIssue,
  requestScreen,
  mode,
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
  apiBasePath = "/api",
  token = null,
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
    (nextImage: string | null, immediateCommit: boolean) => {
      if (imageRef.current !== nextImage || screenRef.current !== "") {
        if (immediateCommit) {
          setImageBase64(nextImage);
          setScreen("");
        } else {
          startTransition(() => {
            setImageBase64(nextImage);
            setScreen("");
          });
        }
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
      immediateCommit: boolean,
    ) => {
      if (suppressRender) {
        commitTextScreenRefs({
          nextScreen,
          nextLines,
          nextCursor,
          pendingScreen: nextScreen,
          // react-doctor-disable-next-line no-event-handler
          screenLinesRef,
          // react-doctor-disable-next-line no-event-handler
          cursorRef,
          // react-doctor-disable-next-line no-event-handler
          screenRef,
          // react-doctor-disable-next-line no-event-handler
          imageRef,
          // react-doctor-disable-next-line no-event-handler
          pendingScreenRef,
        });
        return;
      }
      const shouldCommitScreen = screenRef.current !== nextScreen || imageRef.current != null;
      commitTextScreenRefs({
        nextScreen,
        nextLines,
        nextCursor,
        pendingScreen: null,
        screenLinesRef,
        cursorRef,
        screenRef,
        imageRef,
        pendingScreenRef,
      });
      if (shouldCommitScreen) {
        const commitScreenState = () => {
          // react-doctor-disable-next-line no-event-handler
          setScreen(nextScreen);
          // react-doctor-disable-next-line no-event-handler
          setImageBase64(null);
        };
        if (immediateCommit) {
          commitScreenState();
        } else {
          startTransition(commitScreenState);
        }
      }
    },
    [cursorRef, imageRef, pendingScreenRef, screenLinesRef, screenRef, setImageBase64, setScreen],
  );

  const applyTextResponse = useCallback(
    (response: ScreenResponse, suppressRender: boolean, immediateCommit: boolean) => {
      const nextCursor = response.cursor ?? null;
      if (shouldUseFullResponse(response)) {
        const nextScreen = response.screen ?? "";
        const nextLines = normalizeScreenText(nextScreen).split("\n");
        updateTextScreen(nextScreen, nextLines, nextCursor, suppressRender, immediateCommit);
        return;
      }
      const applied = applyScreenDeltas(screenLinesRef.current, response.deltas ?? []);
      if (!applied.ok) {
        cursorRef.current = null;
        return;
      }
      const nextLines = applied.lines;
      const nextScreen = nextLines.join("\n");
      updateTextScreen(nextScreen, nextLines, nextCursor, suppressRender, immediateCommit);
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
    const hasCurrentData =
      mode === "image" ? imageRef.current != null : screenRef.current.length > 0;
    const nextLifecycle = applyRefreshLifecycleAction({
      type: "request",
      mode,
      modeSwitch: modeSwitchRef.current,
      modeLoaded: modeLoadedRef.current,
      hasCurrentData,
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
    imageRef,
    mode,
    modeLoadedRef,
    modeSwitchRef,
    screenRef,
    setError,
  ]);

  const applyRefreshResponse = useCallback(
    (response: ScreenResponse, suppressRender: boolean, immediateCommit: boolean) => {
      if (!response.ok) {
        setError(response.error?.message ?? API_ERROR_MESSAGES.screenCapture);
        return;
      }
      setFallbackReason(response.fallbackReason ?? null);
      if (response.mode === "image") {
        updateImageScreen(response.imageBase64 ?? null, immediateCommit);
      } else {
        applyTextResponse(response, suppressRender, immediateCommit);
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
      const suppressRender = shouldSuppressTextRender(mode, isUserScrollingRef.current);
      applyRefreshResponse(response, suppressRender, attempt.shouldShowLoading);
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

  // SSE screen event handler — applies text response without going through the
  // REST lifecycle (no in-flight tracking needed for push events).
  const handleSseScreenEvent = useCallback(
    (response: ScreenResponse) => {
      if (!response.ok) return;
      setError(null);
      setFallbackReason(response.fallbackReason ?? null);
      // react-doctor-disable-next-line no-event-handler
      const suppressRender = shouldSuppressTextRender(mode, isUserScrollingRef.current);
      applyTextResponse(response, suppressRender, false);
      // react-doctor-disable-next-line no-event-handler
      onModeLoaded(mode);
    },
    [applyTextResponse, isUserScrollingRef, mode, onModeLoaded, setError, setFallbackReason],
  );

  const { transport } = useScreenStream({
    // react-doctor-disable-next-line no-event-handler
    enabled: mode === "text" && connected,
    // react-doctor-disable-next-line no-event-handler
    paneId,
    // react-doctor-disable-next-line no-event-handler
    apiBasePath,
    // react-doctor-disable-next-line no-event-handler
    token,
    onScreenEvent: handleSseScreenEvent,
  });

  // When SSE transitions back to polling (close/reconnect), reset the cursor so
  // the next REST request fetches a full response rather than a stale delta.
  const prevTransportRef = useRef<"sse" | "polling">("polling");
  useEffect(() => {
    const prev = prevTransportRef.current;
    prevTransportRef.current = transport;
    if (prev === "sse" && transport === "polling") {
      cursorRef.current = null;
    }
  }, [cursorRef, transport]);

  // False positive: initial and parameter-change screen loads are lifecycle IO,
  // not render-time data flowing back to the parent.
  useEffect(() => {
    // react-doctor-disable-next-line no-pass-data-to-parent
    refreshScreen();
  }, [refreshScreen]);

  // False positive: this reconciles connection lifecycle state owned by the
  // screen hook when the shared connection status changes.
  useEffect(() => {
    // react-doctor-disable-next-line no-event-handler, no-pass-data-to-parent
    if (!connected) {
      // react-doctor-disable-next-line no-pass-data-to-parent
      resetDisconnectedState(true);
      return;
    }
    if (error === DISCONNECTED_MESSAGE) {
      setError(null);
    }
  }, [connected, error, resetDisconnectedState, setError]);

  // Suspend REST polling while SSE is actively streaming text updates;
  // image mode always uses polling (SSE is text-only).
  useVisibilityPolling({
    enabled: Boolean(paneId) && connected && transport !== "sse",
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
    transport,
  };
};

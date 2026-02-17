import { useDocumentVisibility, useNetwork, useWindowEvent } from "@mantine/hooks";
import { useCallback, useEffect, useRef } from "react";

type UseVisibilityPollingParams = {
  enabled: boolean;
  intervalMs: number;
  onTick: () => void;
  onResume?: () => void;
  shouldPoll?: () => boolean;
};

export const useVisibilityPolling = ({
  enabled,
  intervalMs,
  onTick,
  onResume,
  shouldPoll,
}: UseVisibilityPollingParams) => {
  const onTickRef = useRef(onTick);
  const onResumeRef = useRef(onResume);
  const shouldPollRef = useRef(shouldPoll);
  const intervalIdRef = useRef<number | null>(null);
  const visibilityState = useDocumentVisibility();
  const { online } = useNetwork();

  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  useEffect(() => {
    onResumeRef.current = onResume;
  }, [onResume]);

  useEffect(() => {
    shouldPollRef.current = shouldPoll;
  }, [shouldPoll]);

  const canPoll = useCallback(() => {
    const hidden =
      typeof document !== "undefined" ? document.hidden : visibilityState !== "visible";
    if (hidden) return false;
    const offline =
      (typeof navigator !== "undefined" ? navigator.onLine === false : online === false) ||
      online === false;
    if (offline) return false;
    const shouldPollNow = shouldPollRef.current;
    if (shouldPollNow && !shouldPollNow()) return false;
    return true;
  }, [online, visibilityState]);

  const stop = useCallback(() => {
    if (intervalIdRef.current == null) {
      return;
    }
    window.clearInterval(intervalIdRef.current);
    intervalIdRef.current = null;
  }, []);

  const start = useCallback(() => {
    if (!enabled || intervalIdRef.current != null) {
      return;
    }
    intervalIdRef.current = window.setInterval(() => {
      if (!canPoll()) {
        stop();
        return;
      }
      onTickRef.current();
    }, intervalMs);
  }, [canPoll, enabled, intervalMs, stop]);

  const handleResume = useCallback(() => {
    if (!enabled) {
      stop();
      return;
    }
    if (!canPoll()) {
      stop();
      return;
    }
    onResumeRef.current?.();
    start();
  }, [canPoll, enabled, start, stop]);

  const handlePageShow = useCallback(
    (event: PageTransitionEvent) => {
      if (!event.persisted && document.visibilityState !== "visible") {
        return;
      }
      handleResume();
    },
    [handleResume],
  );

  useWindowEvent("online", handleResume);
  useWindowEvent("focus", handleResume);
  useWindowEvent("pageshow", handlePageShow);
  useWindowEvent("offline", stop);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.addEventListener("visibilitychange", handleResume);
    return () => {
      document.removeEventListener("visibilitychange", handleResume);
    };
  }, [handleResume]);

  useEffect(() => {
    stop();
    if (!enabled) {
      return;
    }
    if (canPoll()) {
      start();
    }
  }, [canPoll, enabled, intervalMs, shouldPoll, start, stop]);

  useEffect(() => stop, [stop]);
};

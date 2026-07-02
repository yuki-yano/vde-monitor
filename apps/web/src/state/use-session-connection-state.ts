import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";

import type { RefreshSessionsResult } from "./use-session-api";
import type { SessionsStreamTransport } from "./use-sessions-stream";

const RATE_LIMIT_BACKOFF_STEP_MS = 5000;
const MAX_RATE_LIMIT_STEPS = 3;

type ConnectionStatus = "healthy" | "degraded" | "disconnected";

export const useSessionConnectionState = (token: string | null) => {
  const [connectionIssue, setConnectionIssue] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [authBlocked, setAuthBlocked] = useState(false);
  const [pollBackoffMs, setPollBackoffMs] = useState(0);
  const [transport, setTransport] = useState<SessionsStreamTransport>("polling");
  const backoffStepRef = useRef(0);
  const hasToken = Boolean(token);

  const applyRateLimitBackoff = useCallback(() => {
    const nextStep = Math.min(backoffStepRef.current + 1, MAX_RATE_LIMIT_STEPS);
    if (nextStep === backoffStepRef.current) {
      return;
    }
    backoffStepRef.current = nextStep;
    setPollBackoffMs(nextStep * RATE_LIMIT_BACKOFF_STEP_MS);
  }, []);

  const resetRateLimitBackoff = useCallback(() => {
    if (backoffStepRef.current === 0) {
      return;
    }
    backoffStepRef.current = 0;
    setPollBackoffMs(0);
  }, []);

  const connectionStatus = useMemo<ConnectionStatus>(() => {
    if (!hasToken || authBlocked) {
      return "disconnected";
    }
    if (connected) {
      return pollBackoffMs > 0 ? "degraded" : "healthy";
    }
    return "degraded";
  }, [authBlocked, connected, hasToken, pollBackoffMs]);

  const handleRefreshResult = useCallback(
    (result: RefreshSessionsResult) => {
      if (!result.ok) {
        if (result.authError) {
          setAuthBlocked(true);
        }
        if (result.rateLimited) {
          applyRateLimitBackoff();
          setConnected(true);
        } else {
          setConnected(false);
        }
        return;
      }
      if (authBlocked) {
        setAuthBlocked(false);
      }
      setConnected(true);
      resetRateLimitBackoff();
    },
    [applyRateLimitBackoff, authBlocked, resetRateLimitBackoff],
  );

  const reconnect = useCallback(
    (refreshSessions: () => Promise<void>) => {
      if (!token) {
        return;
      }
      setAuthBlocked(false);
      setConnectionIssue("Reconnecting...");
      void refreshSessions();
    },
    [token],
  );

  useEffect(() => {
    if (connectionIssue === API_ERROR_MESSAGES.unauthorized) {
      setAuthBlocked(true);
      setConnected(false);
    }
  }, [connectionIssue]);

  useEffect(() => {
    setAuthBlocked(false);
    resetRateLimitBackoff();
    setConnectionIssue(null);
    setConnected(false);
  }, [resetRateLimitBackoff, token]);

  // When SSE is open, mark as connected regardless of polling state. When it
  // falls back to polling the connection is unknown until the next refresh
  // resolves, so drop the stale connected flag instead of reporting healthy.
  useEffect(() => {
    setConnected(transport === "sse");
  }, [transport]);

  return {
    connectionIssue,
    setConnectionIssue,
    connected,
    authBlocked,
    pollBackoffMs,
    connectionStatus,
    transport,
    setTransport,
    handleRefreshResult,
    reconnect,
  };
};

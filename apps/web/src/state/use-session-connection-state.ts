import { useCallback, useMemo, useReducer, useRef } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";

import type { RefreshSessionsResult } from "./use-session-api";
import type { SessionsStreamTransport } from "./use-sessions-stream";

const RATE_LIMIT_BACKOFF_STEP_MS = 5000;
const MAX_RATE_LIMIT_STEPS = 3;

type ConnectionStatus = "healthy" | "degraded" | "disconnected";

type SessionConnectionState = {
  token: string | null;
  connectionIssue: string | null;
  connected: boolean;
  authBlocked: boolean;
  pollBackoffMs: number;
  transport: SessionsStreamTransport;
};

type SessionConnectionAction =
  | { type: "setConnectionIssue"; token: string | null; issue: string | null }
  | {
      type: "refreshFailure";
      token: string | null;
      authError: boolean;
      rateLimited: boolean;
      pollBackoffMs?: number;
    }
  | { type: "refreshSuccess"; token: string | null }
  | { type: "reconnect"; token: string | null }
  | { type: "setTransport"; token: string | null; transport: SessionsStreamTransport };

const buildConnectionState = (token: string | null): SessionConnectionState => ({
  token,
  connectionIssue: null,
  connected: false,
  authBlocked: false,
  pollBackoffMs: 0,
  transport: "polling",
});

const normalizeConnectionState = (
  state: SessionConnectionState,
  token: string | null,
): SessionConnectionState => (state.token === token ? state : buildConnectionState(token));

const sessionConnectionReducer = (
  state: SessionConnectionState,
  action: SessionConnectionAction,
): SessionConnectionState => {
  state = normalizeConnectionState(state, action.token);
  switch (action.type) {
    case "setConnectionIssue":
      return {
        ...state,
        connectionIssue: action.issue,
        authBlocked: action.issue === API_ERROR_MESSAGES.unauthorized ? true : state.authBlocked,
        connected: action.issue === API_ERROR_MESSAGES.unauthorized ? false : state.connected,
      };
    case "refreshFailure":
      return {
        ...state,
        authBlocked: action.authError ? true : state.authBlocked,
        connected: action.rateLimited,
        pollBackoffMs: action.pollBackoffMs ?? state.pollBackoffMs,
      };
    case "refreshSuccess":
      return {
        ...state,
        authBlocked: false,
        connected: true,
        pollBackoffMs: 0,
      };
    case "reconnect":
      return {
        ...state,
        authBlocked: false,
        connectionIssue: "Reconnecting...",
      };
    case "setTransport":
      return {
        ...state,
        transport: action.transport,
        connected: action.transport === "sse",
      };
  }
};

export const useSessionConnectionState = (token: string | null) => {
  const [state, dispatch] = useReducer(sessionConnectionReducer, token, buildConnectionState);
  const visibleState = normalizeConnectionState(state, token);
  const activeTokenRef = useRef(token);
  const backoffStepRef = useRef(0);
  if (activeTokenRef.current !== token) {
    activeTokenRef.current = token;
    backoffStepRef.current = 0;
  }
  const hasToken = Boolean(token);
  const { connectionIssue, connected, authBlocked, pollBackoffMs, transport } = visibleState;

  const applyRateLimitBackoff = useCallback(() => {
    const nextStep = Math.min(backoffStepRef.current + 1, MAX_RATE_LIMIT_STEPS);
    if (nextStep === backoffStepRef.current) {
      return;
    }
    backoffStepRef.current = nextStep;
    dispatch({
      type: "refreshFailure",
      token,
      authError: false,
      rateLimited: true,
      pollBackoffMs: nextStep * RATE_LIMIT_BACKOFF_STEP_MS,
    });
  }, [token]);

  const resetRateLimitBackoff = useCallback(() => {
    if (backoffStepRef.current === 0) {
      return;
    }
    backoffStepRef.current = 0;
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
        if (result.rateLimited) {
          applyRateLimitBackoff();
        } else {
          dispatch({
            type: "refreshFailure",
            token,
            authError: result.authError === true,
            rateLimited: false,
          });
        }
        return;
      }
      resetRateLimitBackoff();
      dispatch({ type: "refreshSuccess", token });
    },
    [applyRateLimitBackoff, resetRateLimitBackoff, token],
  );

  const reconnect = useCallback(
    (refreshSessions: () => Promise<void>) => {
      if (!token) {
        return;
      }
      dispatch({ type: "reconnect", token });
      void refreshSessions();
    },
    [token],
  );

  const setConnectionIssue = useCallback(
    (issue: string | null) => {
      dispatch({ type: "setConnectionIssue", token, issue });
    },
    [token],
  );

  const setTransport = useCallback(
    (nextTransport: SessionsStreamTransport) => {
      dispatch({ type: "setTransport", token, transport: nextTransport });
    },
    [token],
  );

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

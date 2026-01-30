import type {
  CommandResponse,
  ScreenResponse,
  SessionDetail,
  SessionSummary,
  WsServerMessage,
} from "@agent-monitor/shared";
import React from "react";

type SessionContextValue = {
  token: string | null;
  sessions: SessionSummary[];
  connected: boolean;
  readOnly: boolean;
  refreshSessions: () => Promise<void>;
  requestScreen: (
    paneId: string,
    options: { lines?: number; mode?: "text" | "image" },
  ) => Promise<ScreenResponse>;
  sendText: (paneId: string, text: string, enter?: boolean) => Promise<CommandResponse>;
  sendKeys: (paneId: string, keys: string[]) => Promise<CommandResponse>;
  getSessionDetail: (paneId: string) => SessionDetail | null;
};

const SessionContext = React.createContext<SessionContextValue | null>(null);

const TOKEN_KEY = "agent-monitor-token";

const readTokenFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    params.delete("token");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
    window.history.replaceState({}, "", next);
  }
  return token;
};

const buildWsUrl = (token: string) => {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/ws?token=${token}`;
};

const createReqId = () =>
  typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `req_${Math.random().toString(16).slice(2)}`;

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = React.useState<string | null>(() => {
    return localStorage.getItem(TOKEN_KEY);
  });
  const [sessions, setSessions] = React.useState<SessionSummary[]>([]);
  const [connected, setConnected] = React.useState(false);
  const [readOnly, setReadOnly] = React.useState(false);
  const wsRef = React.useRef<WebSocket | null>(null);
  const ensureServerReadyRef = React.useRef<() => void>(() => {});
  const readyRef = React.useRef(false);
  const connectingRef = React.useRef(false);
  const readyAttemptRef = React.useRef(0);
  const readyTimerRef = React.useRef<number | null>(null);
  const pending = React.useRef(
    new Map<
      string,
      {
        resolve: (value: ScreenResponse | CommandResponse) => void;
        reject: (error: Error) => void;
      }
    >(),
  );
  const reconnectAttempt = React.useRef(0);

  React.useEffect(() => {
    const urlToken = readTokenFromUrl();
    if (urlToken && urlToken !== token) {
      setToken(urlToken);
    }
  }, [token]);

  const refreshSessions = React.useCallback(async () => {
    if (!token) return;
    const res = await fetch("/api/sessions", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return;
    }
    const data = (await res.json()) as { sessions: SessionSummary[] };
    setSessions(data.sessions);
  }, [token]);

  const updateSession = React.useCallback((session: SessionSummary) => {
    setSessions((prev) => {
      const index = prev.findIndex((item) => item.paneId === session.paneId);
      if (index === -1) {
        return [...prev, session];
      }
      const next = [...prev];
      next[index] = session;
      return next;
    });
  }, []);

  const removeSession = React.useCallback((paneId: string) => {
    setSessions((prev) => prev.filter((item) => item.paneId !== paneId));
  }, []);

  const handleWsMessage = React.useCallback(
    (message: WsServerMessage) => {
      if (message.type === "sessions.snapshot") {
        setSessions(message.data.sessions);
        return;
      }
      if (message.type === "session.updated") {
        updateSession(message.data.session);
        return;
      }
      if (message.type === "session.removed") {
        removeSession(message.data.paneId);
        return;
      }
      if (message.type === "command.response" || message.type === "screen.response") {
        if (message.reqId && pending.current.has(message.reqId)) {
          const handler = pending.current.get(message.reqId)!;
          pending.current.delete(message.reqId);
          if ("error" in message.data && message.data.error?.code === "READ_ONLY") {
            setReadOnly(true);
          }
          handler.resolve(message.data);
        }
      }
    },
    [removeSession, updateSession],
  );

  const connectWs = React.useCallback(() => {
    if (!token) return;
    if (connectingRef.current) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
    connectingRef.current = true;
    const ws = new WebSocket(buildWsUrl(token));
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      setConnected(true);
      reconnectAttempt.current = 0;
      connectingRef.current = false;
    });

    ws.addEventListener("close", () => {
      setConnected(false);
      connectingRef.current = false;
      readyRef.current = false;
      pending.current.forEach(({ reject }) => {
        reject(new Error("WebSocket disconnected"));
      });
      pending.current.clear();
      const attempt = reconnectAttempt.current + 1;
      reconnectAttempt.current = attempt;
      const delay = Math.min(10000, 500 * 2 ** attempt + Math.random() * 300);
      window.setTimeout(() => {
        ensureServerReadyRef.current();
      }, delay);
    });

    ws.addEventListener("message", (event) => {
      try {
        const parsed = JSON.parse(event.data) as WsServerMessage;
        handleWsMessage(parsed);
      } catch {
        // ignore invalid messages
      }
    });
  }, [handleWsMessage, token]);

  const ensureServerReady = React.useCallback(async () => {
    if (!token) return;
    if (readyRef.current) {
      connectWs();
      return;
    }
    const attempt = readyAttemptRef.current + 1;
    readyAttemptRef.current = attempt;
    try {
      const res = await fetch("/api/sessions", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok || res.status === 401 || res.status === 403) {
        readyRef.current = true;
        readyAttemptRef.current = 0;
        await refreshSessions();
        connectWs();
        return;
      }
    } catch {
      // ignore
    }
    const delay = Math.min(5000, 300 * 2 ** attempt + Math.random() * 200);
    readyTimerRef.current = window.setTimeout(() => {
      ensureServerReady();
    }, delay);
  }, [connectWs, refreshSessions, token]);

  React.useEffect(() => {
    ensureServerReadyRef.current = ensureServerReady;
  }, [ensureServerReady]);

  React.useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        ensureServerReady();
      }
    };
    const handleFocus = () => {
      ensureServerReady();
    };
    const handleOnline = () => {
      ensureServerReady();
    };

    window.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
    };
  }, [ensureServerReady]);

  React.useEffect(() => {
    if (!token) return;
    readyRef.current = false;
    ensureServerReady();
    return () => {
      if (readyTimerRef.current !== null) {
        window.clearTimeout(readyTimerRef.current);
        readyTimerRef.current = null;
      }
      wsRef.current?.close();
    };
  }, [ensureServerReady, token]);

  const sendWs = React.useCallback((payload: Record<string, unknown>) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }
    wsRef.current.send(JSON.stringify(payload));
  }, []);

  const sendRequest = React.useCallback(
    (payload: Record<string, unknown>) => {
      const reqId = createReqId();
      return new Promise<ScreenResponse | CommandResponse>((resolve, reject) => {
        pending.current.set(reqId, { resolve, reject });
        sendWs({ ...payload, reqId, ts: new Date().toISOString() });
      });
    },
    [sendWs],
  );

  const requestScreen = React.useCallback(
    (paneId: string, options: { lines?: number; mode?: "text" | "image" }) => {
      return sendRequest({
        type: "screen.request",
        data: { paneId, ...options },
      }) as Promise<ScreenResponse>;
    },
    [sendRequest],
  );

  const sendText = React.useCallback(
    (paneId: string, text: string, enter = true) => {
      return sendRequest({
        type: "send.text",
        data: { paneId, text, enter },
      }) as Promise<CommandResponse>;
    },
    [sendRequest],
  );

  const sendKeys = React.useCallback(
    (paneId: string, keys: string[]) => {
      return sendRequest({
        type: "send.keys",
        data: { paneId, keys },
      }) as Promise<CommandResponse>;
    },
    [sendRequest],
  );

  const getSessionDetail = React.useCallback(
    (paneId: string) => {
      const session = sessions.find((item) => item.paneId === paneId);
      return session ? (session as SessionDetail) : null;
    },
    [sessions],
  );

  return (
    <SessionContext.Provider
      value={{
        token,
        sessions,
        connected,
        readOnly,
        refreshSessions,
        requestScreen,
        sendText,
        sendKeys,
        getSessionDetail,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
};

export const useSessions = () => {
  const context = React.useContext(SessionContext);
  if (!context) {
    throw new Error("SessionContext not found");
  }
  return context;
};

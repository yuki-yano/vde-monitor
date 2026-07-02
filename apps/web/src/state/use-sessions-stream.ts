import type { SessionSummary } from "@vde-monitor/shared";
import { sessionsStreamEventSchema } from "@vde-monitor/shared";
import { useEffect, useRef } from "react";

import { createSseSubscription } from "@/lib/sse/sse-subscription";
import type { SseSubscription } from "@/lib/sse/sse-subscription";

export type SessionsStreamTransport = "sse" | "polling";

type UseSessionsStreamParams = {
  enabled: boolean;
  apiBaseUrl: string | null | undefined;
  token: string | null;
  onSnapshot: (sessions: SessionSummary[]) => void;
  onUpsert: (session: SessionSummary) => void;
  onRemove: (paneId: string) => void;
  onAuthError?: () => void;
  onTransportChange: (transport: SessionsStreamTransport) => void;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useSessionsStream = ({
  enabled,
  apiBaseUrl,
  token,
  onSnapshot,
  onUpsert,
  onRemove,
  onAuthError,
  onTransportChange,
}: UseSessionsStreamParams): void => {
  // Stable refs so subscription callbacks always call the latest version
  // without needing to re-create the subscription on each render.
  const onSnapshotRef = useRef(onSnapshot);
  const onUpsertRef = useRef(onUpsert);
  const onRemoveRef = useRef(onRemove);
  const onAuthErrorRef = useRef(onAuthError);
  const onTransportChangeRef = useRef(onTransportChange);
  const transportRef = useRef<SessionsStreamTransport>("polling");

  useEffect(() => {
    onSnapshotRef.current = onSnapshot;
  }, [onSnapshot]);
  useEffect(() => {
    onUpsertRef.current = onUpsert;
  }, [onUpsert]);
  useEffect(() => {
    onRemoveRef.current = onRemove;
  }, [onRemove]);
  useEffect(() => {
    onAuthErrorRef.current = onAuthError;
  }, [onAuthError]);
  useEffect(() => {
    onTransportChangeRef.current = onTransportChange;
  }, [onTransportChange]);

  // Ref to the current subscription for force-reconnect from visibility handlers.
  const subRef = useRef<SseSubscription | null>(null);
  const reconnectRef = useRef<(() => void) | null>(null);

  // ---------------------------------------------------------------------------
  // Subscription lifecycle — re-creates when enabled/token/apiBaseUrl changes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!enabled || !token) {
      transportRef.current = "polling";
      onTransportChangeRef.current("polling");
      return;
    }

    const normalized = apiBaseUrl?.trim();
    const basePath = normalized && normalized.length > 0 ? normalized : "/api";
    const url = `${basePath}/streams/sessions`;
    const getHeaders = (): Record<string, string> => ({
      Authorization: `Bearer ${token}`,
    });

    const handleEvent = (event: { event?: string; data: string }) => {
      if (event.event !== "sessions") return;
      let parsed: ReturnType<typeof sessionsStreamEventSchema.safeParse> | null = null;
      try {
        parsed = sessionsStreamEventSchema.safeParse(JSON.parse(event.data) as unknown);
      } catch {
        return;
      }
      if (!parsed.success) return;
      const data = parsed.data;
      if (data.type === "snapshot") {
        onSnapshotRef.current(data.sessions);
      } else if (data.type === "upsert") {
        onUpsertRef.current(data.session);
      } else if (data.type === "remove") {
        onRemoveRef.current(data.paneId);
      }
    };

    const handleStateChange = (state: string) => {
      const next: SessionsStreamTransport = state === "open" ? "sse" : "polling";
      transportRef.current = next;
      onTransportChangeRef.current(next);
    };

    const handleAuthError = () => {
      onAuthErrorRef.current?.();
    };

    const createSub = (): SseSubscription =>
      createSseSubscription({
        url,
        getHeaders,
        onEvent: handleEvent,
        onStateChange: handleStateChange,
        onAuthError: handleAuthError,
      });

    const sub = createSub();
    subRef.current = sub;

    // Force-reconnect bypasses the internal backoff by closing and re-creating.
    reconnectRef.current = () => {
      subRef.current?.close();
      const next = createSub();
      subRef.current = next;
    };

    return () => {
      sub.close();
      subRef.current = null;
      reconnectRef.current = null;
      transportRef.current = "polling";
      onTransportChangeRef.current("polling");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, token, apiBaseUrl]);

  // ---------------------------------------------------------------------------
  // Visibility / online recovery — bypass backoff on page-focus or reconnect
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const handleResume = () => {
      // If SSE is already open, nothing to do.
      if (transportRef.current === "sse") return;
      reconnectRef.current?.();
    };

    window.addEventListener("visibilitychange", handleResume);
    window.addEventListener("online", handleResume);

    return () => {
      window.removeEventListener("visibilitychange", handleResume);
      window.removeEventListener("online", handleResume);
    };
  }, [enabled]);
};

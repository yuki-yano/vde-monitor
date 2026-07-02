import { screenResponseSchema } from "@vde-monitor/shared";
import type { ScreenResponse } from "@vde-monitor/shared";
import { useEffect, useRef, useState } from "react";

import { createSseSubscription } from "@/lib/sse/sse-subscription";
import type { SseState } from "@/lib/sse/sse-subscription";

export type ScreenStreamTransport = "sse" | "polling";

type UseScreenStreamParams = {
  enabled: boolean;
  paneId: string;
  apiBasePath: string;
  token: string | null;
  onScreenEvent: (response: ScreenResponse) => void;
};

export const useScreenStream = ({
  enabled,
  paneId,
  apiBasePath,
  token,
  onScreenEvent,
}: UseScreenStreamParams): { transport: ScreenStreamTransport } => {
  const [sseState, setSseState] = useState<SseState>("closed");
  const onScreenEventRef = useRef(onScreenEvent);

  useEffect(() => {
    onScreenEventRef.current = onScreenEvent;
  }, [onScreenEvent]);

  useEffect(() => {
    if (!enabled || !token || !paneId) {
      return;
    }

    const url = `${apiBasePath}/streams/sessions/${encodeURIComponent(paneId)}/screen`;

    const sub = createSseSubscription({
      url,
      getHeaders: () => ({ Authorization: `Bearer ${token}` }),
      onStateChange: setSseState,
      onEvent: (event) => {
        if (event.event !== "screen") return;
        let parsed: ReturnType<typeof screenResponseSchema.safeParse>;
        try {
          parsed = screenResponseSchema.safeParse(JSON.parse(event.data));
        } catch {
          return;
        }
        if (!parsed.success) return;
        onScreenEventRef.current(parsed.data);
      },
    });

    return () => {
      sub.close();
    };
  }, [enabled, paneId, apiBasePath, token]);

  return { transport: sseState === "open" ? "sse" : "polling" };
};

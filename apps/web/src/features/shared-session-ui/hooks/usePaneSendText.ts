import type { CommandResponse } from "@vde-monitor/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import { resolveResultErrorMessage } from "@/lib/api-utils";
import type { ScreenMode } from "@/lib/screen-loading";

const buildSendTextRequestId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

type FailedSendTextAttempt = {
  paneId: string;
  text: string;
  enter: boolean;
  requestId: string;
};

type UsePaneSendTextArgs = {
  paneId: string;
  mode: ScreenMode;
  sendText: (
    paneId: string,
    text: string,
    enter?: boolean,
    requestId?: string,
  ) => Promise<CommandResponse>;
  setScreenError: (error: string | null) => void;
  scrollToBottom: (behavior?: "auto" | "smooth") => void;
};

type SendPaneTextOptions = {
  text: string;
  enter: boolean;
  skip?: boolean;
  confirm?: () => boolean;
  onSuccess?: () => void;
};

export const usePaneSendText = ({
  paneId,
  mode,
  sendText,
  setScreenError,
  scrollToBottom,
}: UsePaneSendTextArgs) => {
  const sendTextInFlightRef = useRef(false);
  const lastFailedSendTextRef = useRef<FailedSendTextAttempt | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inFlightRequestId, setInFlightRequestId] = useState<string | null>(null);

  useEffect(() => {
    sendTextInFlightRef.current = false;
    lastFailedSendTextRef.current = null;
    setIsSending(false);
    setError(null);
    setInFlightRequestId(null);
  }, [paneId]);

  const send = useCallback(
    async ({ text, enter, skip = false, confirm, onSuccess }: SendPaneTextOptions) => {
      if (sendTextInFlightRef.current || skip || !text.trim()) {
        return false;
      }
      if (confirm && !confirm()) {
        return false;
      }

      const failedAttempt = lastFailedSendTextRef.current;
      const requestId =
        failedAttempt &&
        failedAttempt.paneId === paneId &&
        failedAttempt.text === text &&
        failedAttempt.enter === enter
          ? failedAttempt.requestId
          : buildSendTextRequestId();

      sendTextInFlightRef.current = true;
      setIsSending(true);
      setInFlightRequestId(requestId);
      try {
        const result = await sendText(paneId, text, enter, requestId);
        if (!result.ok) {
          const message = resolveResultErrorMessage(result, API_ERROR_MESSAGES.sendText);
          setError(message);
          setScreenError(message);
          lastFailedSendTextRef.current = {
            paneId,
            text,
            enter,
            requestId,
          };
          return false;
        }
        setError(null);
        lastFailedSendTextRef.current = null;
        onSuccess?.();
        if (mode === "text") {
          scrollToBottom("auto");
        }
        return true;
      } finally {
        sendTextInFlightRef.current = false;
        setIsSending(false);
        setInFlightRequestId(null);
      }
    },
    [mode, paneId, scrollToBottom, sendText, setScreenError],
  );

  return {
    send,
    isSending,
    error,
    inFlightRequestId,
  };
};

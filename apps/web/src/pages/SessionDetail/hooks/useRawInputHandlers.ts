import type { AllowedKey, CommandResponse, RawItem } from "@vde-monitor/shared";
import {
  type CompositionEvent,
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
} from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";

import {
  INPUT_TYPE_DELETE_BACKWARD,
  INPUT_TYPE_INSERT_COMPOSITION,
  INPUT_TYPE_INSERT_FROM_PASTE,
  INPUT_TYPE_INSERT_LINE_BREAK,
  INPUT_TYPE_INSERT_PARAGRAPH,
  INPUT_TYPE_INSERT_REPLACEMENT,
  INPUT_TYPE_INSERT_TEXT,
  resolveRawBeforeInput,
} from "./raw-input-beforeinput";
import { resolveRawKeyInput } from "./raw-input-keymap";

const RAW_FLUSH_DELAY_MS = 16;

type UseRawInputHandlersParams = {
  paneId: string;
  readOnly: boolean;
  rawMode: boolean;
  allowDangerKeys: boolean;
  ctrlHeld: boolean;
  shiftHeld: boolean;
  sendRaw: (paneId: string, items: RawItem[], unsafe?: boolean) => Promise<CommandResponse>;
  setScreenError: (error: string | null) => void;
};

export const useRawInputHandlers = ({
  paneId,
  readOnly,
  rawMode,
  allowDangerKeys,
  ctrlHeld,
  shiftHeld,
  sendRaw,
  setScreenError,
}: UseRawInputHandlersParams) => {
  const rawQueueRef = useRef<RawItem[]>([]);
  const rawFlushTimerRef = useRef<number | null>(null);
  const rawFlushChainRef = useRef(Promise.resolve());
  const isComposingRef = useRef(false);
  const suppressNextInputRef = useRef(false);
  const suppressNextBeforeInputRef = useRef(false);
  const allowDangerRef = useRef(false);

  useEffect(() => {
    allowDangerRef.current = allowDangerKeys;
  }, [allowDangerKeys]);

  useEffect(() => {
    if (!rawMode) {
      rawQueueRef.current = [];
      if (rawFlushTimerRef.current !== null) {
        window.clearTimeout(rawFlushTimerRef.current);
        rawFlushTimerRef.current = null;
      }
    }
  }, [rawMode]);

  const resetRawInputValue = useCallback((target: HTMLTextAreaElement | null) => {
    if (!target) return;
    target.value = "";
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => {
        target.value = "";
      });
      return;
    }
    window.setTimeout(() => {
      target.value = "";
    }, 0);
  }, []);

  const scheduleClearSuppressedInput = useCallback(() => {
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => {
        suppressNextInputRef.current = false;
      });
      return;
    }
    window.setTimeout(() => {
      suppressNextInputRef.current = false;
    }, 0);
  }, []);

  const scheduleClearSuppressedBeforeInput = useCallback(() => {
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => {
        suppressNextBeforeInputRef.current = false;
      });
      return;
    }
    window.setTimeout(() => {
      suppressNextBeforeInputRef.current = false;
    }, 0);
  }, []);

  const enqueueRawItems = useCallback(
    (items: RawItem[]) => {
      if (readOnly || items.length === 0) return;
      rawQueueRef.current.push(...items);
      if (rawFlushTimerRef.current !== null) return;
      rawFlushTimerRef.current = window.setTimeout(() => {
        rawFlushTimerRef.current = null;
        const batch = rawQueueRef.current.splice(0, rawQueueRef.current.length);
        if (batch.length === 0) return;
        const merged: RawItem[] = [];
        for (const item of batch) {
          const last = merged[merged.length - 1];
          if (item.kind === "text" && last?.kind === "text") {
            last.value += item.value;
          } else if (item.kind === "text" && item.value.length === 0) {
            continue;
          } else {
            merged.push({ ...item });
          }
        }
        rawFlushChainRef.current = rawFlushChainRef.current.then(async () => {
          try {
            const result = await sendRaw(paneId, merged, allowDangerRef.current);
            if (!result.ok) {
              setScreenError(result.error?.message ?? API_ERROR_MESSAGES.sendRaw);
            }
          } catch {
            setScreenError(API_ERROR_MESSAGES.sendRaw);
          }
        });
      }, RAW_FLUSH_DELAY_MS);
    },
    [paneId, readOnly, sendRaw, setScreenError],
  );

  const enqueueRawText = useCallback(
    (value: string | null) => {
      if (!value) return;
      const text = value;
      if (ctrlHeld && text.length === 1 && /[a-z]/i.test(text)) {
        enqueueRawItems([{ kind: "key", value: `C-${text.toLowerCase()}` as AllowedKey }]);
        return;
      }
      enqueueRawItems([{ kind: "text", value: text }]);
    },
    [ctrlHeld, enqueueRawItems],
  );

  const enqueueRawKey = useCallback(
    (value: AllowedKey) => {
      enqueueRawItems([{ kind: "key", value }]);
    },
    [enqueueRawItems],
  );

  const handleRawInputType = useCallback(
    (inputType: string | null, data: string | null) => {
      if (!inputType) return;
      switch (inputType) {
        case INPUT_TYPE_INSERT_TEXT:
        case INPUT_TYPE_INSERT_REPLACEMENT:
        case INPUT_TYPE_INSERT_FROM_PASTE: {
          enqueueRawText(data);
          return;
        }
        case INPUT_TYPE_INSERT_LINE_BREAK:
        case INPUT_TYPE_INSERT_PARAGRAPH: {
          enqueueRawKey("Enter");
          return;
        }
        case INPUT_TYPE_DELETE_BACKWARD: {
          enqueueRawKey("BSpace");
          return;
        }
        case INPUT_TYPE_INSERT_COMPOSITION: {
          if (!isComposingRef.current) {
            enqueueRawText(data);
          }
          return;
        }
        default:
          return;
      }
    },
    [enqueueRawKey, enqueueRawText],
  );

  const handleRawBeforeInput = useCallback(
    (event: FormEvent<HTMLTextAreaElement>) => {
      const inputEvent = event.nativeEvent as InputEvent | undefined;
      const resolution = resolveRawBeforeInput({
        rawMode,
        readOnly,
        suppressNextBeforeInput: suppressNextBeforeInputRef.current,
        isComposing: isComposingRef.current,
        inputType: inputEvent?.inputType ?? null,
        data: typeof inputEvent?.data === "string" ? inputEvent.data : null,
      });
      if (resolution.kind === "ignored") {
        return;
      }
      if (resolution.kind === "consumeSuppressFlag") {
        suppressNextBeforeInputRef.current = false;
        return;
      }
      suppressNextInputRef.current = true;
      handleRawInputType(resolution.inputType, resolution.data);
      event.preventDefault();
      resetRawInputValue(event.currentTarget);
      scheduleClearSuppressedInput();
    },
    [handleRawInputType, rawMode, readOnly, resetRawInputValue, scheduleClearSuppressedInput],
  );

  const handleRawInput = useCallback(
    (event: FormEvent<HTMLTextAreaElement>) => {
      if (!rawMode || readOnly) return;
      if (suppressNextInputRef.current) {
        suppressNextInputRef.current = false;
        resetRawInputValue(event.currentTarget);
        return;
      }
      const inputEvent = event.nativeEvent as InputEvent | undefined;
      const inputType = inputEvent?.inputType ?? null;
      const fallbackText = inputEvent?.data ?? event.currentTarget.value;
      if (!inputType && fallbackText) {
        enqueueRawText(fallbackText);
        resetRawInputValue(event.currentTarget);
        return;
      }
      handleRawInputType(inputType, fallbackText);
      resetRawInputValue(event.currentTarget);
    },
    [enqueueRawText, handleRawInputType, rawMode, readOnly, resetRawInputValue],
  );

  const handleRawKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!rawMode || readOnly) return;
      if (event.nativeEvent.isComposing) return;
      const ctrlActive = ctrlHeld || event.ctrlKey;
      const shiftActive = shiftHeld || event.shiftKey;
      const resolved = resolveRawKeyInput({
        key: event.key,
        ctrlActive,
        shiftActive,
      });
      if (!resolved) {
        return;
      }

      event.preventDefault();
      if (resolved.suppressBeforeInput) {
        suppressNextBeforeInputRef.current = true;
        scheduleClearSuppressedBeforeInput();
      }
      enqueueRawKey(resolved.key);
      resetRawInputValue(event.currentTarget);
    },
    [
      ctrlHeld,
      enqueueRawKey,
      rawMode,
      readOnly,
      resetRawInputValue,
      scheduleClearSuppressedBeforeInput,
      shiftHeld,
    ],
  );

  const handleRawCompositionStart = useCallback(() => {
    if (!rawMode || readOnly) return;
    isComposingRef.current = true;
  }, [rawMode, readOnly]);

  const handleRawCompositionEnd = useCallback(
    (event: CompositionEvent<HTMLTextAreaElement>) => {
      if (!rawMode || readOnly) return;
      isComposingRef.current = false;
      enqueueRawText(event.data);
      resetRawInputValue(event.currentTarget);
    },
    [enqueueRawText, rawMode, readOnly, resetRawInputValue],
  );

  return {
    handleRawBeforeInput,
    handleRawInput,
    handleRawKeyDown,
    handleRawCompositionStart,
    handleRawCompositionEnd,
  };
};

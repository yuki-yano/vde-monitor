import {
  type AllowedKey,
  type CommandResponse,
  defaultDangerKeys,
  type RawItem,
} from "@vde-monitor/shared";
import { useAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import type { ScreenMode } from "@/lib/screen-loading";

import {
  controlsAllowDangerKeysAtom,
  controlsAutoEnterAtom,
  controlsCtrlHeldAtom,
  controlsOpenAtom,
  controlsRawModeAtom,
  controlsShiftHeldAtom,
} from "../atoms/controlAtoms";
import { isDangerousText } from "../sessionDetailUtils";
import { mapKeyWithModifiers } from "./sessionControlKeys";
import { useRawInputHandlers } from "./useRawInputHandlers";

type UseSessionControlsParams = {
  paneId: string;
  readOnly: boolean;
  mode: ScreenMode;
  sendText: (paneId: string, text: string, enter?: boolean) => Promise<CommandResponse>;
  sendKeys: (paneId: string, keys: AllowedKey[]) => Promise<CommandResponse>;
  sendRaw: (paneId: string, items: RawItem[], unsafe?: boolean) => Promise<CommandResponse>;
  setScreenError: (error: string | null) => void;
  scrollToBottom: (behavior?: "auto" | "smooth") => void;
};

export const useSessionControls = ({
  paneId,
  readOnly,
  mode,
  sendText,
  sendKeys,
  sendRaw,
  setScreenError,
  scrollToBottom,
}: UseSessionControlsParams) => {
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  const prevAutoEnterRef = useRef<boolean | null>(null);
  const [autoEnter, setAutoEnter] = useAtom(controlsAutoEnterAtom);
  const [shiftHeld, setShiftHeld] = useAtom(controlsShiftHeldAtom);
  const [ctrlHeld, setCtrlHeld] = useAtom(controlsCtrlHeldAtom);
  const [controlsOpen, setControlsOpen] = useAtom(controlsOpenAtom);
  const [rawMode, setRawMode] = useAtom(controlsRawModeAtom);
  const [allowDangerKeys, setAllowDangerKeys] = useAtom(controlsAllowDangerKeysAtom);

  useEffect(() => {
    if (!rawMode && prevAutoEnterRef.current !== null) {
      setAutoEnter(prevAutoEnterRef.current);
      prevAutoEnterRef.current = null;
    }
  }, [rawMode, setAutoEnter]);

  useEffect(() => {
    if (readOnly && rawMode) {
      setRawMode(false);
      setAllowDangerKeys(false);
    }
  }, [readOnly, rawMode, setAllowDangerKeys, setRawMode]);

  const handleSendKey = useCallback(
    async (key: string) => {
      if (readOnly) return;
      const mapped = mapKeyWithModifiers(key, ctrlHeld, shiftHeld);
      if (rawMode) {
        const result = await sendRaw(
          paneId,
          [{ kind: "key", value: mapped as AllowedKey }],
          allowDangerKeys,
        );
        if (!result.ok) {
          setScreenError(result.error?.message ?? API_ERROR_MESSAGES.sendRaw);
        }
        return;
      }
      const hasDanger = defaultDangerKeys.includes(mapped);
      if (hasDanger) {
        const confirmed = window.confirm("Dangerous key detected. Send anyway?");
        if (!confirmed) return;
      }
      const result = await sendKeys(paneId, [mapped as AllowedKey]);
      if (!result.ok) {
        setScreenError(result.error?.message ?? API_ERROR_MESSAGES.sendKeys);
      }
    },
    [
      allowDangerKeys,
      ctrlHeld,
      paneId,
      rawMode,
      readOnly,
      sendKeys,
      sendRaw,
      setScreenError,
      shiftHeld,
    ],
  );

  const handleSendText = useCallback(async () => {
    if (readOnly || rawMode) return;
    const currentValue = textInputRef.current?.value ?? "";
    if (!currentValue.trim()) return;
    if (isDangerousText(currentValue)) {
      const confirmed = window.confirm("Dangerous command detected. Send anyway?");
      if (!confirmed) return;
    }
    const result = await sendText(paneId, currentValue, autoEnter);
    if (!result.ok) {
      setScreenError(result.error?.message ?? API_ERROR_MESSAGES.sendText);
      return;
    }
    if (textInputRef.current) {
      textInputRef.current.value = "";
    }
    if (mode === "text") {
      scrollToBottom("auto");
    }
  }, [autoEnter, mode, paneId, rawMode, readOnly, scrollToBottom, sendText, setScreenError]);

  const toggleAutoEnter = useCallback(() => {
    setAutoEnter((prev) => !prev);
  }, [setAutoEnter]);

  const toggleControls = useCallback(() => {
    setControlsOpen((prev) => !prev);
  }, [setControlsOpen]);

  const toggleShift = useCallback(() => {
    setShiftHeld((prev) => !prev);
  }, [setShiftHeld]);

  const toggleCtrl = useCallback(() => {
    setCtrlHeld((prev) => !prev);
  }, [setCtrlHeld]);

  const toggleRawMode = useCallback(() => {
    setRawMode((prev) => {
      const next = !prev;
      if (next) {
        prevAutoEnterRef.current = autoEnter;
        setAutoEnter(false);
      } else {
        setAllowDangerKeys(false);
      }
      return next;
    });
  }, [autoEnter, setAllowDangerKeys, setAutoEnter, setRawMode]);

  const toggleAllowDangerKeys = useCallback(() => {
    setAllowDangerKeys((prev) => !prev);
  }, [setAllowDangerKeys]);

  const {
    handleRawBeforeInput,
    handleRawInput,
    handleRawKeyDown,
    handleRawCompositionStart,
    handleRawCompositionEnd,
  } = useRawInputHandlers({
    paneId,
    readOnly,
    rawMode,
    allowDangerKeys,
    ctrlHeld,
    shiftHeld,
    sendRaw,
    setScreenError,
  });

  return {
    textInputRef,
    autoEnter,
    shiftHeld,
    ctrlHeld,
    controlsOpen,
    rawMode,
    allowDangerKeys,
    handleSendKey,
    handleSendText,
    handleRawBeforeInput,
    handleRawInput,
    handleRawKeyDown,
    handleRawCompositionStart,
    handleRawCompositionEnd,
    toggleAutoEnter,
    toggleControls,
    toggleShift,
    toggleCtrl,
    toggleRawMode,
    toggleAllowDangerKeys,
  };
};

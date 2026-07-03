import { type AllowedKey, type CommandResponse, type RawItem } from "@vde-monitor/shared";
import { type Dispatch, type SetStateAction, useCallback, useRef } from "react";

import type { PermissionShortcutValue } from "@/features/shared-session-ui/components/PaneTextComposer";
import { mapKeyWithModifiers } from "@/features/shared-session-ui/hooks/session-control-keys";
import { confirmDangerousKey } from "@/features/shared-session-ui/model/danger-confirm";
import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import { resolveResultErrorMessage } from "@/lib/api-utils";

type BooleanSetter = Dispatch<SetStateAction<boolean>>;

type UseTerminalControlsParams = {
  paneId: string;
  ctrlHeld: boolean;
  shiftHeld: boolean;
  rawMode: boolean;
  allowDangerKeys: boolean;
  autoEnter: boolean;
  sendKeys: (paneId: string, keys: AllowedKey[]) => Promise<CommandResponse>;
  sendRaw: (paneId: string, items: RawItem[], unsafe?: boolean) => Promise<CommandResponse>;
  setAutoEnter: BooleanSetter;
  setRawMode: BooleanSetter;
  setAllowDangerKeys: BooleanSetter;
  /**
   * Reports send-scoped failures and is cleared on every successful send.
   * Both callers (ChatGridTile's local composer error, SessionDetail's
   * dedicated send-error state) wire in a setter with that same
   * clear-on-success contract, so this hook doesn't need to know which
   * store backs it.
   */
  setScreenError: (error: string | null) => void;
  /**
   * ChatGridTile touches the session (to bump list recency) after a
   * successful permission shortcut send; SessionDetail has no equivalent.
   */
  onSendPermissionShortcutSuccess?: (paneId: string) => void;
};

export const useTerminalControls = ({
  paneId,
  ctrlHeld,
  shiftHeld,
  rawMode,
  allowDangerKeys,
  autoEnter,
  sendKeys,
  sendRaw,
  setAutoEnter,
  setRawMode,
  setAllowDangerKeys,
  setScreenError,
  onSendPermissionShortcutSuccess,
}: UseTerminalControlsParams) => {
  const prevAutoEnterRef = useRef<boolean | null>(null);

  const handleSendKey = useCallback(
    async (key: string) => {
      const mapped = mapKeyWithModifiers(key, ctrlHeld, shiftHeld) as AllowedKey;
      if (rawMode) {
        const result = await sendRaw(paneId, [{ kind: "key", value: mapped }], allowDangerKeys);
        if (!result.ok) {
          setScreenError(resolveResultErrorMessage(result, API_ERROR_MESSAGES.sendRaw));
          return;
        }
        setScreenError(null);
        return;
      }
      if (!confirmDangerousKey(mapped)) {
        return;
      }
      const result = await sendKeys(paneId, [mapped]);
      if (!result.ok) {
        setScreenError(resolveResultErrorMessage(result, API_ERROR_MESSAGES.sendKeys));
        return;
      }
      setScreenError(null);
    },
    [allowDangerKeys, ctrlHeld, paneId, rawMode, sendKeys, sendRaw, setScreenError, shiftHeld],
  );

  const handleSendPermissionShortcut = useCallback(
    async (value: PermissionShortcutValue) => {
      const item: RawItem =
        value === "Escape" ? { kind: "key", value: "Escape" } : { kind: "text", value };
      const result = await sendRaw(paneId, [item], false);
      if (!result.ok) {
        setScreenError(resolveResultErrorMessage(result, API_ERROR_MESSAGES.sendRaw));
        return;
      }
      setScreenError(null);
      onSendPermissionShortcutSuccess?.(paneId);
    },
    [onSendPermissionShortcutSuccess, paneId, sendRaw, setScreenError],
  );

  const toggleRawMode = useCallback(() => {
    setRawMode((prev) => {
      const next = !prev;
      if (next) {
        prevAutoEnterRef.current = autoEnter;
        setAutoEnter(false);
      } else {
        if (prevAutoEnterRef.current != null) {
          setAutoEnter(prevAutoEnterRef.current);
          prevAutoEnterRef.current = null;
        }
        setAllowDangerKeys(false);
      }
      return next;
    });
  }, [autoEnter, setAllowDangerKeys, setAutoEnter, setRawMode]);

  return {
    handleSendKey,
    handleSendPermissionShortcut,
    toggleRawMode,
  };
};

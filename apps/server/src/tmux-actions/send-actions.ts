import type { AgentMonitorConfig } from "@vde-monitor/multiplexer";
import {
  type RawItem,
  allowedKeys,
  compileDangerPatterns,
  isDangerousCommand,
} from "@vde-monitor/shared";
import type { TmuxAdapter } from "@vde-monitor/tmux";
import { sleep } from "../async-utils";

import { setMapEntryWithLimit } from "../cache";
import type { ActionResultHelpers } from "./action-results";
import type { SerializePaneInput } from "./pane-input-serializer";

const PENDING_COMMANDS_MAX_ENTRIES = 500;

type CreateSendActionsParams = {
  adapter: TmuxAdapter;
  config: AgentMonitorConfig;
  pendingCommands: Map<string, string>;
  dangerKeys: ReadonlySet<string>;
  actionResults: ActionResultHelpers;
  serializePaneInput: SerializePaneInput;
};

export const createSendActions = ({
  adapter,
  config,
  pendingCommands,
  dangerKeys,
  actionResults,
  serializePaneInput,
}: CreateSendActionsParams) => {
  const { okResult, invalidPayload, internalError, dangerousCommand, dangerousKey } = actionResults;

  const dangerPatterns = compileDangerPatterns(config.dangerCommandPatterns);
  const allowedKeySet: ReadonlySet<string> = new Set(allowedKeys);
  const enterKey = "C-m";
  const enterDelayMs = 100;
  const maxTextLength = 2000;
  const bracketedPaste = (value: string) => `\u001b[200~${value}\u001b[201~`;
  const normalizeText = (value: string) => value.replace(/\r\n/g, "\n");
  const ensureTextLength = (value: string) => {
    if (value.length > maxTextLength) {
      return invalidPayload("text too long");
    }
    return null;
  };

  const hasInvalidKey = (keys: string[]) => keys.some((key) => !allowedKeySet.has(key));
  const hasDangerKey = (keys: string[]) => keys.some((key) => dangerKeys.has(key));

  const prepareSendText = (paneId: string, text: string) => {
    const normalized = normalizeText(text);
    const pending = pendingCommands.get(paneId) ?? "";
    return { normalized, combined: `${pending}${normalized}` };
  };

  const validateSendTextInput = (text: string) => {
    if (!text || text.trim().length === 0) {
      return invalidPayload("text is required");
    }
    return ensureTextLength(text);
  };

  const validateCombinedText = (paneId: string, combined: string) => {
    if (combined.length > maxTextLength) {
      pendingCommands.delete(paneId);
      return invalidPayload("text too long");
    }
    if (isDangerousCommand(combined, dangerPatterns)) {
      pendingCommands.delete(paneId);
      return dangerousCommand();
    }
    return null;
  };

  const validateSendKeysInput = (keys: string[]) => {
    if (keys.length === 0 || hasInvalidKey(keys)) {
      return invalidPayload("invalid keys");
    }
    if (hasDangerKey(keys)) {
      return dangerousKey();
    }
    return null;
  };

  const validateRawItems = (items: RawItem[], unsafe: boolean) => {
    if (!items || items.length === 0) {
      return invalidPayload("items are required");
    }
    const keys = items.filter((item) => item.kind === "key").map((item) => item.value);
    if (hasInvalidKey(keys)) {
      return invalidPayload("invalid keys");
    }
    if (!unsafe && hasDangerKey(keys)) {
      return dangerousKey();
    }
    return null;
  };

  const exitCopyModeIfNeededUnlocked = async (paneId: string) => {
    await adapter.run([
      "if-shell",
      "-t",
      paneId,
      '[ "#{pane_in_mode}" = "1" ]',
      `copy-mode -q -t ${paneId}`,
    ]);
  };

  const exitCopyModeIfNeeded = (paneId: string) =>
    serializePaneInput(paneId, () => exitCopyModeIfNeededUnlocked(paneId));

  const sendLiteralKeys = async (paneId: string, payload: string) => {
    const result = await adapter.run(["send-keys", "-l", "-t", paneId, "--", payload]);
    if (result.exitCode !== 0) {
      return internalError(result.stderr || "send-keys failed");
    }
    return okResult();
  };

  const sendEnterKeyUnlocked = async (paneId: string) => {
    if (enterDelayMs > 0) {
      await sleep(enterDelayMs);
    }
    const result = await adapter.run(["send-keys", "-t", paneId, enterKey]);
    if (result.exitCode !== 0) {
      return internalError(result.stderr || "send-keys Enter failed");
    }
    return okResult();
  };

  const sendEnterKey = (paneId: string) =>
    serializePaneInput(paneId, () => sendEnterKeyUnlocked(paneId));

  const sendRawText = async (paneId: string, value: string) => {
    if (!value) {
      return okResult();
    }
    const lengthError = ensureTextLength(value);
    if (lengthError) {
      return lengthError;
    }
    const normalized = normalizeText(value);
    const payload = normalized.includes("\n") ? bracketedPaste(normalized) : normalized;
    return sendLiteralKeys(paneId, payload);
  };

  const sendRawItem = async (paneId: string, item: RawItem) => {
    if (item.kind === "text") {
      return sendRawText(paneId, item.value);
    }
    const result = await adapter.run(["send-keys", "-t", paneId, item.value]);
    if (result.exitCode !== 0) {
      return internalError(result.stderr || "send-keys failed");
    }
    return okResult();
  };

  const resolveTextPayload = (normalized: string) =>
    normalized.includes("\n") ? bracketedPaste(normalized) : normalized;

  const finalizePendingText = ({
    paneId,
    enter,
    normalized,
    combined,
  }: {
    paneId: string;
    enter: boolean;
    normalized: string;
    combined: string;
  }) => {
    if (enter || normalized.includes("\n")) {
      pendingCommands.delete(paneId);
      return okResult();
    }
    setMapEntryWithLimit(pendingCommands, paneId, combined, PENDING_COMMANDS_MAX_ENTRIES);
    return okResult();
  };

  const sendTextUnlocked = async (paneId: string, text: string, enter: boolean) => {
    const inputError = validateSendTextInput(text);
    if (inputError) {
      return inputError;
    }

    const prepared = prepareSendText(paneId, text);
    const combinedError = validateCombinedText(paneId, prepared.combined);
    if (combinedError) {
      return combinedError;
    }

    await exitCopyModeIfNeededUnlocked(paneId);
    const payload = resolveTextPayload(prepared.normalized);
    const sendResult = await sendLiteralKeys(paneId, payload);
    if (!sendResult.ok) {
      return sendResult;
    }

    if (enter) {
      // Track the delivered text before sending Enter so a failed Enter still
      // leaves the danger-command check aware of what reached the pane.
      setMapEntryWithLimit(
        pendingCommands,
        paneId,
        prepared.combined,
        PENDING_COMMANDS_MAX_ENTRIES,
      );
      const enterResult = await sendEnterKeyUnlocked(paneId);
      if (!enterResult.ok) {
        return enterResult;
      }
    }
    return finalizePendingText({
      paneId,
      enter,
      normalized: prepared.normalized,
      combined: prepared.combined,
    });
  };

  const sendText = (paneId: string, text: string, enter = true) =>
    serializePaneInput(paneId, () => sendTextUnlocked(paneId, text, enter));

  const sendKeysUnlocked = async (paneId: string, keys: string[]) => {
    const validationError = validateSendKeysInput(keys);
    if (validationError) {
      return validationError;
    }
    for (const key of keys) {
      const result = await adapter.run(["send-keys", "-t", paneId, key]);
      if (result.exitCode !== 0) {
        return internalError(result.stderr || "send-keys failed");
      }
    }
    return okResult();
  };

  const sendKeys = (paneId: string, keys: string[]) =>
    serializePaneInput(paneId, () => sendKeysUnlocked(paneId, keys));

  const sendRawUnlocked = async (paneId: string, items: RawItem[], unsafe: boolean) => {
    const validationError = validateRawItems(items, unsafe);
    if (validationError) {
      return validationError;
    }

    await exitCopyModeIfNeededUnlocked(paneId);
    for (const item of items) {
      const result = await sendRawItem(paneId, item);
      if (!result.ok) {
        return result;
      }
    }
    return okResult();
  };

  const sendRaw = (paneId: string, items: RawItem[], unsafe = false) =>
    serializePaneInput(paneId, () => sendRawUnlocked(paneId, items, unsafe));

  return {
    sendText,
    sendKeys,
    sendRaw,
    sendEnterKey,
    exitCopyModeIfNeeded,
  };
};

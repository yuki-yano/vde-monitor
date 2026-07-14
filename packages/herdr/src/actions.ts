import type { AgentMonitorConfig, MultiplexerActionResult } from "@vde-monitor/multiplexer";
import type { AllowedKey, ApiError, RawItem } from "@vde-monitor/shared";
import { allowedKeys, compileDangerPatterns, isDangerousCommand } from "@vde-monitor/shared";

import { HERDR_METHODS } from "./methods";
import type { HerdrRequester } from "./types";

const MAX_TEXT_LENGTH = 2000;
const SEND_CHUNK_SIZE = 16 * 1024;
export const HERDR_MAX_INPUT_SAFETY_STATES = 500;

type PaneInputSafetyState = { kind: "pending"; command: string } | { kind: "tainted" };

type InputTransition =
  | { ok: true; state: PaneInputSafetyState | null }
  | { ok: false; result: MultiplexerActionResult };

const buildError = (code: ApiError["code"], message: string): ApiError => ({
  code,
  message,
});

const okResult = (): MultiplexerActionResult => ({ ok: true });

const invalidPayload = (message: string): MultiplexerActionResult => ({
  ok: false,
  error: buildError("INVALID_PAYLOAD", message),
});

const dangerousCommand = (): MultiplexerActionResult => ({
  ok: false,
  error: buildError("DANGEROUS_COMMAND", "dangerous command blocked"),
});

const dangerousKey = (): MultiplexerActionResult => ({
  ok: false,
  error: buildError("DANGEROUS_COMMAND", "dangerous key blocked"),
});

const uncertainInputState = (): MultiplexerActionResult => ({
  ok: false,
  error: buildError(
    "DANGEROUS_COMMAND",
    "pane input state is uncertain; close the pane before sending more input",
  ),
});

const safetyStateOverflow = (): MultiplexerActionResult => ({
  ok: false,
  error: buildError(
    "DANGEROUS_COMMAND",
    "input safety state capacity exceeded; restart vde-monitor before sending more input",
  ),
});

const requestError = (error: unknown, fallbackMessage: string): MultiplexerActionResult => ({
  ok: false,
  error: buildError("INTERNAL", error instanceof Error ? error.message : fallbackMessage),
});

const normalizeText = (value: string) => value.replace(/\r\n?/g, "\n");

const containsUnsupportedTextControl = (value: string): boolean => {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      (codePoint != null && codePoint <= 0x1f && codePoint !== 0x0a) ||
      (codePoint != null && codePoint >= 0x7f && codePoint <= 0x9f)
    ) {
      return true;
    }
  }
  return false;
};

const normalizeAndValidateText = (
  value: string,
): { ok: true; normalized: string } | { ok: false; result: MultiplexerActionResult } => {
  const normalized = normalizeText(value);
  if (containsUnsupportedTextControl(normalized)) {
    return { ok: false, result: invalidPayload("text contains unsupported control characters") };
  }
  return { ok: true, normalized };
};

const sendInput = async (
  client: HerdrRequester,
  paneId: string,
  text: string,
  keys: string[] = [],
): Promise<MultiplexerActionResult> => {
  try {
    await client.request(HERDR_METHODS.paneSendInput, {
      pane_id: paneId,
      text,
      keys,
    });
    return okResult();
  } catch (error) {
    return requestError(error, "herdr pane.send_input failed");
  }
};

const chunkText = (text: string): string[] => {
  if (text.length <= SEND_CHUNK_SIZE) return [text];
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += SEND_CHUNK_SIZE) {
    chunks.push(text.slice(index, index + SEND_CHUNK_SIZE));
  }
  return chunks;
};

export const createHerdrActions = (client: HerdrRequester, config: AgentMonitorConfig) => {
  const paneInputQueues = new Map<string, Promise<void>>();
  const paneInputStates = new Map<string, PaneInputSafetyState>();
  const dangerPatterns = compileDangerPatterns(config.dangerCommandPatterns);
  const dangerKeys = new Set(config.dangerKeys);
  const allowedKeySet = new Set(allowedKeys);
  const submitKeys = new Set<AllowedKey>(["Enter", "C-m", "C-j"]);
  let safetyStateOverflowed = false;

  const runSerialized = async <T>(paneId: string, operation: () => Promise<T>): Promise<T> => {
    const previous = paneInputQueues.get(paneId) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    paneInputQueues.set(paneId, tail);
    try {
      return await result;
    } finally {
      if (paneInputQueues.get(paneId) === tail) {
        paneInputQueues.delete(paneId);
      }
    }
  };

  const readKnownPending = (
    paneId: string,
  ): { ok: true; pending: string } | { ok: false; result: MultiplexerActionResult } => {
    if (safetyStateOverflowed) return { ok: false, result: safetyStateOverflow() };
    const state = paneInputStates.get(paneId);
    if (state?.kind === "tainted") return { ok: false, result: uncertainInputState() };
    return { ok: true, pending: state?.command ?? "" };
  };

  const validateKnownCommand = (
    command: string,
    checkDanger: boolean,
  ): MultiplexerActionResult | null => {
    if (command.length > MAX_TEXT_LENGTH) return invalidPayload("text too long");
    if (checkDanger && isDangerousCommand(command, dangerPatterns)) return dangerousCommand();
    return null;
  };

  const appendKnownText = (
    initialPending: string,
    text: string,
    checkDanger: boolean,
  ): { ok: true; pending: string } | { ok: false; result: MultiplexerActionResult } => {
    const validated = normalizeAndValidateText(text);
    if (!validated.ok) return validated;
    const pending = `${initialPending}${validated.normalized}`;
    const error = validateKnownCommand(pending, checkDanger);
    if (error != null) return { ok: false, result: error };
    return { ok: true, pending };
  };

  const transitionKeys = (
    initialPending: string,
    keys: readonly AllowedKey[],
    checkDanger: boolean,
  ): InputTransition => {
    let pending = initialPending;
    let tainted = false;
    for (const key of keys) {
      if (submitKeys.has(key)) {
        if (tainted) return { ok: false, result: dangerousCommand() };
        const error = validateKnownCommand(pending, checkDanger);
        if (error != null) return { ok: false, result: error };
        pending = "";
        continue;
      }
      if (key === "Space") {
        if (tainted) continue;
        const appended = appendKnownText(pending, " ", checkDanger);
        if (!appended.ok) return appended;
        pending = appended.pending;
        continue;
      }
      tainted = true;
    }
    if (tainted) return { ok: true, state: { kind: "tainted" } };
    return pending.length === 0
      ? { ok: true, state: null }
      : { ok: true, state: { kind: "pending", command: pending } };
  };

  const transitionRawItems = (
    initialPending: string,
    items: readonly RawItem[],
    unsafe: boolean,
  ): InputTransition => {
    let pending = initialPending;
    let tainted = false;
    for (const item of items) {
      if (item.kind === "text") {
        const normalized = normalizeText(item.value);
        if (tainted) {
          continue;
        }
        const appended = appendKnownText(pending, normalized, !unsafe);
        if (!appended.ok) return appended;
        pending = appended.pending;
        continue;
      }
      if (submitKeys.has(item.value)) {
        if (tainted) return { ok: false, result: dangerousCommand() };
        const error = validateKnownCommand(pending, !unsafe);
        if (error != null) return { ok: false, result: error };
        pending = "";
        continue;
      }
      if (item.value === "Space") {
        if (tainted) continue;
        const appended = appendKnownText(pending, " ", !unsafe);
        if (!appended.ok) return appended;
        pending = appended.pending;
        continue;
      }
      tainted = true;
    }
    if (tainted) return { ok: true, state: { kind: "tainted" } };
    return pending.length === 0
      ? { ok: true, state: null }
      : { ok: true, state: { kind: "pending", command: pending } };
  };

  const beginInputMutation = (paneId: string): MultiplexerActionResult | null => {
    if (safetyStateOverflowed) return safetyStateOverflow();
    if (!paneInputStates.has(paneId) && paneInputStates.size >= HERDR_MAX_INPUT_SAFETY_STATES) {
      safetyStateOverflowed = true;
      return safetyStateOverflow();
    }
    paneInputStates.set(paneId, { kind: "tainted" });
    return null;
  };

  const commitInputState = (paneId: string, state: PaneInputSafetyState | null): void => {
    if (state == null) paneInputStates.delete(paneId);
    else paneInputStates.set(paneId, state);
  };

  const sendText = async (
    paneId: string,
    text: string,
    enter = true,
  ): Promise<MultiplexerActionResult> => {
    return await runSerialized(paneId, async () => {
      if (!text) return invalidPayload("text is required");
      if (text.length > MAX_TEXT_LENGTH) return invalidPayload("text too long");
      const validatedText = normalizeAndValidateText(text);
      if (!validatedText.ok) return validatedText.result;
      if (validatedText.normalized.trim().length === 0) return invalidPayload("text is required");

      const known = readKnownPending(paneId);
      if (!known.ok) return known.result;
      const appended = appendKnownText(known.pending, validatedText.normalized, true);
      if (!appended.ok) return appended.result;
      const nextState: PaneInputSafetyState | null =
        enter || appended.pending.length === 0
          ? null
          : { kind: "pending", command: appended.pending };
      const trackingError = beginInputMutation(paneId);
      if (trackingError != null) return trackingError;

      const normalized = validatedText.normalized;
      const chunks = chunkText(normalized);
      for (let index = 0; index < chunks.length; index += 1) {
        const keys = enter && index === chunks.length - 1 ? ["Enter"] : [];
        const result = await sendInput(client, paneId, chunks[index] ?? "", keys);
        if (!result.ok) return result;
      }
      commitInputState(paneId, nextState);
      return okResult();
    });
  };

  const sendKeys = async (paneId: string, keys: AllowedKey[]): Promise<MultiplexerActionResult> => {
    return await runSerialized(paneId, async () => {
      if (keys.length === 0 || keys.some((key) => !allowedKeySet.has(key))) {
        return invalidPayload("invalid keys");
      }
      const known = readKnownPending(paneId);
      if (!known.ok) return known.result;
      if (keys.some((key) => dangerKeys.has(key))) return dangerousKey();
      const transition = transitionKeys(known.pending, keys, true);
      if (!transition.ok) return transition.result;
      const trackingError = beginInputMutation(paneId);
      if (trackingError != null) return trackingError;

      try {
        await client.request(HERDR_METHODS.paneSendKeys, { pane_id: paneId, keys });
      } catch (error) {
        return requestError(error, "herdr pane.send_keys failed");
      }
      commitInputState(paneId, transition.state);
      return okResult();
    });
  };

  const sendRaw = async (
    paneId: string,
    items: RawItem[],
    unsafe = false,
  ): Promise<MultiplexerActionResult> => {
    return await runSerialized(paneId, async () => {
      if (!items || items.length === 0) return invalidPayload("items are required");
      const keys = items.filter((item) => item.kind === "key").map((item) => item.value);
      if (keys.some((key) => !allowedKeySet.has(key))) return invalidPayload("invalid keys");
      for (const item of items) {
        if (item.kind !== "text") continue;
        const validatedText = normalizeAndValidateText(item.value);
        if (!validatedText.ok) return validatedText.result;
      }
      const known = readKnownPending(paneId);
      if (!known.ok) return known.result;
      if (!unsafe && keys.some((key) => dangerKeys.has(key))) return dangerousKey();
      const transition = transitionRawItems(known.pending, items, unsafe);
      if (!transition.ok) return transition.result;
      const trackingError = beginInputMutation(paneId);
      if (trackingError != null) return trackingError;

      for (const item of items) {
        if (item.kind === "text") {
          const normalized = normalizeText(item.value);
          if (normalized.length === 0) continue;
          for (const chunk of chunkText(normalized)) {
            const result = await sendInput(client, paneId, chunk);
            if (!result.ok) return result;
          }
          continue;
        }
        try {
          await client.request(HERDR_METHODS.paneSendKeys, {
            pane_id: paneId,
            keys: [item.value],
          });
        } catch (error) {
          return requestError(error, "herdr pane.send_keys failed");
        }
      }
      commitInputState(paneId, transition.state);
      return okResult();
    });
  };

  const clearPaneTitle = async (paneId: string): Promise<MultiplexerActionResult> => {
    return await runSerialized(paneId, async () => {
      try {
        await client.request(HERDR_METHODS.paneRename, { pane_id: paneId, label: null });
        return okResult();
      } catch (error) {
        return requestError(error, "herdr pane.rename failed");
      }
    });
  };

  const focusPane = async (paneId: string): Promise<MultiplexerActionResult> => {
    return await runSerialized(paneId, async () => {
      try {
        await client.request(HERDR_METHODS.paneFocus, { pane_id: paneId });
        return okResult();
      } catch (error) {
        return requestError(error, "herdr pane.focus failed");
      }
    });
  };

  const killPane = async (paneId: string): Promise<MultiplexerActionResult> => {
    return await runSerialized(paneId, async () => {
      try {
        await client.request(HERDR_METHODS.paneClose, { pane_id: paneId });
        paneInputStates.delete(paneId);
        return okResult();
      } catch (error) {
        return requestError(error, "herdr pane.close failed");
      }
    });
  };

  const killWindow = async (paneId: string, tabId: string): Promise<MultiplexerActionResult> => {
    return await runSerialized(paneId, async () => {
      if (tabId.trim().length === 0) return invalidPayload("tab id is required");
      try {
        await client.request(HERDR_METHODS.tabClose, { tab_id: tabId });
        return okResult();
      } catch (error) {
        return requestError(error, "herdr tab.close failed");
      }
    });
  };

  return {
    sendText,
    sendKeys,
    sendRaw,
    clearPaneTitle,
    focusPane,
    killPane,
    killWindow,
  };
};

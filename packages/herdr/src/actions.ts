import type { AgentMonitorConfig, MultiplexerActionResult } from "@vde-monitor/multiplexer";
import type { AllowedKey, ApiError, RawItem } from "@vde-monitor/shared";
import { allowedKeys, compileDangerPatterns, isDangerousCommand } from "@vde-monitor/shared";

import { HERDR_METHODS } from "./methods";
import type { HerdrRequester } from "./types";

const MAX_TEXT_LENGTH = 2000;
const SEND_CHUNK_SIZE = 16 * 1024;

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

const requestError = (error: unknown, fallbackMessage: string): MultiplexerActionResult => ({
  ok: false,
  error: buildError("INTERNAL", error instanceof Error ? error.message : fallbackMessage),
});

const normalizeText = (value: string) => value.replace(/\r\n/g, "\n");

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
  const pendingCommands = new Map<string, string>();
  const dangerPatterns = compileDangerPatterns(config.dangerCommandPatterns);
  const dangerKeys = new Set(config.dangerKeys);
  const allowedKeySet = new Set(allowedKeys);

  const sendText = async (
    paneId: string,
    text: string,
    enter = true,
  ): Promise<MultiplexerActionResult> => {
    if (!text || text.trim().length === 0) {
      return invalidPayload("text is required");
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return invalidPayload("text too long");
    }

    const normalized = normalizeText(text);
    const pending = pendingCommands.get(paneId) ?? "";
    const combined = `${pending}${normalized}`;
    if (combined.length > MAX_TEXT_LENGTH) {
      pendingCommands.delete(paneId);
      return invalidPayload("text too long");
    }
    if (isDangerousCommand(combined, dangerPatterns)) {
      pendingCommands.delete(paneId);
      return dangerousCommand();
    }

    const chunks = chunkText(normalized);
    for (let index = 0; index < chunks.length; index += 1) {
      const keys = enter && index === chunks.length - 1 ? ["Enter"] : [];
      const result = await sendInput(client, paneId, chunks[index] ?? "", keys);
      if (!result.ok) return result;
    }

    if (enter || normalized.includes("\n")) {
      pendingCommands.delete(paneId);
    } else {
      pendingCommands.set(paneId, combined);
    }
    return okResult();
  };

  const sendKeys = async (paneId: string, keys: AllowedKey[]): Promise<MultiplexerActionResult> => {
    if (keys.length === 0) {
      return invalidPayload("invalid keys");
    }
    if (keys.some((key) => !allowedKeySet.has(key))) {
      return invalidPayload("invalid keys");
    }
    if (keys.some((key) => dangerKeys.has(key))) {
      return dangerousKey();
    }

    try {
      await client.request(HERDR_METHODS.paneSendKeys, { pane_id: paneId, keys });
      return okResult();
    } catch (error) {
      return requestError(error, "herdr pane.send_keys failed");
    }
  };

  const sendRaw = async (
    paneId: string,
    items: RawItem[],
    unsafe = false,
  ): Promise<MultiplexerActionResult> => {
    if (!items || items.length === 0) {
      return invalidPayload("items are required");
    }
    const keys = items.filter((item) => item.kind === "key").map((item) => item.value);
    if (keys.some((key) => !allowedKeySet.has(key))) {
      return invalidPayload("invalid keys");
    }
    if (!unsafe && keys.some((key) => dangerKeys.has(key))) {
      return dangerousKey();
    }

    for (const item of items) {
      if (item.kind === "text") {
        const normalized = normalizeText(item.value);
        for (const chunk of chunkText(normalized)) {
          const result = await sendInput(client, paneId, chunk);
          if (!result.ok) return result;
        }
        continue;
      }
      const result = await sendKeys(paneId, [item.value]);
      if (!result.ok) return result;
    }
    return okResult();
  };

  const clearPaneTitle = async (paneId: string): Promise<MultiplexerActionResult> => {
    try {
      await client.request(HERDR_METHODS.paneRename, { pane_id: paneId, label: null });
      return okResult();
    } catch (error) {
      return requestError(error, "herdr pane.rename failed");
    }
  };

  const focusPane = async (paneId: string): Promise<MultiplexerActionResult> => {
    try {
      await client.request(HERDR_METHODS.paneFocus, { pane_id: paneId });
      return okResult();
    } catch (error) {
      return requestError(error, "herdr pane.focus failed");
    }
  };

  const killPane = async (paneId: string): Promise<MultiplexerActionResult> => {
    try {
      await client.request(HERDR_METHODS.paneClose, { pane_id: paneId });
      return okResult();
    } catch (error) {
      return requestError(error, "herdr pane.close failed");
    }
  };

  const killWindow = async (_paneId: string, tabId: string): Promise<MultiplexerActionResult> => {
    if (tabId.trim().length === 0) {
      return invalidPayload("tab id is required");
    }
    try {
      await client.request(HERDR_METHODS.tabClose, { tab_id: tabId });
      return okResult();
    } catch (error) {
      return requestError(error, "herdr tab.close failed");
    }
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

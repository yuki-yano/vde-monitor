import type { AgentMonitorConfig, MultiplexerActionResult } from "@vde-monitor/multiplexer";
import type { AllowedKey, ApiError, RawItem } from "@vde-monitor/shared";
import { allowedKeys, compileDangerPatterns, isDangerousCommand } from "@vde-monitor/shared";

import { CmuxClientError } from "./client";
import { CMUX_METHODS } from "./methods";
import type { CmuxRequester, CmuxTreeResult } from "./types";

const MAX_TEXT_LENGTH = 2000;
const MAX_PENDING_ENTRIES = 500;
const ENTER_DELAY_MS = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CMUX_FUNCTION_KEY_SEQUENCES = {
  F1: "\u001bOP",
  F2: "\u001bOQ",
  F3: "\u001bOR",
  F4: "\u001bOS",
  F5: "\u001b[15~",
  F6: "\u001b[17~",
  F7: "\u001b[18~",
  F8: "\u001b[19~",
  F9: "\u001b[20~",
  F10: "\u001b[21~",
  F11: "\u001b[23~",
  F12: "\u001b[24~",
} as const satisfies Partial<Record<AllowedKey, string>>;

const CMUX_NAMED_KEYS = {
  Enter: "enter",
  Escape: "escape",
  Tab: "tab",
  BTab: "shift+tab",
  "C-Tab": "ctrl+tab",
  "C-BTab": "ctrl+shift+tab",
  Space: "space",
  BSpace: "backspace",
  Up: "up",
  Down: "down",
  Left: "left",
  Right: "right",
  "C-Up": "ctrl+up",
  "C-Down": "ctrl+down",
  "C-Left": "ctrl+left",
  "C-Right": "ctrl+right",
  "C-Enter": "ctrl+enter",
  "C-Escape": "ctrl+escape",
  Home: "home",
  End: "end",
  PageUp: "pageup",
  PageDown: "pagedown",
  "C-a": "ctrl+a",
  "C-b": "ctrl+b",
  "C-c": "ctrl+c",
  "C-d": "ctrl+d",
  "C-e": "ctrl+e",
  "C-f": "ctrl+f",
  "C-g": "ctrl+g",
  "C-h": "ctrl+h",
  "C-i": "ctrl+i",
  "C-j": "ctrl+j",
  "C-k": "ctrl+k",
  "C-l": "ctrl+l",
  "C-m": "ctrl+m",
  "C-n": "ctrl+n",
  "C-o": "ctrl+o",
  "C-p": "ctrl+p",
  "C-q": "ctrl+q",
  "C-r": "ctrl+r",
  "C-s": "ctrl+s",
  "C-t": "ctrl+t",
  "C-u": "ctrl+u",
  "C-v": "ctrl+v",
  "C-w": "ctrl+w",
  "C-x": "ctrl+x",
  "C-y": "ctrl+y",
  "C-z": "ctrl+z",
  "C-\\": "ctrl+\\",
} as const satisfies Partial<Record<AllowedKey, string>>;

const buildError = (code: ApiError["code"], message: string): ApiError => ({ code, message });
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

const requestError = (error: unknown, fallbackMessage: string): MultiplexerActionResult => {
  const message = error instanceof Error ? error.message : fallbackMessage;
  let code: ApiError["code"] = "INTERNAL";
  if (error instanceof CmuxClientError) {
    if (error.code === "not_found") code = "NOT_FOUND";
    else if (error.code === "invalid_params") code = "INVALID_PAYLOAD";
    else if (
      error.code === "auth_failed" ||
      error.code === "auth_required" ||
      error.code === "auth_unconfigured"
    ) {
      code = "PERMISSION_DENIED";
    } else if (
      error.code === "connection_failed" ||
      error.code === "connection_closed" ||
      error.code === "connection_timeout" ||
      error.code === "timeout" ||
      error.code === "write_failed" ||
      error.code === "protocol_error" ||
      error.code === "client_closed" ||
      error.code === "unavailable"
    ) {
      code = "CMUX_UNAVAILABLE";
    }
  }
  return { ok: false, error: buildError(code, message) };
};

const normalizeText = (value: string): string => value.replace(/\r\n/g, "\n");

const waitForEnterDelay = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ENTER_DELAY_MS));
};

const ensureSurfaceId = (surfaceId: string): MultiplexerActionResult | null =>
  UUID_PATTERN.test(surfaceId) ? null : invalidPayload("invalid cmux surface id");

const findWorkspaceId = (tree: CmuxTreeResult, surfaceId: string): string | null => {
  for (const window of Array.isArray(tree.windows) ? tree.windows : []) {
    for (const workspace of Array.isArray(window.workspaces) ? window.workspaces : []) {
      if (typeof workspace.id !== "string" || !UUID_PATTERN.test(workspace.id)) continue;
      for (const pane of Array.isArray(workspace.panes) ? workspace.panes : []) {
        if (
          (Array.isArray(pane.surfaces) ? pane.surfaces : []).some(
            (surface) => surface.id === surfaceId,
          )
        ) {
          return workspace.id;
        }
      }
    }
  }
  return null;
};

export const createCmuxActions = (client: CmuxRequester, config: AgentMonitorConfig) => {
  const pendingCommands = new Map<string, string>();
  const surfaceQueues = new Map<string, Promise<void>>();
  const dangerPatterns = compileDangerPatterns(config.dangerCommandPatterns);
  const dangerKeys = new Set(config.dangerKeys);
  const allowedKeySet = new Set(allowedKeys);

  const runSerialized = async <T>(surfaceId: string, operation: () => Promise<T>): Promise<T> => {
    const previous = surfaceQueues.get(surfaceId) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    surfaceQueues.set(surfaceId, tail);
    try {
      return await result;
    } finally {
      if (surfaceQueues.get(surfaceId) === tail) surfaceQueues.delete(surfaceId);
    }
  };

  const setPending = (surfaceId: string, value: string): void => {
    if (pendingCommands.size >= MAX_PENDING_ENTRIES && !pendingCommands.has(surfaceId)) {
      const oldest = pendingCommands.keys().next().value;
      if (oldest != null) pendingCommands.delete(oldest);
    }
    pendingCommands.set(surfaceId, value);
  };

  const requestSendText = async (
    surfaceId: string,
    text: string,
  ): Promise<MultiplexerActionResult> => {
    try {
      await client.request(CMUX_METHODS.sendText, { surface_id: surfaceId, text });
      return okResult();
    } catch (error) {
      return requestError(error, "cmux surface.send_text failed");
    }
  };

  const requestSendKey = async (
    surfaceId: string,
    key: AllowedKey,
  ): Promise<MultiplexerActionResult> => {
    const functionSequence =
      CMUX_FUNCTION_KEY_SEQUENCES[key as keyof typeof CMUX_FUNCTION_KEY_SEQUENCES];
    if (functionSequence != null) return await requestSendText(surfaceId, functionSequence);
    const namedKey = CMUX_NAMED_KEYS[key as keyof typeof CMUX_NAMED_KEYS];
    if (namedKey == null) return invalidPayload(`unsupported key: ${key}`);
    try {
      await client.request(CMUX_METHODS.sendKey, { surface_id: surfaceId, key: namedKey });
      return okResult();
    } catch (error) {
      return requestError(error, "cmux surface.send_key failed");
    }
  };

  const sendText = async (
    surfaceId: string,
    text: string,
    enter = true,
  ): Promise<MultiplexerActionResult> => {
    const idError = ensureSurfaceId(surfaceId);
    if (idError != null) return idError;
    if (text.trim().length === 0) return invalidPayload("text is required");
    if (text.length > MAX_TEXT_LENGTH) return invalidPayload("text too long");

    return await runSerialized(surfaceId, async () => {
      const normalized = normalizeText(text);
      const combined = `${pendingCommands.get(surfaceId) ?? ""}${normalized}`;
      if (combined.length > MAX_TEXT_LENGTH) {
        pendingCommands.delete(surfaceId);
        return invalidPayload("text too long");
      }
      if (isDangerousCommand(combined, dangerPatterns)) {
        pendingCommands.delete(surfaceId);
        return dangerousCommand();
      }

      const textResult = await requestSendText(surfaceId, normalized);
      if (!textResult.ok) return textResult;
      if (enter) {
        setPending(surfaceId, combined);
        // Keep parity with the tmux and WezTerm backends. A cmux response confirms
        // that input was accepted, but the target TUI may not have consumed it yet.
        await waitForEnterDelay();
        const enterResult = await requestSendKey(surfaceId, "Enter");
        if (!enterResult.ok) return enterResult;
      }

      if (enter || normalized.includes("\n")) pendingCommands.delete(surfaceId);
      else setPending(surfaceId, combined);
      return okResult();
    });
  };

  const sendKeys = async (
    surfaceId: string,
    keys: AllowedKey[],
  ): Promise<MultiplexerActionResult> => {
    const idError = ensureSurfaceId(surfaceId);
    if (idError != null) return idError;
    if (keys.length === 0 || keys.some((key) => !allowedKeySet.has(key))) {
      return invalidPayload("invalid keys");
    }
    if (keys.some((key) => dangerKeys.has(key))) return dangerousKey();
    return await runSerialized(surfaceId, async () => {
      for (const key of keys) {
        const result = await requestSendKey(surfaceId, key);
        if (!result.ok) return result;
      }
      return okResult();
    });
  };

  const sendRaw = async (
    surfaceId: string,
    items: RawItem[],
    unsafe = false,
  ): Promise<MultiplexerActionResult> => {
    const idError = ensureSurfaceId(surfaceId);
    if (idError != null) return idError;
    if (items.length === 0) return invalidPayload("items are required");
    const keys = items.filter((item) => item.kind === "key").map((item) => item.value);
    if (keys.some((key) => !allowedKeySet.has(key))) return invalidPayload("invalid keys");
    if (!unsafe && keys.some((key) => dangerKeys.has(key))) return dangerousKey();

    return await runSerialized(surfaceId, async () => {
      for (const item of items) {
        if (item.kind === "text") {
          if (item.value.length > MAX_TEXT_LENGTH) return invalidPayload("text too long");
          const result = await requestSendText(surfaceId, normalizeText(item.value));
          if (!result.ok) return result;
        } else {
          const result = await requestSendKey(surfaceId, item.value);
          if (!result.ok) return result;
        }
      }
      return okResult();
    });
  };

  const runSurfaceAction = async (
    method: string,
    surfaceId: string,
    extraParams: Record<string, unknown> = {},
  ): Promise<MultiplexerActionResult> => {
    const idError = ensureSurfaceId(surfaceId);
    if (idError != null) return idError;
    try {
      await client.request(method, { surface_id: surfaceId, ...extraParams });
      return okResult();
    } catch (error) {
      return requestError(error, `cmux ${method} failed`);
    }
  };

  const clearPaneTitle = async (surfaceId: string): Promise<MultiplexerActionResult> =>
    await runSurfaceAction(CMUX_METHODS.tabAction, surfaceId, { action: "clear_name" });

  const focusPane = async (surfaceId: string): Promise<MultiplexerActionResult> =>
    await runSurfaceAction(CMUX_METHODS.focus, surfaceId);

  const killPane = async (surfaceId: string): Promise<MultiplexerActionResult> =>
    await runSurfaceAction(CMUX_METHODS.closeSurface, surfaceId);

  const killWindow = async (surfaceId: string): Promise<MultiplexerActionResult> => {
    const idError = ensureSurfaceId(surfaceId);
    if (idError != null) return idError;
    try {
      const tree = await client.request<CmuxTreeResult>(CMUX_METHODS.tree, { all_windows: true });
      const workspaceId = findWorkspaceId(tree, surfaceId);
      if (workspaceId == null) {
        return { ok: false, error: buildError("NOT_FOUND", "cmux workspace not found") };
      }
      await client.request(CMUX_METHODS.closeWorkspace, { workspace_id: workspaceId });
      return okResult();
    } catch (error) {
      return requestError(error, "cmux workspace.close failed");
    }
  };

  return { sendText, sendKeys, sendRaw, clearPaneTitle, focusPane, killPane, killWindow };
};

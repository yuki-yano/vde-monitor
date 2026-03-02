export type SummarySourceAgent = "codex" | "claude";

type HookPayload = Record<string, unknown>;

const hasOwn = (payload: HookPayload, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(payload, key);

export const readOptionalString = (value: unknown) => (typeof value === "string" ? value : null);

export const readStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
};

export const isLikelyJsonObjectText = (value: string): boolean => {
  const trimmed = value.trim();
  return trimmed.startsWith("{") && trimmed.endsWith("}");
};

const isCodexPayloadLike = (payload: HookPayload): boolean => {
  if (
    hasOwn(payload, "turn_id") ||
    hasOwn(payload, "turn-id") ||
    hasOwn(payload, "input-messages") ||
    hasOwn(payload, "last-assistant-message")
  ) {
    return true;
  }
  const type = readOptionalString(payload.type);
  return type?.startsWith("agent-") ?? false;
};

const isClaudePayloadLike = (payload: HookPayload): boolean =>
  hasOwn(payload, "session_id") ||
  hasOwn(payload, "hook_event_name") ||
  hasOwn(payload, "transcript_path") ||
  hasOwn(payload, "notification_type") ||
  hasOwn(payload, "tmux_pane") ||
  hasOwn(payload, "tty");

export const detectPayloadSourceAgent = (
  payload: HookPayload,
  fallback: SummarySourceAgent,
): SummarySourceAgent => {
  const codexLike = isCodexPayloadLike(payload);
  const claudeLike = isClaudePayloadLike(payload);
  if (codexLike === claudeLike) {
    return fallback;
  }
  return codexLike ? "codex" : "claude";
};

export const extractCodexTurnId = (payload: HookPayload): string | null =>
  readOptionalString(payload.turn_id) ?? readOptionalString(payload["turn-id"]);

export const extractCodexAssistantMessage = (payload: HookPayload): string | null => {
  const lastAssistantMessage = readOptionalString(payload["last-assistant-message"]);
  if (lastAssistantMessage != null) {
    return lastAssistantMessage;
  }
  const firstInputMessage = readStringArray(payload["input-messages"])[0] ?? null;
  return firstInputMessage;
};

export const extractEventTimestamp = (payload: HookPayload): string | null => {
  const candidates = [
    readOptionalString(payload.ts),
    readOptionalString(payload.timestamp),
    readOptionalString(payload.event_at),
  ];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    if (Number.isFinite(Date.parse(candidate))) {
      return candidate;
    }
  }
  return null;
};

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

const readOptionalRecord = (value: unknown): HookPayload | null => {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as HookPayload;
};

export const isLikelyJsonObjectText = (value: string): boolean => {
  const trimmed = value.trim();
  return trimmed.startsWith("{") && trimmed.endsWith("}");
};

const isCodexPayloadLike = (payload: HookPayload): boolean => {
  if (
    hasOwn(payload, "turn_id") ||
    hasOwn(payload, "turn-id") ||
    hasOwn(payload, "thread_id") ||
    hasOwn(payload, "thread-id") ||
    hasOwn(payload, "threadId") ||
    hasOwn(payload, "input-messages") ||
    hasOwn(payload, "last-assistant-message") ||
    hasOwn(payload, "last_agent_message") ||
    hasOwn(payload, "message") ||
    hasOwn(payload, "messages")
  ) {
    return true;
  }
  const type = readOptionalString(payload.type);
  return type?.startsWith("agent-") || type?.startsWith("task_") || false;
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

export const extractCodexThreadId = (payload: HookPayload): string | null =>
  readOptionalString(payload.thread_id) ??
  readOptionalString(payload["thread-id"]) ??
  readOptionalString(payload.threadId);

export const extractCodexSessionId = (payload: HookPayload): string | null =>
  extractCodexTurnId(payload) ?? extractCodexThreadId(payload);

const extractTextFromMessageContent = (content: unknown): string | null => {
  const directText = readOptionalString(content);
  if (directText != null) {
    return directText;
  }
  if (!Array.isArray(content)) {
    return null;
  }
  for (const part of content) {
    if (typeof part === "string") {
      return part;
    }
    const record = readOptionalRecord(part);
    if (!record) {
      continue;
    }
    const text = readOptionalString(record.text);
    if (text != null) {
      return text;
    }
  }
  return null;
};

const extractAssistantTextFromMessages = (messages: unknown): string | null => {
  if (!Array.isArray(messages)) {
    return null;
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const entry = readOptionalRecord(messages[index]);
    if (!entry) {
      continue;
    }
    if (readOptionalString(entry.role) !== "assistant") {
      continue;
    }
    const text = extractTextFromMessageContent(entry.content);
    if (text != null) {
      return text;
    }
  }
  return null;
};

const extractAssistantTextFromTranscript = (transcript: unknown): string | null => {
  const transcriptRecord = readOptionalRecord(transcript);
  const message = readOptionalRecord(transcriptRecord?.message);
  if (!message) {
    return null;
  }
  const content = message.content;
  if (!Array.isArray(content) || content.length === 0) {
    return extractTextFromMessageContent(content);
  }
  const lastPart = content[content.length - 1];
  const lastPartRecord = readOptionalRecord(lastPart);
  if (!lastPartRecord) {
    return typeof lastPart === "string" ? lastPart : null;
  }
  return readOptionalString(lastPartRecord.text);
};

export const extractCodexAssistantMessage = (payload: HookPayload): string | null => {
  const lastAgentMessage = readOptionalString(payload.last_agent_message);
  if (lastAgentMessage != null) {
    return lastAgentMessage;
  }
  const lastAssistantMessage = readOptionalString(payload["last-assistant-message"]);
  if (lastAssistantMessage != null) {
    return lastAssistantMessage;
  }
  const directMessage = readOptionalString(payload.message);
  if (directMessage != null) {
    return directMessage;
  }
  const assistantText = extractAssistantTextFromMessages(payload.messages);
  if (assistantText != null) {
    return assistantText;
  }
  const transcriptAssistantText = extractAssistantTextFromTranscript(payload.transcript);
  if (transcriptAssistantText != null) {
    return transcriptAssistantText;
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

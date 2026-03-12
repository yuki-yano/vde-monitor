import { describe, expect, it } from "vitest";

import {
  detectPayloadSourceAgent,
  extractCodexAssistantMessage,
  extractCodexSessionId,
  extractCodexThreadId,
  extractCodexTurnId,
  extractEventTimestamp,
  isLikelyJsonObjectText,
} from "./payload-source";

const currentCodexTaskCompletePayload = {
  type: "task_complete",
  turn_id: "019ccc98-0c75-7bc3-85ce-827942840e81",
  thread_id: "019ccc98-0c45-7ff3-a5b7-cfa02575a06e",
  last_agent_message: "PoC 用 resolver API は以下が最小です。",
} as const;

describe("payload source helper", () => {
  it("detects codex payload markers", () => {
    expect(
      detectPayloadSourceAgent(
        {
          type: "agent-turn-complete",
          "last-assistant-message": "done",
          turn_id: "turn-1",
        },
        "claude",
      ),
    ).toBe("codex");
  });

  it("detects claude payload markers", () => {
    expect(
      detectPayloadSourceAgent(
        {
          hook_event_name: "Stop",
          session_id: "session-1",
          tmux_pane: "%1",
        },
        "codex",
      ),
    ).toBe("claude");
  });

  it("returns fallback when payload matches both codex and claude markers", () => {
    expect(
      detectPayloadSourceAgent(
        {
          turn_id: "turn-1",
          session_id: "session-1",
          hook_event_name: "Stop",
        },
        "codex",
      ),
    ).toBe("codex");
  });

  it("detects current codex task_complete payload markers", () => {
    expect(detectPayloadSourceAgent(currentCodexTaskCompletePayload, "claude")).toBe("codex");
  });

  it("extracts codex assistant message with fallback to first input", () => {
    expect(
      extractCodexAssistantMessage({
        "last-assistant-message": "assistant result",
      }),
    ).toBe("assistant result");
    expect(
      extractCodexAssistantMessage({
        "input-messages": ["first input", "second input"],
      }),
    ).toBe("first input");
  });

  it("extracts codex assistant message from current task_complete payload", () => {
    expect(extractCodexAssistantMessage(currentCodexTaskCompletePayload)).toBe(
      "PoC 用 resolver API は以下が最小です。",
    );
  });

  it("extracts codex assistant message from messages array", () => {
    expect(
      extractCodexAssistantMessage({
        messages: [
          { role: "user", content: "first question" },
          {
            role: "assistant",
            content: [{ type: "text", text: "latest assistant answer" }],
          },
        ],
      }),
    ).toBe("latest assistant answer");
  });

  it("preserves explicit empty assistant message", () => {
    expect(
      extractCodexAssistantMessage({
        "last-assistant-message": "",
        "input-messages": ["first input"],
      }),
    ).toBe("");
  });

  it("extracts codex turn id from turn_id and turn-id", () => {
    expect(
      extractCodexTurnId({
        turn_id: "turn-1",
      }),
    ).toBe("turn-1");
    expect(
      extractCodexTurnId({
        "turn-id": "turn-2",
      }),
    ).toBe("turn-2");
  });

  it("extracts codex thread id from supported keys", () => {
    expect(
      extractCodexThreadId({
        thread_id: "thread-1",
      }),
    ).toBe("thread-1");
    expect(
      extractCodexThreadId({
        "thread-id": "thread-2",
      }),
    ).toBe("thread-2");
    expect(
      extractCodexThreadId({
        threadId: "thread-3",
      }),
    ).toBe("thread-3");
  });

  it("extracts codex session id preferring turn id then thread id", () => {
    expect(extractCodexSessionId(currentCodexTaskCompletePayload)).toBe(
      "019ccc98-0c75-7bc3-85ce-827942840e81",
    );
    expect(
      extractCodexSessionId({
        thread_id: "019ccc98-0c45-7ff3-a5b7-cfa02575a06e",
      }),
    ).toBe("019ccc98-0c45-7ff3-a5b7-cfa02575a06e");
  });

  it("recognizes json object payload text", () => {
    expect(isLikelyJsonObjectText('{"type":"agent-turn-complete"}')).toBe(true);
    expect(isLikelyJsonObjectText("Stop")).toBe(false);
  });

  it("extracts event timestamp from supported fields", () => {
    expect(extractEventTimestamp({ ts: "2026-03-02T00:00:00.000Z" })).toBe(
      "2026-03-02T00:00:00.000Z",
    );
    expect(extractEventTimestamp({ timestamp: "2026-03-02T00:00:01.000Z" })).toBe(
      "2026-03-02T00:00:01.000Z",
    );
    expect(extractEventTimestamp({ event_at: "2026-03-02T00:00:02.000Z" })).toBe(
      "2026-03-02T00:00:02.000Z",
    );
    expect(extractEventTimestamp({ ts: "invalid-ts" })).toBeNull();
  });
});

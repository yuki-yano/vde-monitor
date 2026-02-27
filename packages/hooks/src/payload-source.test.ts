import { describe, expect, it } from "vitest";

import {
  detectPayloadSourceAgent,
  extractCodexAssistantMessage,
  extractCodexTurnId,
  isLikelyJsonObjectText,
} from "./payload-source";

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

  it("recognizes json object payload text", () => {
    expect(isLikelyJsonObjectText('{"type":"agent-turn-complete"}')).toBe(true);
    expect(isLikelyJsonObjectText("Stop")).toBe(false);
  });
});

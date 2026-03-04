import { estimateState } from "@vde-monitor/agents";
import { describe, expect, it } from "vitest";

import { estimateSessionState } from "./session-state";

describe("estimateSessionState", () => {
  it("caps running threshold at 10 seconds for any agent", () => {
    for (const agent of ["codex", "claude"] as const) {
      const args = {
        agent,
        paneDead: false,
        lastOutputAt: new Date().toISOString(),
        hookState: null,
        codexQuestionPromptActive: false,
        activity: { runningThresholdMs: 20000, inactiveThresholdMs: 60000 },
      };
      const result = estimateSessionState(args);
      const expected = estimateState({
        paneDead: args.paneDead,
        lastOutputAt: args.lastOutputAt,
        hookState: args.hookState,
        codexQuestionPromptActive: false,
        thresholds: { runningThresholdMs: 10000, inactiveThresholdMs: 60000 },
      });
      expect(result).toEqual(expected);
    }
  });

  it("returns poll:codex_question_prompt only for codex agent", () => {
    const codexResult = estimateSessionState({
      agent: "codex",
      paneDead: false,
      lastOutputAt: "2026-01-01T00:00:00.000Z",
      hookState: null,
      codexQuestionPromptActive: true,
      activity: { runningThresholdMs: 5000 },
    });
    expect(codexResult).toEqual({
      state: "WAITING_PERMISSION",
      reason: "poll:codex_question_prompt",
    });

    const claudeResult = estimateSessionState({
      agent: "claude",
      paneDead: false,
      lastOutputAt: "2026-01-01T00:00:00.000Z",
      hookState: null,
      codexQuestionPromptActive: true,
      activity: { runningThresholdMs: 5000 },
    });
    expect(claudeResult).not.toEqual({
      state: "WAITING_PERMISSION",
      reason: "poll:codex_question_prompt",
    });

    const unknownResult = estimateSessionState({
      agent: "unknown",
      paneDead: false,
      lastOutputAt: "2026-01-01T00:00:00.000Z",
      hookState: null,
      codexQuestionPromptActive: true,
      activity: { runningThresholdMs: 5000 },
    });
    expect(unknownResult).not.toEqual({
      state: "WAITING_PERMISSION",
      reason: "poll:codex_question_prompt",
    });
  });

  it("keeps hook:permission_prompt priority over codex question prompt", () => {
    const result = estimateSessionState({
      agent: "codex",
      paneDead: false,
      lastOutputAt: "2026-01-01T00:00:00.000Z",
      hookState: {
        state: "WAITING_PERMISSION",
        reason: "hook:permission_prompt",
        at: "2026-01-01T00:00:01.000Z",
      },
      codexQuestionPromptActive: true,
      activity: { runningThresholdMs: 5000 },
    });
    expect(result).toEqual({
      state: "WAITING_PERMISSION",
      reason: "hook:permission_prompt",
    });
  });
});

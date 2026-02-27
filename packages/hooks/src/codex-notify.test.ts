import { describe, expect, it } from "vitest";

import {
  buildFallbackSummary,
  buildSummaryPrompt,
  normalizeSummary,
  parseNotifyPayload,
  parseRuntimeArgs,
  truncateOneLine,
} from "./codex-notify";

describe("codex notify helper", () => {
  it("parses plain payload argument", () => {
    const parsed = parseRuntimeArgs(['{"type":"agent-turn-complete"}']);

    expect(parsed.payloadRaw).toBe('{"type":"agent-turn-complete"}');
    expect(parsed.forwardCommandArgv).toEqual([]);
    expect(parsed.errorMessage).toBeNull();
  });

  it("parses forward command after -- separator", () => {
    const parsed = parseRuntimeArgs([
      "--",
      "/usr/local/bin/current-notify",
      "--flag",
      '{"type":"agent-turn-complete"}',
    ]);

    expect(parsed.forwardCommandArgv).toEqual(["/usr/local/bin/current-notify", "--flag"]);
    expect(parsed.payloadRaw).toBe('{"type":"agent-turn-complete"}');
    expect(parsed.errorMessage).toBeNull();
  });

  it("supports --forward alias", () => {
    const parsed = parseRuntimeArgs([
      "--forward",
      "--",
      "/usr/local/bin/current-notify",
      '{"type":"agent-turn-complete"}',
    ]);

    expect(parsed.forwardCommandArgv).toEqual(["/usr/local/bin/current-notify"]);
    expect(parsed.errorMessage).toBeNull();
  });

  it("returns argument error for unknown options", () => {
    const parsed = parseRuntimeArgs(["--unknown", '{"type":"agent-turn-complete"}']);

    expect(parsed.errorMessage).toMatch(/Unknown arguments/);
  });

  it("builds fallback summary preferring assistant message", () => {
    const summary = buildFallbackSummary({
      type: "agent-turn-complete",
      cwd: "/Users/example/workspace/repo-a",
      "input-messages": ["Update README and run tests"],
      "last-assistant-message": "README update done. Tests passed.",
    });

    expect(summary.paneTitle).toBe("README update done. Tests passed.");
    expect(summary.notificationTitle).toBe("Update README and run tests");
    expect(summary.notificationBody).toBe("README update done. Tests passed.");
  });

  it("normalizes llm output and falls back when fields are missing", () => {
    const summary = normalizeSummary(
      {
        pane_title: "  short title  ",
      },
      {
        type: "agent-turn-complete",
        cwd: "/Users/example/workspace/repo-b",
        "input-messages": ["Fix flaky test for parser"],
      },
    );

    expect(summary).toEqual({
      paneTitle: "short title",
      notificationTitle: "Fix flaky test for parser",
      notificationBody: "Fix flaky test for parser",
    });
  });

  it("parses notify payload json", () => {
    expect(parseNotifyPayload('{"type":"agent-turn-complete"}')).toEqual({
      type: "agent-turn-complete",
    });
    expect(parseNotifyPayload("[]")).toBeNull();
    expect(parseNotifyPayload("invalid")).toBeNull();
  });

  it("builds prompt including payload json", () => {
    const prompt = buildSummaryPrompt('{"type":"agent-turn-complete"}');
    expect(prompt).toContain("Notify Payload");
    expect(prompt).toContain('{"type":"agent-turn-complete"}');
    expect(prompt).toContain("出力言語は日本語");
    expect(prompt).toContain("簡潔な日本語");
    expect(prompt).toContain("プロジェクト名・リポジトリ名・パス");
    expect(prompt).toContain("turn id");
  });

  it("builds japanese fallback when only cwd is available", () => {
    const summary = buildFallbackSummary({
      type: "agent-turn-complete",
      cwd: "/Users/example/workspace/repo-c",
    });

    expect(summary.paneTitle).toBe("repo-c");
    expect(summary.notificationTitle).toBe("repo-c");
    expect(summary.notificationBody).toBe("repo-c でタスクが完了しました");
  });

  it("truncates one line with ascii ellipsis", () => {
    expect(truncateOneLine("  abc   def  ", 6)).toBe("abc...");
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildFallbackSummary,
  buildSummaryPrompt,
  extractAssistantTextFromTranscriptEntry,
  extractLatestAssistantMessageFromTranscript,
  normalizeSummary,
  parseSummaryOutputFromClaudeJson,
  truncateOneLine,
} from "./claude-summary";

describe("claude summary helper", () => {
  it("extracts assistant text from transcript entry", () => {
    const entry = {
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "internal" },
          { type: "text", text: "README update done." },
        ],
      },
    };

    expect(extractAssistantTextFromTranscriptEntry(entry)).toBe("README update done.");
  });

  it("extracts latest assistant message from transcript file", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vde-monitor-claude-summary-"));
    const transcriptPath = path.join(tempDir, "session.jsonl");

    fs.writeFileSync(
      transcriptPath,
      [
        JSON.stringify({ type: "user", message: { role: "user", content: "first" } }),
        JSON.stringify({
          type: "assistant",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "first response" }],
          },
        }),
        JSON.stringify({ type: "user", message: { role: "user", content: "second" } }),
        JSON.stringify({
          type: "assistant",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "second response" }],
          },
        }),
      ].join("\n") + "\n",
      "utf8",
    );

    try {
      expect(extractLatestAssistantMessageFromTranscript(transcriptPath)).toBe("second response");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("parses structured_output envelope", () => {
    const parsed = parseSummaryOutputFromClaudeJson(
      JSON.stringify({
        type: "result",
        structured_output: {
          pane_title: "README done",
          notification_title: "README update",
          notification_body: "README update finished",
        },
      }),
    );

    expect(parsed).toEqual({
      pane_title: "README done",
      notification_title: "README update",
      notification_body: "README update finished",
    });
  });

  it("normalizes llm output and falls back missing fields", () => {
    const fallback = buildFallbackSummary({
      assistantMessage: "tests passed",
      cwd: "/Users/example/repo-a",
      sessionId: "session-1",
    });

    const summary = normalizeSummary(
      {
        pane_title: "  short title  ",
      },
      fallback,
    );

    expect(summary).toEqual({
      paneTitle: "short title",
      notificationTitle: fallback.notificationTitle,
      notificationBody: fallback.notificationBody,
    });
  });

  it("builds fallback summary from cwd/session", () => {
    const summary = buildFallbackSummary({
      assistantMessage: null,
      cwd: "/Users/example/work/repo-b",
      sessionId: "session-2",
    });

    expect(summary.paneTitle).toBe("repo-b");
    expect(summary.notificationTitle).toBe("repo-b");
    expect(summary.notificationBody).toBe("repo-b でタスクが完了しました");
  });

  it("builds prompt including context and assistant text", () => {
    const prompt = buildSummaryPrompt({
      assistantMessage: "fix finished",
      cwd: "/Users/example/repo-c",
      sessionId: "session-3",
    });

    expect(prompt).toContain("Latest assistant output");
    expect(prompt).toContain("fix finished");
    expect(prompt).toContain("session-3");
    expect(prompt).toContain("Write all output fields in English.");
    expect(prompt).toContain("Use concise, concrete wording.");
    expect(prompt).toContain("project/repository/path/session IDs/turn IDs");
  });

  it("builds japanese-language instruction when requested", () => {
    const prompt = buildSummaryPrompt(
      {
        assistantMessage: "fix finished",
        cwd: "/Users/example/repo-c",
        sessionId: "session-3",
      },
      "ja",
    );

    expect(prompt).toContain("Write all output fields in Japanese.");
  });

  it("truncates oversized assistant message in prompt", () => {
    const longMessage = "x".repeat(4100);
    const prompt = buildSummaryPrompt({
      assistantMessage: longMessage,
      cwd: "/Users/example/repo-c",
      sessionId: "session-4",
    });

    expect(prompt).toContain("...(truncated)");
    const latestSection = prompt.split("## Latest assistant output\n")[1] ?? "";
    expect(latestSection.length).toBeLessThanOrEqual(4_020);
  });

  it("truncates one line with ascii ellipsis", () => {
    expect(truncateOneLine("  abc   def  ", 6)).toBe("abc...");
  });
});

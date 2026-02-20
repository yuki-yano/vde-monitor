import { describe, expect, it } from "vitest";

import { classifySmartWrapLines } from "./smart-wrap-classify";

describe("classifySmartWrapLines", () => {
  it("classifies codex diff-like block lines as no-wrap block", () => {
    const lines = [
      "• Edited tmp/file.md (+12 -2)",
      "    358  before",
      "    359 - before",
      "    360 + after",
      "    ⋮",
      "plain line",
    ];
    const result = classifySmartWrapLines(lines, "codex");
    expect(result.map((item) => item.rule)).toEqual([
      "codex-diff-block",
      "codex-diff-block",
      "codex-diff-block",
      "codex-diff-block",
      "codex-diff-block",
      "statusline-preserve",
    ]);
  });

  it("keeps wrapped fragments between codex diff rows in no-wrap block", () => {
    const lines = [
      "• Edited apps/web/src/pages/SessionDetail/components/ScreenPanel.test.tsx (+12 -2)",
      '  112 - it("uses virtuoso rendering path when',
      'smart wrap is enabled", () => {',
      '  112 + it("uses non-virtualized rendering path when',
      'smart wrap is enabled", () => {',
      "  113    const state = buildState({",
      "43% left",
    ];
    const result = classifySmartWrapLines(lines, "codex");
    expect(result.map((item) => item.rule)).toEqual([
      "codex-diff-block",
      "codex-diff-block",
      "codex-diff-block",
      "codex-diff-block",
      "codex-diff-block",
      "codex-diff-block",
      "statusline-preserve",
    ]);
  });

  it("keeps wrapped fragments when codex continuation rows have no leading indent", () => {
    const lines = [
      "• Edited apps/web/src/pages/SessionDetail/smart-wrap-classify.ts (+14 -1)",
      "68 +const stripInvisibleChars = (value: string)",
      '=> value.replace(/[\\u200B\\uFEFF]/g, "");',
      "69 +",
      "70 +const isBlankLikeLine = (value: string) =>",
      "stripInvisibleChars(value).trim().length === 0;",
      "71 +",
      "72    const detectBlockLineSet = (",
      "43% left",
    ];
    const result = classifySmartWrapLines(lines, "codex");
    expect(result.map((item) => item.rule)).toEqual([
      "codex-diff-block",
      "codex-diff-block",
      "codex-diff-block",
      "codex-diff-block",
      "codex-diff-block",
      "codex-diff-block",
      "codex-diff-block",
      "codex-diff-block",
      "statusline-preserve",
    ]);
  });

  it("accepts codex diff start line without (+x -y) suffix", () => {
    const lines = [
      "• Edited apps/web/src/pages/SessionDetail/components/ScreenPanel.tsx",
      "  10 + const value = 1;",
      "43% left",
    ];
    const result = classifySmartWrapLines(lines, "codex");
    expect(result.map((item) => item.rule)).toEqual([
      "codex-diff-block",
      "codex-diff-block",
      "statusline-preserve",
    ]);
  });

  it("does not bleed codex diff block across blank-like and divider lines", () => {
    const lines = [
      "• Edited apps/web/src/example.ts (+1 -1)",
      "  10 - before",
      "  10 + after",
      "\u200B",
      "────────────────────────────────",
      "• normal commentary",
      "  20 + looks-like-continuation-without-start",
      "43% left",
    ];
    const result = classifySmartWrapLines(lines, "codex");
    expect(result[0]?.rule).toBe("codex-diff-block");
    expect(result[1]?.rule).toBe("codex-diff-block");
    expect(result[2]?.rule).toBe("codex-diff-block");
    expect(result[3]?.rule).toBe("default");
    expect(result[4]?.rule).toBe("divider-clip");
    expect(result[5]?.rule).not.toBe("codex-diff-block");
    expect(result[6]?.rule).not.toBe("codex-diff-block");
    expect(result[7]?.rule).toBe("statusline-preserve");
  });

  it("classifies claude tool block lines with strict continuation rules", () => {
    const lines = ["⏺ Bash(ls -la)", "  ⎿ Done", "      1 line", "      ", "next line"];
    const result = classifySmartWrapLines(lines, "claude");
    expect(result.map((item) => item.rule)).toEqual([
      "claude-tool-block",
      "claude-tool-block",
      "claude-tool-block",
      "claude-tool-block",
      "statusline-preserve",
    ]);
  });

  it("classifies codex startup banner lines as preserve block", () => {
    const lines = [
      "╭───────────────────────────────────────────────────────╮",
      "│ >_ OpenAI Codex (v0.104.0)                            │",
      "│ model:     gpt-5.3-codex xhigh   /model to change     │",
      "│ directory: ~/repos/feature/tmux-launch-agent-window   │",
      "╰───────────────────────────────────────────────────────╯",
      "43% left",
    ];
    const result = classifySmartWrapLines(lines, "codex");
    expect(result.map((item) => item.rule)).toEqual([
      "startup-banner-block",
      "startup-banner-block",
      "startup-banner-block",
      "startup-banner-block",
      "startup-banner-block",
      "statusline-preserve",
    ]);
  });

  it("classifies claude startup banner lines as preserve block", () => {
    const lines = [
      "╭─── Claude Code v2.1.45 ───────────────────────────────╮",
      "│ Welcome back Yano!                 │ Tips for getting started │",
      "│ Sonnet 4.6 · Claude Max · account  │ /resume for more         │",
      "╰────────────────────────────────────────────────────────╯",
      "❯ ",
    ];
    const result = classifySmartWrapLines(lines, "claude");
    expect(result.map((item) => item.rule)).toEqual([
      "startup-banner-block",
      "startup-banner-block",
      "startup-banner-block",
      "startup-banner-block",
      "statusline-preserve",
    ]);
  });

  it("does not treat broken startup banner fragments as preserve block", () => {
    const lines = ["╭────────────╮", "broken line", "╰────────────╯", "43% left"];
    const result = classifySmartWrapLines(lines, "codex");
    expect(result[0]?.rule).toBe("default");
    expect(result[1]?.rule).toBe("default");
    expect(result[2]?.rule).toBe("default");
    expect(result[3]?.rule).toBe("statusline-preserve");
  });

  it("detects list long-word without filepath-specific dependency", () => {
    const lines = ["- supercalifragilisticexpialidocious token", "43% left"];
    const result = classifySmartWrapLines(lines, "codex");
    expect(result[0]).toEqual({
      rule: "list-long-word",
      indentCh: 2,
      listPrefix: "- ",
    });
  });

  it("detects list long-word for unknown agent", () => {
    const lines = [
      "- /private/var/folders/20/st1j3f895hl7lb5thkpbfs680000gn/T/vde-monitor/attachments/%2512/mobile-20260219-031324-86676e55.png",
      "line 2",
    ];
    const result = classifySmartWrapLines(lines, "unknown");
    expect(result[0]).toEqual({
      rule: "list-long-word",
      indentCh: 2,
      listPrefix: "- ",
    });
  });

  it("detects long token after prompt marker", () => {
    const lines = [
      "› /private/var/folders/20/st1j3f895hl7lb5thkpbfs680000gn/T/vde-monitor/attachments/%2512/mobile-20260219-031324-86676e55.png",
      "line 2",
    ];
    const result = classifySmartWrapLines(lines, "unknown");
    expect(result[0]).toEqual({
      rule: "list-long-word",
      indentCh: 2,
      listPrefix: "› ",
    });
  });

  it("keeps table preserve priority over label-indent", () => {
    const lines = ['<span class="vde-unicode-table-wrap">Search header</span>', "43% left"];
    const result = classifySmartWrapLines(lines, "codex");
    expect(result[0]?.rule).toBe("table-preserve");
  });

  it("switches divider classifier by agent", () => {
    const divider = "────────────────────────────────";
    expect(classifySmartWrapLines([divider, "❯ "], "claude")[0]?.rule).toBe("divider-clip");
    expect(classifySmartWrapLines([divider], "unknown")[0]?.rule).toBe("default");
  });

  it("treats codex worked-for separator as divider-clip", () => {
    const lines = ["─ Worked for 1m 17s ──────────────────────────────", "43% left"];
    const result = classifySmartWrapLines(lines, "codex");
    expect(result[0]?.rule).toBe("divider-clip");
  });

  it("marks the last line as statusline-preserve for codex", () => {
    const lines = ["Search long-token-example", "43% left"];
    const result = classifySmartWrapLines(lines, "codex");
    expect(result[0]?.rule).toBe("label-indent");
    expect(result[1]?.rule).toBe("statusline-preserve");
  });

  it("marks the last line as statusline-preserve for claude", () => {
    const lines = ["⏺ Read 1 file", "❯ "];
    const result = classifySmartWrapLines(lines, "claude");
    expect(result[0]?.rule).toBe("claude-tool-block");
    expect(result[1]?.rule).toBe("statusline-preserve");
  });

  it("classifies trailing multiline claude statusline after prompt divider", () => {
    const lines = [
      "✻ Worked for 39s",
      "────────────────────────────────────────────────────────",
      "❯ ",
      "────────────────────────────────────────────────────────",
      "  [Opus 4.6 | Max] │ dotfiles git:(main*)",
      "  Context ███░░░░░░░░ 25% │ Usage █░░░░░░░░░░ 5%",
      "  3 MCPs",
      "  ✓ Bash ×11 | ✓ Read ×6 | ✓ Write ×2 | ✓ Edit ×1",
      "  ⏵⏵ bypass permissions on (shift+tab to cycle) · 15 files +40 -23",
    ];
    const result = classifySmartWrapLines(lines, "claude");
    expect(result.map((item) => item.rule)).toEqual([
      "default",
      "divider-clip",
      "statusline-preserve",
      "divider-clip",
      "statusline-preserve",
      "statusline-preserve",
      "statusline-preserve",
      "statusline-preserve",
      "statusline-preserve",
    ]);
  });

  it("does not mark prompt line when trailing divider statusline block is absent", () => {
    const lines = ["❯ run tests", "plain output", "tail"];
    const result = classifySmartWrapLines(lines, "claude");
    expect(result[0]?.rule).toBe("default");
    expect(result[1]?.rule).toBe("default");
    expect(result[2]?.rule).toBe("statusline-preserve");
  });

  it("does not mark last line for unknown agent", () => {
    const lines = ["line 1", "line 2"];
    const result = classifySmartWrapLines(lines, "unknown");
    expect(result[1]?.rule).toBe("default");
  });
});

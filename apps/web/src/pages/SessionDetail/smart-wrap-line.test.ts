import { describe, expect, it } from "vitest";

import { classifySmartWrapLines } from "./smart-wrap-classify";
import { decorateSmartWrapLine } from "./smart-wrap-line";

const parseLine = (lineHtml: string) =>
  new DOMParser().parseFromString(`<div>${lineHtml}</div>`, "text/html").body.firstElementChild;

describe("decorateSmartWrapLine", () => {
  it("adds preserve-row class for table lines", () => {
    const line = '<span class="vde-unicode-table-wrap">table</span>';
    const classification = classifySmartWrapLines([line, "43% left"], "codex")[0]!;
    const decorated = decorateSmartWrapLine(line, classification);
    expect(decorated.className).toBe("vde-smart-wrap-preserve-row");
  });

  it("adds preserve-row class for startup banner lines", () => {
    const line = "╭───────────────────────────────╮";
    const nextLine = "│ >_ OpenAI Codex (v0.104.0)    │";
    const bottomLine = "╰───────────────────────────────╯";
    const classification = classifySmartWrapLines(
      [line, nextLine, bottomLine, "43% left"],
      "codex",
    )[0]!;
    const decorated = decorateSmartWrapLine(line, classification);
    expect(decorated.className).toBe("vde-smart-wrap-preserve-row");
  });

  it("adds statusline class for codex/claude last line", () => {
    const codexClass = classifySmartWrapLines(["line", "43% left"], "codex")[1]!;
    const claudeClass = classifySmartWrapLines(["line", "❯ "], "claude")[1]!;
    expect(decorateSmartWrapLine("43% left", codexClass).className).toBe(
      "vde-smart-wrap-statusline",
    );
    expect(decorateSmartWrapLine("❯ ", claudeClass).className).toBe("vde-smart-wrap-statusline");
  });

  it("applies non-break gap for list line with long leading token", () => {
    const line = "- supercalifragilisticexpialidocious token";
    const classification = classifySmartWrapLines([line, "43% left"], "codex")[0]!;
    const decorated = decorateSmartWrapLine(line, classification);
    const node = parseLine(decorated.lineHtml);
    expect(node?.textContent).toContain(`-${"\u2060\u00A0"}supercalifragilisticexpialidocious`);
  });

  it("applies non-break gap even when list prefix is split across html nodes", () => {
    const line =
      '<span class="token">-</span> <span class="token">apps/web/src/pages/SessionDetail/components/ScreenPanelViewport.tsx:19</span>';
    const classification = classifySmartWrapLines([line, "43% left"], "codex")[0]!;
    const decorated = decorateSmartWrapLine(line, classification);
    const node = parseLine(decorated.lineHtml);
    expect(classification.rule).toBe("list-long-word");
    expect(node?.textContent).toContain(
      `-${"\u2060\u00A0"}apps/web/src/pages/SessionDetail/components/ScreenPanelViewport.tsx:19`,
    );
  });

  it("skips hanging indent for prompt-marker long token lines", () => {
    const line =
      "› /private/var/folders/20/st1j3f895hl7lb5thkpbfs680000gn/T/vde-monitor/attachments/%2512/mobile-20260219-034100-45f4ff93.png";
    const classification = classifySmartWrapLines([line, "line 2"], "unknown")[0]!;
    const decorated = decorateSmartWrapLine(line, classification);
    const node = parseLine(decorated.lineHtml);
    const wrapper = node?.querySelector(".vde-smart-wrap-hang");
    expect(classification.rule).toBe("list-long-word");
    expect(wrapper).toBeNull();
    expect(node?.textContent).toContain("› /private/var/folders");
  });

  it("adds divider class for codex divider candidate", () => {
    const line = "----------";
    const classification = classifySmartWrapLines([line, "43% left"], "codex")[0]!;
    const decorated = decorateSmartWrapLine(line, classification);
    expect(decorated.className).toBe("vde-smart-wrap-divider");
  });

  it("adds divider class for claude divider candidate", () => {
    const line = "────────────────────────────────";
    const classification = classifySmartWrapLines([line, "❯ "], "claude")[0]!;
    const decorated = decorateSmartWrapLine(line, classification);
    expect(decorated.className).toBe("vde-smart-wrap-divider");
  });

  it("uses label tail as hanging-indent anchor for codex search line", () => {
    const line = "Search very-long-keyword-list";
    const classification = classifySmartWrapLines([line, "43% left"], "codex")[0]!;
    const decorated = decorateSmartWrapLine(line, classification);
    const wrapper = parseLine(decorated.lineHtml)?.querySelector(".vde-smart-wrap-hang");
    expect(wrapper?.getAttribute("style")).toContain("--vde-wrap-indent-ch: 7ch");
  });

  it("keeps claude bash line as no-wrap tool block", () => {
    const line = "⏺ Bash(mkdir -p /tmp/example/path)";
    const classification = classifySmartWrapLines([line, "❯ "], "claude")[0]!;
    const decorated = decorateSmartWrapLine(line, classification);
    const wrapper = parseLine(decorated.lineHtml)?.querySelector(".vde-smart-wrap-hang");
    expect(wrapper).toBeNull();
    expect(decorated.className).toBe("vde-smart-wrap-claude-block");
  });

  it("adds codex diff-block class", () => {
    const lines = ["• Edited a.ts (+1 -1)", "  10  line"];
    const classifications = classifySmartWrapLines(lines, "codex");
    const decorated = decorateSmartWrapLine(lines[0]!, classifications[0]!);
    expect(decorated.className).toBe("vde-smart-wrap-diff-block");
  });

  it("adds claude tool-block class", () => {
    const line = "⏺ Read 1 file";
    const classification = classifySmartWrapLines([line, "❯ "], "claude")[0]!;
    const decorated = decorateSmartWrapLine(line, classification);
    expect(decorated.className).toBe("vde-smart-wrap-claude-block");
  });
});

import { describe, expect, it } from "vitest";

import {
  ensureLineContent,
  isUnicodeTableHtmlLine,
  normalizeMarkdownPipeTableLines,
  normalizeUnicodeTableLines,
  replaceBackgroundColors,
  sanitizeAnsiForHtml,
  stripAnsi,
  unwrapUnicodeTableHtmlLine,
} from "./ansi-text-utils";

describe("ansi-text-utils", () => {
  it("strips ANSI escape codes", () => {
    expect(stripAnsi("\u001b[31mred\u001b[0m")).toBe("red");
  });

  it("sanitizes unsupported ANSI control sequences but keeps CSI", () => {
    const value =
      "\u001b(B\u001b[31mred\u001b[0m \u001b]8;;https://example.com/\u001b\\link\u001b]8;;\u001b\\";
    expect(sanitizeAnsiForHtml(value)).toBe("\u001b[31mred\u001b[0m link");
  });

  it("normalizes colon-based SGR truecolor parameters", () => {
    const value = "\u001b[38:2::215:119:87mcolor\u001b[0m";
    expect(sanitizeAnsiForHtml(value)).toBe("\u001b[38;2;215;119;87mcolor\u001b[0m");
  });

  it("normalizes dim-only sgr into gray foreground", () => {
    const value = "\u001b[2;3mdim\u001b[0m";
    expect(sanitizeAnsiForHtml(value)).toBe("\u001b[90;3mdim\u001b[0m");
  });

  it("keeps dim with explicit foreground colors", () => {
    const value = "\u001b[2;31mred\u001b[0m";
    expect(sanitizeAnsiForHtml(value)).toBe("\u001b[2;31mred\u001b[0m");
  });

  it("does not rewrite truecolor mode parameters that include 2", () => {
    const value = "\u001b[48;2;55;55;55mblock\u001b[49m";
    expect(sanitizeAnsiForHtml(value)).toBe("\u001b[48;2;55;55;55mblock\u001b[49m");
  });

  it("ensures line content when html is empty", () => {
    expect(ensureLineContent("")).toContain("&#x200B;");
  });

  it("keeps existing html content", () => {
    expect(ensureLineContent("<span>hi</span>")).toBe("<span>hi</span>");
  });

  it("replaces background colors using replacer", () => {
    const html = '<span style="background-color:#000">x</span>';
    const replaced = replaceBackgroundColors(html, (_match, rawValue) => {
      return `background-color:${rawValue}-changed`;
    });
    expect(replaced).toContain("background-color:#000-changed");
  });

  it("normalizes unicode table rows into html table", () => {
    const lines = ["┌─┬─┐", "│AAA│B│", "├─┼─┤", "│C│DDDD│", "└─┴─┘"];
    const normalized = normalizeUnicodeTableLines(lines);
    expect(normalized).toHaveLength(1);
    const line = normalized[0] ?? "";
    expect(isUnicodeTableHtmlLine(line)).toBe(true);
    const html = unwrapUnicodeTableHtmlLine(line);
    expect(html).toContain('class="vde-unicode-table"');
    expect(html).toContain("<colgroup>");
    expect(html).toContain('class="vde-unicode-table-cell-left">AAA</td>');
    expect(html).toContain('class="vde-unicode-table-cell-left">DDDD</td>');
  });

  it("normalizes unicode table rows with wide japanese characters", () => {
    const lines = ["┌─┬─┐", "│ファイル│役割│", "├─┼─┤", "│foo.ts│メイン│", "└─┴─┘"];
    const normalized = normalizeUnicodeTableLines(lines);
    expect(normalized).toHaveLength(1);
    const html = unwrapUnicodeTableHtmlLine(normalized[0] ?? "");
    expect(html).toContain("ファイル");
    expect(html).toContain("foo.ts");
    expect(html).toContain("メイン");
  });

  it("normalizes pane103 style unicode table blocks with long japanese descriptions", () => {
    const lines = [
      "  ┌──────────────────────────────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────┐",
      "  │               ファイル               │                                             変更内容                                              │",
      "  ├──────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤",
      "  │ atoms/replaySelection.ts             │ isAllCurrentPageSelectedAtom（全選択判定）と toggleSelectAllCurrentPageAtom（全選択トグル）を追加 │",
      "  ├──────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤",
      "  │ components/SelectionToolbar.tsx      │ バッジの左に全選択ボタンを配置。アイコンとラベルが全選択/選択解除でトグル                         │",
      "  ├──────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤",
      "  │ atoms/replaySelection.test.ts        │ ページ全選択の7テストケース追加（空ページ、一部選択、全選択、トグル、他ページ保持）               │",
      "  ├──────────────────────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤",
      "  │ components/SelectionToolbar.test.tsx │ ボタン表示・クリック動作の4テストケース追加                                                       │",
      "  └──────────────────────────────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────┘",
    ];
    const normalized = normalizeUnicodeTableLines(lines);

    expect(normalized).toHaveLength(1);
    const html = unwrapUnicodeTableHtmlLine(normalized[0] ?? "");
    expect(html).toContain("toggleSelectAllCurrentPageAtom");
    expect(html).toContain("アイコンとラベルが全選択/選択解除");
    expect(html).toContain('style="width:');
  });

  it("infers cell alignment from original spacing", () => {
    const lines = [
      "┌──────────┬──────────┬──────────┬──────────┐",
      "│ lpadded  │left      │  center  │     right│",
      "└──────────┴──────────┴──────────┴──────────┘",
    ];
    const normalized = normalizeUnicodeTableLines(lines);
    const html = unwrapUnicodeTableHtmlLine(normalized[0] ?? "");
    expect(html).toContain('class="vde-unicode-table-cell-left">lpadded</td>');
    expect(html).toContain('class="vde-unicode-table-cell-left">left</td>');
    expect(html).toContain('class="vde-unicode-table-cell-center">center</td>');
    expect(html).toContain('class="vde-unicode-table-cell-right">right</td>');
  });

  it("preserves intra-cell spacing for left-right text placement", () => {
    const lines = [
      "┌──────────────────────────────┐",
      "│ left                right   │",
      "└──────────────────────────────┘",
    ];
    const normalized = normalizeUnicodeTableLines(lines);
    const html = unwrapUnicodeTableHtmlLine(normalized[0] ?? "");
    expect(html).toMatch(/left {10,}right/);
  });

  it("normalizes markdown pipe table rows into html table", () => {
    const lines = [
      "| Method | Path | Request | Response | 備考 |",
      "|---|---|---|---|---|",
      "| GET | /sessions/:paneId/notes | なし | { repoRoot, notes } | repo単位一覧 |",
      "| POST | /sessions/:paneId/notes | { title?: string \\| null, body: string } | { note } | 新規作成 |",
    ];
    const normalized = normalizeMarkdownPipeTableLines(lines);

    expect(normalized).toHaveLength(1);
    const line = normalized[0] ?? "";
    expect(isUnicodeTableHtmlLine(line)).toBe(true);
    const html = unwrapUnicodeTableHtmlLine(line);
    expect(html).toContain('class="vde-markdown-pipe-table"');
    expect(html).toContain("<thead>");
    expect(html).toContain("<tbody>");
    expect(html).toContain("/sessions/:paneId/notes");
    expect(html).toContain("{ title?: string | null, body: string }");
  });

  it("does not normalize markdown rows without a delimiter line", () => {
    const lines = ["| Method | Path |", "| GET | /sessions/:paneId/notes |"];
    expect(normalizeMarkdownPipeTableLines(lines)).toEqual(lines);
  });

  it("normalizes markdown pipe table rows with a bullet-prefixed header", () => {
    const lines = [
      "• | ID | 項目 | 状態 | メモ |",
      "  |---:|---|---|---|",
      "  | 1 | APIサーバー | 稼働中 | レイテンシ低め |",
      "  | 2 | Webフロント | 稼働中 | 軽微な警告あり |",
    ];
    const normalized = normalizeMarkdownPipeTableLines(lines);

    expect(normalized).toHaveLength(1);
    const html = unwrapUnicodeTableHtmlLine(normalized[0] ?? "");
    expect(html).toContain("• ");
    expect(html).toContain('class="vde-markdown-pipe-table"');
    expect(html).toContain('vde-markdown-pipe-table-cell-right">1</td>');
    expect(html).toContain("APIサーバー");
  });

  it("normalizes markdown pipe table rows that wrap long evidence lines", () => {
    const lines = [
      "| ID | 判定 | 調査結果（根拠） |",
      "|---|---|---|",
      "| STY-H1 | 一部進行だが有効 | SessionDetailViewProps が SessionDetailVM を直接参照する点は進展あり（apps/web/src/pages/",
      "SessionDetail/useSessionDetailVM.ts:426）。ただし VM builder 層と View builder 層の二段変換は継続（apps/web/src/pages/",
      "SessionDetail/hooks/section-props-builders.ts:303）。 |",
      "| STY-H2 | 有効 | ScreenPanel.tsx は現状 1351 行で責務集中は継続（apps/web/src/pages/SessionDetail/components/ScreenPanel.tsx:519）。 |",
    ];
    const normalized = normalizeMarkdownPipeTableLines(lines);

    expect(normalized).toHaveLength(1);
    const html = unwrapUnicodeTableHtmlLine(normalized[0] ?? "");
    expect(html).toContain('class="vde-markdown-pipe-table"');
    expect(html).toContain("STY-H1");
    expect(html).toContain("useSessionDetailVM.ts:426");
    expect(html).toContain("section-props-builders.ts:303");
    expect(html).toContain("STY-H2");
  });

  it("normalizes wrapped rows that contain a standalone pipe continuation line", () => {
    const lines = [
      "| ID | 判定 | 調査結果（根拠） |",
      "|---|---|---|",
      "| STY-L1 | 有効 | apps/web/src/pages/SessionDetail/SessionDetailView.tsx:522`。",
      "|",
      "SessionDetailView.tsx:453`）。 |",
      "| STY-L2 | 有効 | 継続確認 |",
    ];
    const normalized = normalizeMarkdownPipeTableLines(lines);

    expect(normalized).toHaveLength(1);
    const html = unwrapUnicodeTableHtmlLine(normalized[0] ?? "");
    expect(html).toContain('class="vde-markdown-pipe-table"');
    expect(html).toContain("STY-L1");
    expect(html).toContain("SessionDetailView.tsx:453");
    expect(html).toContain("STY-L2");
  });

  it("keeps each markdown row separate when multiple rows are wrapped", () => {
    const lines = [
      "| ID | 判定 | 調査結果（根拠） |",
      "|---|---|---|",
      "| STY-H1 | 一部進行だが有効 | SessionDetailViewProps が SessionDetailVM を直接参照する点は進展あり（apps/web/src/pages/",
      "SessionDetail/useSessionDetailVM.ts:426）。ただし VM builder 層と View builder 層の二段変換は継続（apps/web/src/pages/",
      "SessionDetail/hooks/section-props-builders.ts:303）。",
      "| STY-H2 | 有効 | ScreenPanel.tsx は現状 1351 行で責務集中は継続（apps/web/src/pages/SessionDetail/",
      "components/ScreenPanel.tsx:519, apps/web/src/pages/SessionDetail/components/ScreenPanel.tsx:676）。",
      "| STY-H3 | 有効 | 型重複は解消されておらず Build*Args 群が残存（apps/web/src/pages/SessionDetail/hooks/",
      "session-detail-vm-section-builders.ts:29, apps/web/src/pages/SessionDetail/hooks/section-props-builders.ts:30）。 |",
    ];
    const normalized = normalizeMarkdownPipeTableLines(lines);

    expect(normalized).toHaveLength(1);
    const html = unwrapUnicodeTableHtmlLine(normalized[0] ?? "");
    expect(html).toContain('class="vde-markdown-pipe-table"');
    expect(html).toContain("STY-H1");
    expect(html).toContain("STY-H2");
    expect(html).toContain("STY-H3");
    const tbodyHtml = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
    const rowCount = (tbodyHtml.match(/<tr>/g) ?? []).length;
    expect(rowCount).toBe(3);
  });

  it("does not treat prose as continuation for complete rows without trailing pipe", () => {
    const lines = ["| ID | Name |", "|---|---|", "| 1 | Alice", "This is prose after table."];
    const normalized = normalizeMarkdownPipeTableLines(lines);

    expect(normalized).toHaveLength(2);
    const html = unwrapUnicodeTableHtmlLine(normalized[0] ?? "");
    expect(html).toContain("Alice");
    expect(html).not.toContain("This is prose after table.");
    expect(normalized[1]).toBe("This is prose after table.");
  });
});

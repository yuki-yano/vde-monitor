import {
  detectClaudeToolBlockLineSet,
  detectCodexDiffBlockLineSet,
  isTableLine,
  resolveDivider,
  resolveGenericIndent,
  resolveLabelIndent,
  resolveListLongWord,
} from "./smart-wrap-rules";
import { extractTextContentFromHtml } from "./smart-wrap-text";
import type { SmartWrapAgent, SmartWrapLineClassification } from "./smart-wrap-types";

export type {
  SmartWrapAgent,
  SmartWrapLineClassification,
  SmartWrapLineRule,
} from "./smart-wrap-types";

const buildClassification = (
  rule: SmartWrapLineClassification["rule"],
  options?: { indentCh?: number | null; listPrefix?: string | null },
): SmartWrapLineClassification => ({
  rule,
  indentCh: options?.indentCh ?? null,
  listPrefix: options?.listPrefix ?? null,
});

export const classifySmartWrapLines = (
  lineHtmlList: string[],
  agent: SmartWrapAgent,
): SmartWrapLineClassification[] => {
  const textLines = lineHtmlList.map((lineHtml) => extractTextContentFromHtml(lineHtml));
  const codexDiffBlockLineSet =
    agent === "codex" ? detectCodexDiffBlockLineSet(textLines) : new Set<number>();
  const claudeToolBlockLineSet =
    agent === "claude" ? detectClaudeToolBlockLineSet(textLines) : new Set<number>();

  return lineHtmlList.map((lineHtml, index) => {
    const text = textLines[index] ?? "";
    const isLastLine = index === lineHtmlList.length - 1;
    if (isLastLine && (agent === "codex" || agent === "claude")) {
      return buildClassification("statusline-preserve");
    }
    if (claudeToolBlockLineSet.has(index)) {
      return buildClassification("claude-tool-block");
    }
    if (codexDiffBlockLineSet.has(index)) {
      return buildClassification("codex-diff-block");
    }
    if (isTableLine(lineHtml)) {
      return buildClassification("table-preserve");
    }
    if (resolveDivider(agent, text)) {
      return buildClassification("divider-clip");
    }
    const labelIndent = resolveLabelIndent(agent, text);
    if (labelIndent != null) {
      return buildClassification("label-indent", { indentCh: labelIndent });
    }
    const listLongWord = resolveListLongWord(agent, text);
    if (listLongWord) {
      return buildClassification("list-long-word", {
        indentCh: listLongWord.indentCh,
        listPrefix: listLongWord.listPrefix,
      });
    }
    const genericIndent = resolveGenericIndent(text);
    if (genericIndent != null) {
      return buildClassification("generic-indent", { indentCh: genericIndent });
    }
    return buildClassification("default");
  });
};

import { countCh, isBlankLikeLine, matchesAny } from "./smart-wrap-text";
import type { SmartWrapAgent } from "./smart-wrap-types";

const LIST_LONG_WORD_THRESHOLD_CH = 12;
const MIN_INDENT_CH = 2;
const MAX_INDENT_CH = 24;
const CODEX_DIFF_START_PATTERNS = [
  /^\s*•\s+(Edited|Added|Deleted|Renamed)\s+.+\(\+\d+\s+-\d+\)\s*$/,
  /^\s*•\s+(Edited|Added|Deleted|Renamed)\s+.+\(\+\d+\)\s*$/,
  /^\s*•\s+(Edited|Added|Deleted|Renamed)\s+\S*(?:\/|\\|\.)\S*(?:\s+\(\+\d+(?:\s+-\d+)?\))?\s*$/,
];
const CODEX_DIFF_CONTINUATION_PATTERNS = [
  /^\s*\d+\s{2,}.*$/,
  /^\s*\d+\s+[+-]\s?.*$/,
  /^\s+[+-]\s.*$/,
  /^\s+(?:⋮|:)\s*$/,
];
const CODEX_LABELED_DIVIDER_PATTERN = /^\s*[─━-]\s+Worked for\b.+[─━-]{8,}\s*$/;
const MAX_CODEX_WRAPPED_FRAGMENT_LINES = 3;
const CLAUDE_TOOL_START_PATTERN = /^\s*⏺\s+(Read|Bash|Write|Update|Edit|MultiEdit)\b.*$/;
const CLAUDE_TOOL_CONTINUATION_PATTERNS = [/^\s{2,}⎿\s+.*$/, /^\s{6,}\d+\s+.*$/, /^\s{6,}$/];
const CODEX_LABEL_PATTERN = /^\s*(?:[│└├]\s*)?(Search|Read)\s+/;
const CLAUDE_LABEL_PATTERN = /^\s*⏺\s+(Read|Bash|Write|Update|Edit|MultiEdit)\b/;
const LIST_LONG_WORD_PATTERN = /^(\s*(?:[-*+]\s+|\d+[.)]\s+))(\S+)/;
const GENERIC_INDENT_PATTERNS = [
  /^\s*(?:[-*+•]\s+|\d+[.)]\s+|[A-Za-z]\)\s+)/,
  /^\s*>\s+/,
  /^\s*(?:\[\d{1,2}:\d{2}:\d{2}\]\s+)?(?:TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\s+/,
];

const detectBlockLineSet = (
  textLines: string[],
  isStart: (line: string) => boolean,
  isContinuation: (line: string) => boolean,
) => {
  const result = new Set<number>();
  let index = 0;
  while (index < textLines.length) {
    const current = textLines[index] ?? "";
    if (!isStart(current)) {
      index += 1;
      continue;
    }
    result.add(index);
    let nextIndex = index + 1;
    while (nextIndex < textLines.length) {
      const next = textLines[nextIndex] ?? "";
      if (!isContinuation(next)) {
        break;
      }
      result.add(nextIndex);
      nextIndex += 1;
    }
    index = nextIndex;
  }
  return result;
};

const isCodexDivider = (text: string) => {
  const trimmed = text.trim();
  if (trimmed.length < 6) {
    return false;
  }
  if (CODEX_LABELED_DIVIDER_PATTERN.test(trimmed)) {
    return true;
  }
  if (/[A-Za-z0-9]/.test(trimmed)) {
    return false;
  }
  return /^[-=_*─━]+$/.test(trimmed);
};

const isClaudeDivider = (text: string) => {
  const trimmed = text.trim();
  return /^─{20,}$/.test(trimmed) || /^[╭╰]─{10,}[╮╯]$/.test(trimmed);
};

const resolveCodexLabelIndent = (text: string): number | null => {
  const match = text.match(CODEX_LABEL_PATTERN);
  if (!match) {
    return null;
  }
  return countCh(match[0]);
};

const resolveClaudeLabelIndent = (text: string): number | null => {
  const match = text.match(CLAUDE_LABEL_PATTERN);
  if (!match) {
    return null;
  }
  const codePoints = [...text];
  let anchor = countCh(match[0]);
  const nextChar = codePoints[anchor];
  if (nextChar === "(" || nextChar === " ") {
    anchor += 1;
  }
  return anchor;
};

export const isTableLine = (lineHtml: string) =>
  lineHtml.includes("vde-unicode-table-wrap") || lineHtml.includes("vde-markdown-pipe-table-wrap");

export const detectCodexDiffBlockLineSet = (textLines: string[]) => {
  const result = new Set<number>();
  let index = 0;
  while (index < textLines.length) {
    const current = textLines[index] ?? "";
    if (!matchesAny(current, CODEX_DIFF_START_PATTERNS)) {
      index += 1;
      continue;
    }
    result.add(index);
    let nextIndex = index + 1;
    while (nextIndex < textLines.length) {
      const next = textLines[nextIndex] ?? "";
      if (matchesAny(next, CODEX_DIFF_CONTINUATION_PATTERNS)) {
        result.add(nextIndex);
        nextIndex += 1;
        continue;
      }

      // Two-phase recovery for wrapped Codex diff fragments:
      // 1) after explicit continuation lines end, perform bounded lookahead
      //    (up to wrappedMaxExclusive) to consume only plain wrapped text.
      // 2) absorb that fragment only when a continuation line follows.
      // This loop always makes progress: lookahead is bounded, absorption
      // requires at least one consumed line, and fallback resets to wrappedStart.
      const wrappedStart = nextIndex;
      const wrappedMaxExclusive = Math.min(
        textLines.length,
        wrappedStart + MAX_CODEX_WRAPPED_FRAGMENT_LINES,
      );
      while (nextIndex < textLines.length) {
        const candidate = textLines[nextIndex] ?? "";
        if (isBlankLikeLine(candidate)) {
          break;
        }
        if (isCodexDivider(candidate)) {
          break;
        }
        if (matchesAny(candidate, CODEX_DIFF_START_PATTERNS)) {
          break;
        }
        if (matchesAny(candidate, CODEX_DIFF_CONTINUATION_PATTERNS)) {
          break;
        }
        nextIndex += 1;
        if (nextIndex >= wrappedMaxExclusive) {
          break;
        }
      }

      if (
        nextIndex > wrappedStart &&
        nextIndex < textLines.length &&
        matchesAny(textLines[nextIndex] ?? "", CODEX_DIFF_CONTINUATION_PATTERNS)
      ) {
        for (let cursor = wrappedStart; cursor < nextIndex; cursor += 1) {
          result.add(cursor);
        }
        continue;
      }

      nextIndex = wrappedStart;
      break;
    }
    index = nextIndex;
  }
  return result;
};

export const detectClaudeToolBlockLineSet = (textLines: string[]) =>
  detectBlockLineSet(
    textLines,
    (line) => CLAUDE_TOOL_START_PATTERN.test(line),
    (line) => matchesAny(line, CLAUDE_TOOL_CONTINUATION_PATTERNS),
  );

export const resolveDivider = (agent: SmartWrapAgent, text: string) => {
  if (agent === "codex") {
    return isCodexDivider(text);
  }
  if (agent === "claude") {
    return isClaudeDivider(text);
  }
  return false;
};

export const resolveLabelIndent = (agent: SmartWrapAgent, text: string): number | null => {
  if (agent === "codex") {
    return resolveCodexLabelIndent(text);
  }
  if (agent === "claude") {
    return resolveClaudeLabelIndent(text);
  }
  return null;
};

export const resolveListLongWord = (
  agent: SmartWrapAgent,
  text: string,
): { indentCh: number; listPrefix: string } | null => {
  if (agent !== "codex") {
    return null;
  }
  const match = text.match(LIST_LONG_WORD_PATTERN);
  if (!match) {
    return null;
  }
  const listPrefix = match[1] ?? "";
  const firstToken = match[2] ?? "";
  if (countCh(firstToken) < LIST_LONG_WORD_THRESHOLD_CH) {
    return null;
  }
  const indentCh = countCh(listPrefix);
  if (indentCh < MIN_INDENT_CH || indentCh > MAX_INDENT_CH) {
    return null;
  }
  return { indentCh, listPrefix };
};

export const resolveGenericIndent = (text: string): number | null => {
  for (const pattern of GENERIC_INDENT_PATTERNS) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }
    const indentCh = countCh(match[0]);
    if (indentCh < MIN_INDENT_CH || indentCh > MAX_INDENT_CH) {
      continue;
    }
    return indentCh;
  }
  return null;
};

import type { SmartWrapLineClassification } from "./smart-wrap-types";

export type SmartWrapDecoratedLine = {
  lineHtml: string;
  className: string;
};

const sharedParser = typeof DOMParser === "undefined" ? null : new DOMParser();

const HANGING_INDENT_RULES = new Set(["label-indent", "list-long-word", "generic-indent"]);
const WORD_JOINER = "\u2060";
const PROMPT_MARKER_PREFIX_PATTERN = /[›❯]\s+$/;

const shouldInsertWordJoinerBeforeGap = (prefixBody: string) => prefixBody.endsWith("-");

const shouldSkipHangingIndent = (classification: SmartWrapLineClassification) =>
  classification.rule === "list-long-word" &&
  classification.listPrefix != null &&
  PROMPT_MARKER_PREFIX_PATTERN.test(classification.listPrefix);

const replaceTrailingPrefixSpaceWithNbsp = (value: string) => {
  const match = value.match(/^(.*?)(\s+)$/);
  if (!match) {
    return value;
  }
  const prefixBody = match[1] ?? "";
  const trailingSpaces = match[2] ?? "";
  if (trailingSpaces.length === 0) {
    return value;
  }
  const gapPrefix = shouldInsertWordJoinerBeforeGap(prefixBody)
    ? `${prefixBody}${WORD_JOINER}`
    : prefixBody;
  return `${gapPrefix}\u00A0${trailingSpaces.slice(1)}`;
};

const applyListLongWordNonBreakGap = (container: Element, listPrefix: string) => {
  const textContent = container.textContent ?? "";
  if (!textContent.startsWith(listPrefix)) {
    return;
  }
  const gapOffset = listPrefix.lastIndexOf(" ");
  if (gapOffset < 0) {
    return;
  }
  const shouldInsertWordJoiner = gapOffset > 0 && (textContent[gapOffset - 1] ?? "") === "-";
  const walker = container.ownerDocument.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let textOffset = 0;
  let currentNode = walker.nextNode();
  while (currentNode) {
    const textNode = currentNode as Text;
    const value = textNode.nodeValue ?? "";
    const nextTextOffset = textOffset + value.length;
    if (gapOffset < nextTextOffset) {
      const gapOffsetInNode = gapOffset - textOffset;
      if (value[gapOffsetInNode] === " ") {
        if (shouldInsertWordJoiner) {
          textNode.nodeValue =
            `${value.slice(0, gapOffsetInNode)}${WORD_JOINER}\u00A0` +
            value.slice(gapOffsetInNode + 1);
        } else {
          textNode.nodeValue =
            `${value.slice(0, gapOffsetInNode)}\u00A0` + value.slice(gapOffsetInNode + 1);
        }
      }
      return;
    }
    textOffset = nextTextOffset;
    currentNode = walker.nextNode();
  }
};

const applyHangingIndentWrapper = (container: Element, indentCh: number) => {
  const wrapper = container.ownerDocument.createElement("span");
  wrapper.className = "vde-smart-wrap-hang";
  wrapper.style.setProperty("--vde-wrap-indent-ch", `${indentCh}ch`);
  while (container.firstChild) {
    wrapper.append(container.firstChild);
  }
  container.append(wrapper);
};

const resolveClassName = (classification: SmartWrapLineClassification): string => {
  if (classification.rule === "statusline-preserve") {
    return "vde-smart-wrap-statusline";
  }
  if (classification.rule === "table-preserve" || classification.rule === "startup-banner-block") {
    return "vde-smart-wrap-preserve-row";
  }
  if (classification.rule === "divider-clip") {
    return "vde-smart-wrap-divider";
  }
  if (classification.rule === "codex-diff-block") {
    return "vde-smart-wrap-diff-block";
  }
  if (classification.rule === "claude-tool-block") {
    return "vde-smart-wrap-claude-block";
  }
  return "";
};

const applyFallbackListLongWord = (lineHtml: string, listPrefix: string) => {
  if (!lineHtml.startsWith(listPrefix)) {
    return lineHtml;
  }
  const replacementPrefix = replaceTrailingPrefixSpaceWithNbsp(listPrefix);
  return `${replacementPrefix}${lineHtml.slice(listPrefix.length)}`;
};

export const decorateSmartWrapLine = (
  lineHtml: string,
  classification: SmartWrapLineClassification,
): SmartWrapDecoratedLine => {
  if (!sharedParser) {
    const normalized =
      classification.rule === "list-long-word" && classification.listPrefix
        ? applyFallbackListLongWord(lineHtml, classification.listPrefix)
        : lineHtml;
    return {
      lineHtml: normalized,
      className: resolveClassName(classification),
    };
  }

  const document = sharedParser.parseFromString(`<div>${lineHtml}</div>`, "text/html");
  const container = document.body.firstElementChild;
  if (!container) {
    return {
      lineHtml,
      className: resolveClassName(classification),
    };
  }

  if (classification.rule === "list-long-word" && classification.listPrefix) {
    applyListLongWordNonBreakGap(container, classification.listPrefix);
  }

  if (
    HANGING_INDENT_RULES.has(classification.rule) &&
    classification.indentCh != null &&
    !shouldSkipHangingIndent(classification)
  ) {
    applyHangingIndentWrapper(container, classification.indentCh);
  }

  return {
    lineHtml: container.innerHTML,
    className: resolveClassName(classification),
  };
};

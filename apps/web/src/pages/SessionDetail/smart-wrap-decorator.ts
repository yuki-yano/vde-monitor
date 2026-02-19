import { decorateSmartWrapLine, type SmartWrapDecoratedLine } from "./smart-wrap-line";
import type { SmartWrapLineClassification } from "./smart-wrap-types";

const defaultClassification: SmartWrapLineClassification = {
  rule: "default",
  indentCh: null,
  listPrefix: null,
};

export const decorateSmartWrapLines = (
  lineHtmlList: string[],
  classifications: SmartWrapLineClassification[],
): SmartWrapDecoratedLine[] =>
  lineHtmlList.map((lineHtml, index) =>
    decorateSmartWrapLine(lineHtml, classifications[index] ?? defaultClassification),
  );

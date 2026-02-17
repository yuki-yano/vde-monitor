const ansiEscapePattern = new RegExp(String.raw`\u001b\[[0-?]*[ -/]*[@-~]`, "g");
const ansiSgrPattern = new RegExp(String.raw`(\u001b\[)([0-9:;]*)(m)`, "g");
const ansiOscPattern = new RegExp(String.raw`\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)`, "g");
const ansiCharsetDesignatePattern = new RegExp(String.raw`\u001b[\(\)\*\+\-\.\/][0-~]`, "g");
const ansiSingleCharacterPattern = new RegExp(String.raw`\u001b(?:[@-Z\\^_]|[=>])`, "g");
const ansiControlPattern = new RegExp(
  String.raw`[\u0000-\u0008\u000B-\u001A\u001C-\u001F\u007F]`,
  "g",
);
const foregroundSgrTokenPattern = /^(3[0-7]|9[0-7]|38)$/;
const backgroundColorPattern = /background-color:\s*([^;"']+)/i;
const backgroundColorPatternGlobal = /background-color:\s*([^;"']+)/gi;
const unicodeTableBorderPattern = /^(\s*)([┌├└]).*([┐┤┘])\s*$/;
const unicodeTableRowPattern = /^(\s*)│(.*)│\s*$/;
const markdownTableRowPattern = /^(\s*)\|(.+?)(?:\|\s*)?$/;
const markdownTableListPrefixPattern = /^(\s*(?:[-*+•]|\d+\.)\s+)(\|.+(?:\|\s*)?)$/;
const markdownTableDelimiterCellPattern = /^:?-{3,}:?$/;
const markdownTableRowStartPattern = /^\s*\|/;
const tableHtmlLinePrefix = "__VDE_TABLE_HTML__:";
type UnicodeTableCell = {
  text: string;
  align: "left" | "center" | "right";
};
type MarkdownTableCellAlign = "left" | "center" | "right";

type MarkdownTableRow = {
  indent: string;
  cells: string[];
  prefix: string;
};

type ParsedMarkdownBodyRow = {
  cells: string[];
  nextIndex: number;
};

export const stripAnsi = (value: string) => value.replace(ansiEscapePattern, "");

const normalizeSgrParams = (params: string) => {
  if (!params.includes(":")) {
    return params;
  }
  return params.replace(/:/g, ";").replace(/;{2,}/g, ";").replace(/^;|;$/g, "");
};

const collectExtendedColorTokenIndexes = (tokens: string[]) => {
  const indexes = new Set<number>();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token !== "38" && token !== "48" && token !== "58") {
      continue;
    }
    indexes.add(index);
    const mode = tokens[index + 1];
    if (mode === "5") {
      indexes.add(index + 1);
      indexes.add(index + 2);
      index += 2;
      continue;
    }
    if (mode === "2") {
      indexes.add(index + 1);
      indexes.add(index + 2);
      indexes.add(index + 3);
      indexes.add(index + 4);
      index += 4;
    }
  }
  return indexes;
};

const normalizeDimSgrParams = (params: string) => {
  if (!params.includes("2")) {
    return params;
  }
  const tokens = params.split(";").filter((token) => token.length > 0);
  const colorTokenIndexes = collectExtendedColorTokenIndexes(tokens);
  const hasDim = tokens.some((token, index) => token === "2" && !colorTokenIndexes.has(index));
  if (!hasDim) {
    return params;
  }
  const hasExplicitForeground = tokens.some((token, index) => {
    if (token === "38" && colorTokenIndexes.has(index)) {
      return true;
    }
    if (colorTokenIndexes.has(index)) {
      return false;
    }
    return foregroundSgrTokenPattern.test(token);
  });
  if (hasExplicitForeground) {
    return params;
  }
  return tokens
    .map((token, index) => (token === "2" && !colorTokenIndexes.has(index) ? "90" : token))
    .join(";");
};

export const sanitizeAnsiForHtml = (value: string) =>
  value
    .replace(ansiSgrPattern, (_match, prefix: string, params: string, suffix: string) => {
      const normalizedParams = normalizeDimSgrParams(normalizeSgrParams(params));
      return `${prefix}${normalizedParams}${suffix}`;
    })
    .replace(ansiOscPattern, "")
    .replace(ansiCharsetDesignatePattern, "")
    .replace(ansiSingleCharacterPattern, "")
    .replace(ansiControlPattern, "");

export const extractBackgroundColor = (html: string): string | null => {
  const match = html.match(backgroundColorPattern);
  return match?.[1]?.trim() ?? null;
};

export const replaceBackgroundColors = (
  html: string,
  replacer: (match: string, rawValue: string) => string,
) => html.replace(backgroundColorPatternGlobal, replacer);

export const ensureLineContent = (html: string): string => {
  const placeholder = "&#x200B;";
  if (!html) {
    return placeholder;
  }
  const text = html.replace(/<[^>]*>/g, "");
  if (text.length > 0) {
    return html;
  }
  if (html.includes("</")) {
    return html.replace(/(<\/[^>]+>)+$/, `${placeholder}$1`);
  }
  return `${html}${placeholder}`;
};

const normalizeLineBreaks = (text: string) => text.replace(/\r\n/g, "\n");

export const splitLines = (text: string) => normalizeLineBreaks(text).split("\n");

const parseUnicodeTableBorder = (plainLine: string) => {
  const match = plainLine.match(unicodeTableBorderPattern);
  if (!match) return null;
  return {
    indent: match[1] ?? "",
    left: match[2] ?? "",
    right: match[3] ?? "",
  };
};

const parseUnicodeTableRow = (plainLine: string) => {
  const match = plainLine.match(unicodeTableRowPattern);
  if (!match) return null;
  const indent = match[1] ?? "";
  const body = match[2] ?? "";
  const cells = body.split("│").map((cell): UnicodeTableCell => {
    const leadingSpaces = cell.match(/^ +/)?.[0].length ?? 0;
    const trailingSpaces = cell.match(/ +$/)?.[0].length ?? 0;
    const trimmed = cell.trim();
    let align: UnicodeTableCell["align"] = "left";
    if (trimmed.length > 0) {
      // Box-drawing tables usually keep one baseline space on both sides.
      // Determine intent from the *extra* spaces beyond that baseline.
      const extraLeading = Math.max(leadingSpaces - 1, 0);
      const extraTrailing = Math.max(trailingSpaces - 1, 0);
      if (extraLeading > 0 && extraTrailing === 0) {
        align = "right";
      } else if (extraLeading > 0 && extraTrailing > 0) {
        align =
          Math.abs(extraLeading - extraTrailing) <= 1
            ? "center"
            : extraLeading > extraTrailing
              ? "right"
              : "left";
      }
    }
    return { text: trimmed, align };
  });
  if (cells.length === 0) return null;
  return { indent, cells };
};

const splitMarkdownTableRowCells = (body: string) => {
  const cells: string[] = [];
  let current = "";
  let escaping = false;

  for (const char of body) {
    if (escaping) {
      if (char !== "|") {
        current += "\\";
      }
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (escaping) {
    current += "\\";
  }
  cells.push(current.trim());
  return cells;
};

const parseMarkdownTableRow = (
  plainLine: string,
  options?: { allowListPrefix?: boolean },
): MarkdownTableRow | null => {
  const parseCandidate = (candidate: string, prefix: string): MarkdownTableRow | null => {
    const match = candidate.match(markdownTableRowPattern);
    if (!match) return null;
    const indent = match[1] ?? "";
    const body = match[2] ?? "";
    const cells = splitMarkdownTableRowCells(body);
    if (cells.length < 2) return null;
    return { indent, cells, prefix };
  };

  const direct = parseCandidate(plainLine, "");
  if (direct) {
    return direct;
  }
  if (!options?.allowListPrefix) {
    return null;
  }
  const listPrefixMatch = plainLine.match(markdownTableListPrefixPattern);
  if (!listPrefixMatch) {
    return null;
  }
  const prefix = listPrefixMatch[1] ?? "";
  const rowSource = listPrefixMatch[2] ?? "";
  return parseCandidate(rowSource, prefix);
};

const parseMarkdownTableDelimiterRow = (plainLine: string, expectedColumns: number) => {
  const row = parseMarkdownTableRow(plainLine);
  if (!row || row.cells.length !== expectedColumns) {
    return null;
  }
  const alignments = row.cells.map((cell): MarkdownTableCellAlign | null => {
    const trimmed = cell.trim();
    if (!markdownTableDelimiterCellPattern.test(trimmed)) {
      return null;
    }
    const startsWithColon = trimmed.startsWith(":");
    const endsWithColon = trimmed.endsWith(":");
    if (startsWithColon && endsWithColon) {
      return "center";
    }
    if (endsWithColon) {
      return "right";
    }
    return "left";
  });
  if (alignments.some((alignment) => alignment == null)) {
    return null;
  }
  return {
    indent: row.indent,
    alignments: alignments as MarkdownTableCellAlign[],
  };
};

const cjkTrailingPattern = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u;
const cjkLeadingPattern = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

const appendMarkdownTableText = (base: string, fragment: string) => {
  const normalizedFragment = fragment.trim();
  if (normalizedFragment.length === 0) {
    return base;
  }
  if (base.length === 0) {
    return normalizedFragment;
  }
  if (/\s$/.test(base) || /^[\s,.;:!?)]/.test(normalizedFragment)) {
    return `${base}${normalizedFragment}`;
  }
  if (base.endsWith("/") || /[[({<-]$/.test(base)) {
    return `${base}${normalizedFragment}`;
  }
  if (cjkTrailingPattern.test(base) && cjkLeadingPattern.test(normalizedFragment)) {
    return `${base}${normalizedFragment}`;
  }
  return `${base} ${normalizedFragment}`;
};

const normalizeMarkdownRowContinuation = (plainLine: string) => {
  const trimmed = plainLine.trim();
  if (trimmed === "|") {
    return "";
  }
  const withoutLeading = trimmed.startsWith("|") ? trimmed.slice(1).trimStart() : trimmed;
  const withoutTrailing = withoutLeading.endsWith("|")
    ? withoutLeading.slice(0, Math.max(withoutLeading.length - 1, 0)).trimEnd()
    : withoutLeading;
  return withoutTrailing;
};

const hasClosingPipeAhead = ({
  lines,
  startIndex,
  expectedColumns,
}: {
  lines: string[];
  startIndex: number;
  expectedColumns: number;
}) => {
  const lookaheadLimit = Math.min(lines.length, startIndex + 12);
  let sawContinuationLine = false;
  for (let index = startIndex; index < lookaheadLimit; index += 1) {
    const plain = stripAnsi(lines[index] ?? "");
    const trimmed = plain.trim();
    if (trimmed.length === 0) {
      return false;
    }
    if (parseMarkdownTableDelimiterRow(plain, expectedColumns)) {
      return false;
    }
    const nextAsStandaloneRow = parseMarkdownTableRow(plain);
    if (nextAsStandaloneRow && nextAsStandaloneRow.cells.length === expectedColumns) {
      return sawContinuationLine;
    }
    if (/\|\s*$/.test(plain)) {
      return true;
    }
    sawContinuationLine = true;
  }
  return false;
};

const parseMarkdownBodyRow = (
  lines: string[],
  startIndex: number,
  expectedColumns: number,
): ParsedMarkdownBodyRow | null => {
  const firstLine = lines[startIndex] ?? "";
  const firstPlain = stripAnsi(firstLine);
  if (!markdownTableRowStartPattern.test(firstPlain)) {
    return null;
  }

  let candidate = firstPlain;
  let cursor = startIndex;
  let consumedLineCount = 1;
  const firstLineHasTrailingPipe = /\|\s*$/.test(firstPlain);
  let parsed = parseMarkdownTableRow(candidate);

  while ((!parsed || parsed.cells.length !== expectedColumns) && cursor + 1 < lines.length) {
    const nextPlain = stripAnsi(lines[cursor + 1] ?? "");
    const nextTrimmed = nextPlain.trim();
    if (nextTrimmed.length === 0) {
      return null;
    }
    const nextAsStandaloneRow = parseMarkdownTableRow(nextPlain);
    if (nextAsStandaloneRow && nextAsStandaloneRow.cells.length === expectedColumns) {
      return null;
    }
    candidate = appendMarkdownTableText(candidate, nextTrimmed);
    cursor += 1;
    consumedLineCount += 1;
    parsed = parseMarkdownTableRow(candidate);
    if (consumedLineCount >= 16) {
      break;
    }
  }

  if (!parsed || parsed.cells.length !== expectedColumns) {
    return null;
  }

  const cells = [...parsed.cells];
  let nextIndex = cursor + 1;
  const allowTrailingContinuation =
    consumedLineCount > 1 ||
    (!firstLineHasTrailingPipe &&
      hasClosingPipeAhead({
        lines,
        startIndex: cursor + 1,
        expectedColumns,
      }));
  if (!allowTrailingContinuation) {
    return { cells, nextIndex };
  }

  while (nextIndex < lines.length) {
    const continuationPlain = stripAnsi(lines[nextIndex] ?? "");
    if (continuationPlain.trim().length === 0) {
      break;
    }
    if (parseMarkdownTableDelimiterRow(continuationPlain, expectedColumns)) {
      break;
    }
    const nextAsStandaloneRow = parseMarkdownTableRow(continuationPlain);
    if (nextAsStandaloneRow && nextAsStandaloneRow.cells.length === expectedColumns) {
      break;
    }

    const fragment = normalizeMarkdownRowContinuation(continuationPlain);
    if (fragment.length > 0) {
      const lastCellIndex = cells.length - 1;
      cells[lastCellIndex] = appendMarkdownTableText(cells[lastCellIndex] ?? "", fragment);
    }
    nextIndex += 1;
    if (nextIndex - startIndex >= 24) {
      break;
    }
  }

  return { cells, nextIndex };
};

const isUnicodeTableCandidateLine = (plainLine: string) =>
  parseUnicodeTableBorder(plainLine) != null || parseUnicodeTableRow(plainLine) != null;

const padCells = (cells: UnicodeTableCell[], columnCount: number) => {
  if (cells.length >= columnCount) return cells;
  return [
    ...cells,
    ...new Array(columnCount - cells.length)
      .fill(null)
      .map((): UnicodeTableCell => ({ text: "", align: "left" })),
  ];
};

const isCombiningCharacter = /\p{Mark}/u;

const isFullWidthCodePoint = (codePoint: number): boolean =>
  codePoint >= 0x1100 &&
  (codePoint <= 0x115f ||
    codePoint === 0x2329 ||
    codePoint === 0x232a ||
    (codePoint >= 0x2e80 && codePoint <= 0x3247 && codePoint !== 0x303f) ||
    (codePoint >= 0x3250 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0xa4c6) ||
    (codePoint >= 0xa960 && codePoint <= 0xa97c) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6b) ||
    (codePoint >= 0xff01 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1b000 && codePoint <= 0x1b001) ||
    (codePoint >= 0x1f200 && codePoint <= 0x1f251) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd));

const getCharacterDisplayWidth = (char: string): number => {
  const codePoint = char.codePointAt(0);
  if (codePoint == null) return 0;
  if (codePoint === 0) return 0;
  if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0)) return 0;
  if (isCombiningCharacter.test(char)) return 0;
  return isFullWidthCodePoint(codePoint) ? 2 : 1;
};

const getTextDisplayWidth = (text: string): number =>
  Array.from(text).reduce((width, char) => width + getCharacterDisplayWidth(char), 0);
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildUnicodeTableHtml = (rows: UnicodeTableCell[][], indent: string) => {
  const columnCount = Math.max(...rows.map((row) => row.length), 1);
  const normalizedRows = rows.map((row) => padCells(row, columnCount));
  const columnWidths = new Array<number>(columnCount).fill(0);
  normalizedRows.forEach((row) => {
    row.forEach((cell, columnIndex) => {
      const width = getTextDisplayWidth(cell.text);
      columnWidths[columnIndex] = Math.max(columnWidths[columnIndex] ?? 0, width);
    });
  });

  const colWidthsCh = columnWidths.map((width) => Math.max(width, 1) + 2);
  const totalWidthCh = colWidthsCh.reduce((sum, width) => sum + width, 0);
  const colgroup = colWidthsCh
    .map((width) => `<col style="width:${width}ch; min-width:${width}ch;" />`)
    .join("");
  const rowsHtml = normalizedRows
    .map((row, rowIndex) => {
      const className = rowIndex === 0 ? ' class="vde-unicode-table-header"' : "";
      const cellsHtml = row
        .map((cell) => {
          const escaped = escapeHtml(stripAnsi(cell.text));
          const content = escaped.length > 0 ? escaped : "&nbsp;";
          return `<td class="vde-unicode-table-cell-${cell.align}">${content}</td>`;
        })
        .join("");
      return `<tr${className}>${cellsHtml}</tr>`;
    })
    .join("");
  return `${indent}<span class="vde-unicode-table-wrap"><table class="vde-unicode-table" style="width:${totalWidthCh}ch;"><colgroup>${colgroup}</colgroup><tbody>${rowsHtml}</tbody></table></span>`;
};

const buildMarkdownPipeTableHtml = (
  headerCells: string[],
  alignments: MarkdownTableCellAlign[],
  bodyRows: string[][],
  indent: string,
  prefix: string,
) => {
  const headerHtml = headerCells
    .map((cell, index) => {
      const escaped = escapeHtml(stripAnsi(cell));
      const content = escaped.length > 0 ? escaped : "&nbsp;";
      const alignClass = `vde-markdown-pipe-table-cell-${alignments[index] ?? "left"}`;
      return `<th class="vde-markdown-pipe-table-cell ${alignClass}">${content}</th>`;
    })
    .join("");
  const bodyHtml = bodyRows
    .map((row) => {
      const cellsHtml = row
        .map((cell, index) => {
          const escaped = escapeHtml(stripAnsi(cell));
          const content = escaped.length > 0 ? escaped : "&nbsp;";
          const alignClass = `vde-markdown-pipe-table-cell-${alignments[index] ?? "left"}`;
          return `<td class="vde-markdown-pipe-table-cell ${alignClass}">${content}</td>`;
        })
        .join("");
      return `<tr>${cellsHtml}</tr>`;
    })
    .join("");
  const escapedPrefix = prefix.length > 0 ? escapeHtml(prefix) : "";
  return `${escapedPrefix}${indent}<span class="vde-markdown-pipe-table-wrap"><table class="vde-markdown-pipe-table"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></span>`;
};

export const isUnicodeTableHtmlLine = (line: string) => line.startsWith(tableHtmlLinePrefix);

export const unwrapUnicodeTableHtmlLine = (line: string) => line.slice(tableHtmlLinePrefix.length);

export const normalizeUnicodeTableLines = (lines: string[]): string[] => {
  const normalized: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const firstLine = lines[index] ?? "";
    const firstPlain = stripAnsi(firstLine);
    if (!isUnicodeTableCandidateLine(firstPlain)) {
      normalized.push(firstLine);
      index += 1;
      continue;
    }

    const blockRows: string[] = [];
    const blockOriginal: string[] = [];
    let cursor = index;
    while (cursor < lines.length) {
      const originalLine = lines[cursor] ?? "";
      const plainLine = stripAnsi(originalLine);
      if (!isUnicodeTableCandidateLine(plainLine)) {
        break;
      }
      blockRows.push(plainLine);
      blockOriginal.push(originalLine);
      cursor += 1;
    }

    const parsedRows = blockRows
      .map((line) => parseUnicodeTableRow(line))
      .filter((row): row is { indent: string; cells: UnicodeTableCell[] } => row != null);

    if (parsedRows.length === 0) {
      normalized.push(...blockOriginal);
      index = cursor;
      continue;
    }

    const borderLines = blockRows
      .map((line) => parseUnicodeTableBorder(line))
      .filter(
        (border): border is { indent: string; left: string; right: string } => border != null,
      );
    if (borderLines.length < 2) {
      normalized.push(...blockOriginal);
      index = cursor;
      continue;
    }

    const indent = parsedRows[0]?.indent ?? borderLines[0]?.indent ?? "";
    const html = buildUnicodeTableHtml(
      parsedRows.map((row) => row.cells),
      indent,
    );
    normalized.push(`${tableHtmlLinePrefix}${html}`);
    index = cursor;
  }

  return normalized;
};

export const normalizeMarkdownPipeTableLines = (lines: string[]): string[] => {
  const normalized: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const headerLine = lines[index] ?? "";
    const headerRow = parseMarkdownTableRow(stripAnsi(headerLine), { allowListPrefix: true });
    if (!headerRow) {
      normalized.push(headerLine);
      index += 1;
      continue;
    }

    const delimiterLine = lines[index + 1] ?? "";
    if (delimiterLine.length === 0) {
      normalized.push(headerLine);
      index += 1;
      continue;
    }
    const delimiterRow = parseMarkdownTableDelimiterRow(
      stripAnsi(delimiterLine),
      headerRow.cells.length,
    );
    if (!delimiterRow) {
      normalized.push(headerLine);
      index += 1;
      continue;
    }

    const bodyRows: string[][] = [];
    let cursor = index + 2;
    while (cursor < lines.length) {
      const bodyRow = parseMarkdownBodyRow(lines, cursor, headerRow.cells.length);
      if (!bodyRow) {
        break;
      }
      bodyRows.push(bodyRow.cells);
      cursor = bodyRow.nextIndex;
    }

    const indent = headerRow.prefix.length > 0 ? "" : headerRow.indent || delimiterRow.indent;
    const html = buildMarkdownPipeTableHtml(
      headerRow.cells,
      delimiterRow.alignments,
      bodyRows,
      indent,
      headerRow.prefix,
    );
    normalized.push(`${tableHtmlLinePrefix}${html}`);
    index = cursor;
  }

  return normalized;
};

export const wrapLineBackground = (html: string, color: string): string =>
  `<span style="background-color:${color}; display:block; width:100%;">${html}</span>`;

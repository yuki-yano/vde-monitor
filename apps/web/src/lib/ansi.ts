import type { HighlightCorrectionConfig } from "@vde-monitor/shared";
import AnsiToHtml from "ansi-to-html";

import type { Theme } from "@/lib/theme";

import { applyClaudeDiffMask, buildClaudeDiffMask, renderClaudeDiffLine } from "./ansi-claude-diff";
import { blendRgb, contrastRatio, luminance, parseColor } from "./ansi-colors";
import {
  ensureLineContent,
  extractBackgroundColor,
  replaceBackgroundColors,
  splitLines,
  stripAnsi,
  wrapLineBackground,
} from "./ansi-text-utils";

const catppuccinLatteAnsi: Record<number, string> = {
  0: "#4c4f69",
  1: "#d20f39",
  2: "#40a02b",
  3: "#df8e1d",
  4: "#1e66f5",
  5: "#8839ef",
  6: "#179299",
  7: "#5c5f77",
  8: "#7c7f93",
  9: "#e64553",
  10: "#40a02b",
  11: "#fe640b",
  12: "#7287fd",
  13: "#ea76cb",
  14: "#04a5e5",
  15: "#eff1f5",
};

const catppuccinMochaAnsi: Record<number, string> = {
  0: "#1e1e2e",
  1: "#f38ba8",
  2: "#a6e3a1",
  3: "#f9e2af",
  4: "#89b4fa",
  5: "#cba6f7",
  6: "#94e2d5",
  7: "#cdd6f4",
  8: "#7f849c",
  9: "#f38ba8",
  10: "#a6e3a1",
  11: "#fab387",
  12: "#b4befe",
  13: "#f5c2e7",
  14: "#89dceb",
  15: "#cdd6f4",
};

const ansiConfigByTheme = {
  latte: {
    fg: "#4c4f69",
    colors: catppuccinLatteAnsi,
  },
  mocha: {
    fg: "#cdd6f4",
    colors: catppuccinMochaAnsi,
  },
} satisfies Record<Theme, { fg: string; colors: Record<number, string> }>;

const buildAnsiToHtml = (theme: Theme, options?: { stream?: boolean }) =>
  new AnsiToHtml({
    fg: ansiConfigByTheme[theme].fg,
    bg: "transparent",
    escapeXML: true,
    colors: ansiConfigByTheme[theme].colors,
    ...options,
  });

const ansiToHtmlByTheme: Record<Theme, AnsiToHtml> = {
  latte: buildAnsiToHtml("latte"),
  mocha: buildAnsiToHtml("mocha"),
};

const fallbackByTheme: Record<Theme, { background: string; text: string }> = {
  latte: { background: "#e6e9ef", text: "#4c4f69" },
  mocha: { background: "#313244", text: "#cdd6f4" },
};

type RenderAnsiOptions = {
  agent?: "codex" | "claude" | "unknown";
  highlightCorrections?: HighlightCorrectionConfig;
};

const isHighlightCorrectionEnabled = (
  options: RenderAnsiOptions | undefined,
  agent: "codex" | "claude",
) => {
  const value = options?.highlightCorrections?.[agent];
  return value !== false;
};

const shouldApplyHighlight = (options: RenderAnsiOptions | undefined, agent: "codex" | "claude") =>
  options?.agent === agent && isHighlightCorrectionEnabled(options, agent);

const needsLowContrastAdjust = (html: string, theme: Theme, options?: RenderAnsiOptions) => {
  if (!shouldApplyHighlight(options, "claude")) return false;
  if (html.includes("background-color")) return true;
  return theme === "latte" && html.includes("color:");
};

const resolveInlineColor = (node: HTMLElement): ReturnType<typeof parseColor> => {
  let current: HTMLElement | null = node;
  while (current) {
    const parsed = parseColor(current.style.color);
    if (parsed) return parsed;
    current = current.parentElement;
  }
  return null;
};

const adjustLowContrast = (html: string, theme: Theme, options?: RenderAnsiOptions): string => {
  if (typeof window === "undefined") {
    return html;
  }
  if (!needsLowContrastAdjust(html, theme, options)) {
    return html;
  }
  const fallback = fallbackByTheme[theme];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const nodes = Array.from(doc.querySelectorAll<HTMLElement>("[style]"));
  nodes.forEach((node) => {
    const bg = parseColor(node.style.backgroundColor);
    if (theme === "latte") {
      if (bg) {
        const bgLum = luminance(bg);
        if (bgLum > 0.28) return;
        node.style.backgroundColor = fallback.background;
        node.style.color = fallback.text;
        return;
      }
      if (options?.agent === "claude") {
        const fg = parseColor(node.style.color);
        if (!fg) return;
        if (luminance(fg) <= 0.85) return;
        node.style.color = fallback.text;
      }
      return;
    }
    if (!bg) return;
    const fg = resolveInlineColor(node);
    if (!fg) return;
    if (contrastRatio(bg, fg) >= 3) return;
    node.style.backgroundColor = fallback.background;
    node.style.color = fallback.text;
  });
  return doc.body.innerHTML;
};

const convertAnsiLineToHtml = (
  converter: AnsiToHtml,
  line: string,
  theme: Theme,
  options?: RenderAnsiOptions,
) => adjustLowContrast(converter.toHtml(line), theme, options);

const codexLatteBackgroundTarget = "#e6e9ef";

const normalizeCodexBackgrounds = (
  html: string,
  theme: Theme,
  options?: RenderAnsiOptions,
): string => {
  if (theme !== "latte" || !shouldApplyHighlight(options, "codex")) {
    return html;
  }
  if (!html.includes("background-color")) {
    return html;
  }
  const fallbackRgb = parseColor(codexLatteBackgroundTarget);
  if (!fallbackRgb) {
    return html;
  }
  return replaceBackgroundColors(html, (match, rawValue: string) => {
    const value = rawValue.trim();
    const rgb = parseColor(value);
    if (!rgb) {
      return match;
    }
    if (luminance(rgb) > 0.28) {
      return match;
    }
    const blended = blendRgb(rgb, fallbackRgb, 1);
    return `background-color: rgb(${blended[0]}, ${blended[1]}, ${blended[2]})`;
  });
};

const buildBackgroundActivityMask = (rawLines: string[]): boolean[] => {
  // eslint-disable-next-line no-control-regex
  const pattern = /\u001b\[([0-9;]*)m/g;
  let backgroundActive = false;
  return rawLines.map((line) => {
    let lineHasBackground = backgroundActive;
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line))) {
      const rawCodes = match[1] ?? "";
      const codes = rawCodes === "" ? [0] : rawCodes.split(";").map((value) => Number(value));
      let index = 0;
      while (index < codes.length) {
        const code = codes[index];
        if (code === undefined || !Number.isFinite(code)) {
          index += 1;
          continue;
        }
        if (code === 0 || code === 49) {
          backgroundActive = false;
          index += 1;
          continue;
        }
        if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) {
          backgroundActive = true;
          lineHasBackground = true;
          index += 1;
          continue;
        }
        if (code === 48) {
          const mode = codes[index + 1];
          backgroundActive = true;
          lineHasBackground = true;
          if (mode === 5) {
            index += 3;
            continue;
          }
          if (mode === 2) {
            index += 5;
            continue;
          }
          index += 1;
          continue;
        }
        index += 1;
      }
    }
    return lineHasBackground;
  });
};

const applyAdjacentBackgroundPadding = (htmlLines: string[], rawLines: string[]): string[] => {
  if (htmlLines.length === 0) return htmlLines;
  const baseColors = htmlLines.map(extractBackgroundColor);
  const plainLines = rawLines.map((line) => stripAnsi(line ?? ""));
  const lineHasContent = plainLines.map((line) => line.trim().length > 0);
  const promptStartPattern = /^\s*\u203A(?:\s|$)/;
  const isPromptStart = plainLines.map((line) => promptStartPattern.test(line));
  const hasPromptMarkers = isPromptStart.some(Boolean);
  const backgroundActive = buildBackgroundActivityMask(rawLines);
  const lineHasBackground = backgroundActive.map(
    (active, index) => active || Boolean(baseColors[index]),
  );

  const nextColorIndex = new Array<number>(baseColors.length).fill(-1);
  let nextColor = -1;
  for (let i = baseColors.length - 1; i >= 0; i -= 1) {
    nextColorIndex[i] = nextColor;
    if (baseColors[i]) {
      nextColor = i;
    }
  }

  if (hasPromptMarkers) {
    const highlightMask = new Array<boolean>(rawLines.length).fill(false);
    const lineStartsWithWhitespace = plainLines.map((line) => line.length > 0 && /^\s/.test(line));
    const applyPromptBlock = (start: number, endExclusive: number) => {
      let lastContent = -1;
      for (let i = start; i < endExclusive; i += 1) {
        if (isPromptStart[i] || lineHasContent[i]) {
          lastContent = i;
        }
      }
      if (lastContent === -1) return;
      for (let i = start; i <= lastContent; i += 1) {
        highlightMask[i] = true;
      }
      const trailing = lastContent + 1;
      if (trailing < endExclusive && !lineHasContent[trailing]) {
        highlightMask[trailing] = true;
      }
    };

    for (let i = 0; i < rawLines.length; i += 1) {
      if (!isPromptStart[i]) {
        continue;
      }
      let endExclusive = rawLines.length;
      for (let j = i + 1; j < rawLines.length; j += 1) {
        if (isPromptStart[j]) {
          endExclusive = j;
          break;
        }
        if (lineHasContent[j] && !lineStartsWithWhitespace[j]) {
          endExclusive = j;
          break;
        }
      }
      applyPromptBlock(i, endExclusive);
      i = endExclusive - 1;
    }

    const paddedColors: Array<string | null> = [...baseColors];
    let inBlock = false;
    let blockColor: string | null = null;
    for (let i = 0; i < highlightMask.length; i += 1) {
      if (!highlightMask[i]) {
        inBlock = false;
        blockColor = null;
        continue;
      }
      const baseColor = baseColors[i] ?? null;
      if (!inBlock) {
        inBlock = true;
        const nextIndex = nextColorIndex[i];
        const nextColor =
          typeof nextIndex === "number" && nextIndex >= 0 ? (baseColors[nextIndex] ?? null) : null;
        blockColor = baseColor ?? nextColor;
      } else if (baseColor) {
        blockColor = baseColor;
      }
      if (blockColor && !paddedColors[i]) {
        paddedColors[i] = blockColor;
      }
    }

    return htmlLines.map((html, index) => {
      const color = paddedColors[index];
      if (!color) return html;
      return wrapLineBackground(html, color);
    });
  }

  const segmentBreakers = lineHasContent.map(
    (hasText, index) => hasText && !lineHasBackground[index],
  );
  const nextBackgroundInSegment = new Array<number>(lineHasBackground.length).fill(-1);
  let nextBackground = -1;
  for (let i = lineHasBackground.length - 1; i >= 0; i -= 1) {
    if (segmentBreakers[i]) {
      nextBackground = -1;
      nextBackgroundInSegment[i] = -1;
      continue;
    }
    nextBackgroundInSegment[i] = nextBackground;
    if (lineHasBackground[i]) {
      nextBackground = i;
    }
  }

  const paddedColors: Array<string | null> = [...baseColors];
  let inBlock = false;
  let blockColor: string | null = null;
  let trailingPadUsed = false;

  for (let i = 0; i < lineHasBackground.length; i += 1) {
    if (segmentBreakers[i]) {
      inBlock = false;
      blockColor = null;
      trailingPadUsed = false;
      continue;
    }

    if (lineHasBackground[i]) {
      inBlock = true;
      trailingPadUsed = false;
      const baseColor = baseColors[i] ?? null;
      if (baseColor) {
        blockColor = baseColor;
      } else if (!blockColor) {
        const nextIndex = nextColorIndex[i];
        if (typeof nextIndex === "number" && nextIndex >= 0) {
          blockColor = baseColors[nextIndex] ?? null;
        }
      }
      if (blockColor && !paddedColors[i]) {
        paddedColors[i] = blockColor;
      }
      continue;
    }

    if (!inBlock) {
      continue;
    }

    if (!lineHasContent[i]) {
      if (nextBackgroundInSegment[i] !== -1) {
        if (blockColor && !paddedColors[i]) {
          paddedColors[i] = blockColor;
        }
        continue;
      }
      if (!trailingPadUsed) {
        if (blockColor && !paddedColors[i]) {
          paddedColors[i] = blockColor;
        }
        trailingPadUsed = true;
        continue;
      }
    }

    inBlock = false;
    blockColor = null;
    trailingPadUsed = false;
  }

  return htmlLines.map((html, index) => {
    const color = paddedColors[index];
    if (!color) return html;
    return wrapLineBackground(html, color);
  });
};

const renderDefaultLines = (
  lines: string[],
  converter: AnsiToHtml,
  theme: Theme,
  options: RenderAnsiOptions | undefined,
  shouldApplyCodexHighlight: boolean,
): string[] => {
  const rendered = lines.map((line) => {
    const html = convertAnsiLineToHtml(converter, line, theme, options);
    const normalized = shouldApplyCodexHighlight
      ? normalizeCodexBackgrounds(html, theme, options)
      : html;
    return ensureLineContent(normalized);
  });
  return shouldApplyCodexHighlight ? applyAdjacentBackgroundPadding(rendered, lines) : rendered;
};

const renderClaudeLines = (
  lines: string[],
  converter: AnsiToHtml,
  theme: Theme,
  options: RenderAnsiOptions | undefined,
): string[] => {
  const plainLines = lines.map(stripAnsi);
  const diffMask = buildClaudeDiffMask(plainLines);
  const maskedHtml = applyClaudeDiffMask(plainLines, diffMask);
  return lines.map((line, index) => {
    if (!diffMask[index]) {
      const html = convertAnsiLineToHtml(converter, line, theme, options);
      return ensureLineContent(html);
    }
    const plainLine = plainLines[index] ?? "";
    const masked = maskedHtml[index] ?? renderClaudeDiffLine(plainLine);
    return ensureLineContent(masked);
  });
};

export const renderAnsi = (text: string, theme: Theme = "latte"): string => {
  const html = ansiToHtmlByTheme[theme].toHtml(text);
  return adjustLowContrast(html, theme);
};

export const renderAnsiLines = (
  text: string,
  theme: Theme = "latte",
  options?: RenderAnsiOptions,
): string[] => {
  const converter = buildAnsiToHtml(theme, { stream: false });
  const lines = splitLines(text);
  const shouldApplyCodexHighlight = shouldApplyHighlight(options, "codex");
  const shouldApplyClaudeHighlight = shouldApplyHighlight(options, "claude");
  if (!shouldApplyClaudeHighlight) {
    return renderDefaultLines(lines, converter, theme, options, shouldApplyCodexHighlight);
  }
  return renderClaudeLines(lines, converter, theme, options);
};

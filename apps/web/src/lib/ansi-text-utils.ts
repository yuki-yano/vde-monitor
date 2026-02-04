const ansiEscapePattern = new RegExp(String.raw`\u001b\[[0-?]*[ -/]*[@-~]`, "g");
const backgroundColorPattern = /background-color:\s*([^;"']+)/i;
const backgroundColorPatternGlobal = /background-color:\s*([^;"']+)/gi;

export const stripAnsi = (value: string) => value.replace(ansiEscapePattern, "");

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

export const normalizeLineBreaks = (text: string) => text.replace(/\r\n/g, "\n");

export const splitLines = (text: string) => normalizeLineBreaks(text).split("\n");

export const wrapLineBackground = (html: string, color: string): string =>
  `<span style="background-color:${color}; display:block; width:100%;">${html}</span>`;

export const hasVisibleText = (line: string): boolean => stripAnsi(line).length > 0;

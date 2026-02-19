const zeroWidthPattern = /[\u200B\uFEFF]/g;
const nonBreakingSpacePattern = /\u00A0/g;

const isFilteredControlCode = (code: number) => {
  const isC0Control = code <= 0x1f && code !== 0x09 && code !== 0x0a;
  const isC1Control = code >= 0x7f && code <= 0x9f;
  return isC0Control || isC1Control;
};

export const sanitizeLogCopyText = (value: string): string => {
  if (!value) return "";
  const normalized = value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(nonBreakingSpacePattern, " ")
    .replace(zeroWidthPattern, "");
  let result = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index] ?? "";
    const code = char.charCodeAt(0);
    if (isFilteredControlCode(code)) continue;
    result += char;
  }
  return result;
};

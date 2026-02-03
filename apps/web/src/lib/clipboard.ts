const zeroWidthPattern = /[\u200B\uFEFF]/g;

export const sanitizeLogCopyText = (value: string): string => {
  if (!value) return "";
  const normalized = value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(zeroWidthPattern, "");
  let result = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index] ?? "";
    const code = char.charCodeAt(0);
    const isControl =
      (code <= 0x1f && code !== 0x09 && code !== 0x0a) || (code >= 0x7f && code <= 0x9f);
    if (isControl) continue;
    result += char;
  }
  return result;
};

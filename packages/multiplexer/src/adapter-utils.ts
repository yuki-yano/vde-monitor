/**
 * Converts an unknown value to a non-empty string or null.
 * Handles string and undefined/null inputs safely.
 */
export const toNullable = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

/**
 * Converts an unknown value to a finite number or null.
 * Handles actual number values as well as numeric strings.
 */
export const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
};

/**
 * Strips carriage returns, splits into lines, and removes trailing blank lines.
 * Returns the resulting lines array.
 */
export const normalizeLines = (text: string): string[] => {
  const lines = text.replace(/\r/g, "").split("\n");
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === "") {
    lines.pop();
  }
  return lines;
};

/**
 * Normalizes screen text by stripping trailing blank lines and limiting to lineLimit lines.
 */
export const normalizeScreen = (text: string, lineLimit: number): string => {
  const lines = normalizeLines(text);
  if (lines.length > lineLimit) {
    return lines.slice(-lineLimit).join("\n");
  }
  return lines.join("\n");
};

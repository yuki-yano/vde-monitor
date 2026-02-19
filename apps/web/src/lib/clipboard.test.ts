import { describe, expect, it } from "vitest";

import { sanitizeLogCopyText } from "./clipboard";

describe("sanitizeLogCopyText", () => {
  it("removes control characters but keeps tabs and newlines", () => {
    const input = "ok\tline1\nline2\u0007bell";
    expect(sanitizeLogCopyText(input)).toBe("ok\tline1\nline2bell");
  });

  it("normalizes carriage returns and removes zero-width space", () => {
    const input = "line1\r\nline2\rline3\u200B";
    expect(sanitizeLogCopyText(input)).toBe("line1\nline2\nline3");
  });

  it("normalizes non-breaking spaces", () => {
    const input = "-\u00A0long-token";
    expect(sanitizeLogCopyText(input)).toBe("- long-token");
  });
});

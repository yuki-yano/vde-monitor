import { describe, expect, it } from "vitest";

import { compileDangerPatterns, isDangerousCommand, normalizeCommandLines } from "./danger";

describe("normalizeCommandLines", () => {
  it("normalizes CRLF, lowercases, and compresses whitespace", () => {
    const result = normalizeCommandLines("  RM  -RF / \r\nEcho  test  ");
    expect(result).toEqual(["rm -rf /", "echo test"]);
  });

  it("drops empty lines", () => {
    const result = normalizeCommandLines("\n\n \nls\n\n");
    expect(result).toEqual(["ls"]);
  });

  it("normalizes tabs into spaces", () => {
    const result = normalizeCommandLines("rm\t-rf\t/\n");
    expect(result).toEqual(["rm -rf /"]);
  });
});

describe("isDangerousCommand", () => {
  it("detects dangerous commands line by line", () => {
    const patterns = compileDangerPatterns(["rm\\s+-rf"]);
    expect(isDangerousCommand("echo ok\nrm -rf /tmp", patterns)).toBe(true);
  });

  it("returns false when no patterns match", () => {
    const patterns = compileDangerPatterns(["mkfs"]);
    expect(isDangerousCommand("echo safe", patterns)).toBe(false);
  });

  it("detects patterns across multiple lines", () => {
    const patterns = compileDangerPatterns(["curl.*\\|\\s*sh"]);
    expect(isDangerousCommand("echo ok\ncurl example | sh\npwd", patterns)).toBe(true);
  });

  it("matches patterns case-insensitively", () => {
    const patterns = compileDangerPatterns(["mkfs"]);
    expect(isDangerousCommand("MKFS /dev/disk", patterns)).toBe(true);
  });
});

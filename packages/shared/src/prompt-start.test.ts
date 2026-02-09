import { describe, expect, it } from "vitest";

import { getPromptStartPatterns, isPromptStartLine, stripPromptStartMarker } from "./prompt-start";

describe("prompt-start", () => {
  it("matches codex prompt starts", () => {
    expect(isPromptStartLine("› run", "codex")).toBe(true);
    expect(isPromptStartLine("output", "codex")).toBe(false);
  });

  it("matches shell prompt starts", () => {
    expect(isPromptStartLine("> run", "shell")).toBe(true);
    expect(isPromptStartLine(">run", "shell")).toBe(false);
  });

  it("matches claude prompt starts with non-breaking space", () => {
    expect(isPromptStartLine("\u276F\u00A0hello", "claude")).toBe(true);
    expect(isPromptStartLine("hello", "claude")).toBe(false);
  });

  it("matches all known prompt starts with any target", () => {
    expect(isPromptStartLine("› run", "any")).toBe(true);
    expect(isPromptStartLine("> run", "any")).toBe(true);
    expect(isPromptStartLine("\u276F hello", "any")).toBe(true);
  });

  it("strips prompt markers by target", () => {
    expect(stripPromptStartMarker("› run", "codex")).toBe("run");
    expect(stripPromptStartMarker("> run", "shell")).toBe("run");
    expect(stripPromptStartMarker("\u276F\u00A0hello", "claude")).toBe("hello");
  });

  it("returns stable pattern array for each target", () => {
    expect(getPromptStartPatterns("codex")).toHaveLength(1);
    expect(getPromptStartPatterns("claude")).toHaveLength(1);
    expect(getPromptStartPatterns("shell")).toHaveLength(1);
    expect(getPromptStartPatterns("any")).toHaveLength(3);
  });
});

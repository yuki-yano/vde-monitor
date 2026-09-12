import { describe, expect, it } from "vitest";

import { isPromptStartLine, stripPromptStartMarker } from "./prompt-start";

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

  it("matches only agent prompt starts with agent target", () => {
    expect(isPromptStartLine("› run", "agent")).toBe(true);
    expect(isPromptStartLine("\u276F hello", "agent")).toBe(true);
    expect(isPromptStartLine("> run", "agent")).toBe(false);
  });

  it("strips prompt markers by target", () => {
    expect(stripPromptStartMarker("› run", "codex")).toBe("run");
    expect(stripPromptStartMarker("> run", "shell")).toBe("run");
    expect(stripPromptStartMarker("\u276F\u00A0hello", "claude")).toBe("hello");
  });
});

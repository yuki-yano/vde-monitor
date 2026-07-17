import { describe, expect, it } from "vitest";

import { findPromptCompletionToken, quotePromptFilePath } from "./prompt-completion-token";

describe("findPromptCompletionToken", () => {
  it("finds Codex Skill tokens at the caret", () => {
    expect(findPromptCompletionToken({ value: "Use $react", caret: 10, agent: "codex" })).toEqual({
      trigger: "dollar",
      query: "react",
      start: 4,
      end: 10,
    });
  });

  it("does not enable dollar completions for Claude", () => {
    expect(findPromptCompletionToken({ value: "$react", caret: 6, agent: "claude" })).toBeNull();
  });

  it("finds slash completions at any token boundary", () => {
    expect(findPromptCompletionToken({ value: "/compact", caret: 8, agent: "codex" })).toEqual({
      trigger: "slash",
      query: "compact",
      start: 0,
      end: 8,
    });
    expect(findPromptCompletionToken({ value: "Try /compact", caret: 12, agent: "codex" })).toEqual(
      {
        trigger: "slash",
        query: "compact",
        start: 4,
        end: 12,
      },
    );
  });

  it("finds file tokens for both supported agents", () => {
    expect(
      findPromptCompletionToken({ value: "Read @src/app", caret: 13, agent: "claude" }),
    ).toEqual({
      trigger: "at",
      query: "src/app",
      start: 5,
      end: 13,
    });
  });
});

describe("quotePromptFilePath", () => {
  it("quotes paths containing whitespace", () => {
    expect(quotePromptFilePath("docs/My Guide.md")).toBe('"docs/My Guide.md"');
    expect(quotePromptFilePath("src/app.ts")).toBe("src/app.ts");
  });

  it("escapes quotes and backslashes inside quoted paths", () => {
    expect(quotePromptFilePath('docs/My "Guide".md')).toBe('"docs/My \\"Guide\\".md"');
    expect(quotePromptFilePath("docs/My \\ Guide.md")).toBe('"docs/My \\\\ Guide.md"');
  });
});

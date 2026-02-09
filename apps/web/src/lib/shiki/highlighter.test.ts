import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { codeToHtmlMock, createHighlighterMock } = vi.hoisted(() => {
  const codeToHtml = vi.fn();
  const createHighlighter = vi.fn(async () => ({
    codeToHtml,
  }));
  return {
    codeToHtmlMock: codeToHtml,
    createHighlighterMock: createHighlighter,
  };
});

vi.mock("shiki", () => ({
  createHighlighter: createHighlighterMock,
}));

import { highlightCode, resetShikiHighlighter } from "./highlighter";

describe("highlightCode", () => {
  beforeEach(() => {
    codeToHtmlMock.mockReset();
    createHighlighterMock.mockClear();
    resetShikiHighlighter();
  });

  afterEach(() => {
    resetShikiHighlighter();
  });

  it("maps language alias and theme name", async () => {
    codeToHtmlMock.mockReturnValue("<pre>ok</pre>");

    const result = await highlightCode({
      code: "const value = 1",
      lang: "ts",
      theme: "latte",
    });

    expect(result.html).toBe("<pre>ok</pre>");
    expect(codeToHtmlMock).toHaveBeenCalledWith("const value = 1", {
      lang: "typescript",
      theme: "catppuccin-latte",
    });
  });

  it("caches highlighted html for identical input", async () => {
    codeToHtmlMock.mockReturnValue("<pre>cached</pre>");

    await highlightCode({
      code: "const value = 1",
      lang: "ts",
      theme: "latte",
    });
    await highlightCode({
      code: "const value = 1",
      lang: "ts",
      theme: "latte",
    });

    expect(createHighlighterMock).toHaveBeenCalledTimes(1);
    expect(codeToHtmlMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to txt when requested language highlight fails", async () => {
    codeToHtmlMock.mockImplementation((_, options: { lang: string }) => {
      if (options.lang === "javascript") {
        throw new Error("language not loaded");
      }
      return "<pre>txt</pre>";
    });

    const result = await highlightCode({
      code: "const value = 1",
      lang: "javascript",
      theme: "mocha",
    });

    expect(result.language).toBe("txt");
    expect(codeToHtmlMock).toHaveBeenNthCalledWith(1, "const value = 1", {
      lang: "javascript",
      theme: "catppuccin-mocha",
    });
    expect(codeToHtmlMock).toHaveBeenNthCalledWith(2, "const value = 1", {
      lang: "txt",
      theme: "catppuccin-mocha",
    });
  });
});

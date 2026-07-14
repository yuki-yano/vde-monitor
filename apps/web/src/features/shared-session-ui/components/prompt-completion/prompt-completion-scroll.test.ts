import { describe, expect, it } from "vitest";

import { resolvePromptCompletionScrollDelta } from "./prompt-completion-scroll";

describe("resolvePromptCompletionScrollDelta", () => {
  it("scrolls just enough to reveal the completion list", () => {
    expect(
      resolvePromptCompletionScrollDelta({
        inputRect: { top: 300, bottom: 360 },
        listRect: { top: 360, bottom: 610 },
        viewportTop: 0,
        viewportBottom: 500,
      }),
    ).toBe(122);
  });

  it("keeps the input visible when the viewport is too short for all content", () => {
    expect(
      resolvePromptCompletionScrollDelta({
        inputRect: { top: 40, bottom: 100 },
        listRect: { top: 100, bottom: 500 },
        viewportTop: 0,
        viewportBottom: 300,
      }),
    ).toBe(28);
  });

  it("scrolls upward when the input is above the visual viewport", () => {
    expect(
      resolvePromptCompletionScrollDelta({
        inputRect: { top: 80, bottom: 140 },
        listRect: { top: 140, bottom: 250 },
        viewportTop: 100,
        viewportBottom: 500,
      }),
    ).toBe(-32);
  });

  it("keeps the input visible when content overflows both viewport edges", () => {
    expect(
      resolvePromptCompletionScrollDelta({
        inputRect: { top: 80, bottom: 140 },
        listRect: { top: 140, bottom: 600 },
        viewportTop: 100,
        viewportBottom: 500,
      }),
    ).toBe(-32);
  });
});

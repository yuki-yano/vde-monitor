import { describe, expect, it } from "vitest";

import { ensureLineContent, replaceBackgroundColors, stripAnsi } from "./ansi-text-utils";

describe("ansi-text-utils", () => {
  it("strips ANSI escape codes", () => {
    expect(stripAnsi("\u001b[31mred\u001b[0m")).toBe("red");
  });

  it("ensures line content when html is empty", () => {
    expect(ensureLineContent("")).toContain("&#x200B;");
  });

  it("keeps existing html content", () => {
    expect(ensureLineContent("<span>hi</span>")).toBe("<span>hi</span>");
  });

  it("replaces background colors using replacer", () => {
    const html = '<span style="background-color:#000">x</span>';
    const replaced = replaceBackgroundColors(html, (_match, rawValue) => {
      return `background-color:${rawValue}-changed`;
    });
    expect(replaced).toContain("background-color:#000-changed");
  });
});

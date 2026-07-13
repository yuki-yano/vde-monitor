import { describe, expect, it } from "vitest";

import type { CmuxRenderGridLine } from "./render-grid";
import { mergeCmuxStyledTail } from "./styled-tail";

const styled = (plain: string): CmuxRenderGridLine => ({
  plain,
  styled: `\u001b[0m${plain}\u001b[0m`,
});

describe("mergeCmuxStyledTail", () => {
  it("replaces an aligned tail and keeps older lines plain", () => {
    expect(
      mergeCmuxStyledTail({
        plainLines: ["old", "one", "two", "three"],
        gridLines: [styled("one"), styled("two"), styled("three")],
        maxLines: 10,
      }),
    ).toEqual(["old", "\u001b[0mone\u001b[0m", "\u001b[0mtwo\u001b[0m", "\u001b[0mthree\u001b[0m"]);
  });

  it("includes output appended after the plain snapshot", () => {
    expect(
      mergeCmuxStyledTail({
        plainLines: ["prefix", "one", "two", "three"],
        gridLines: [styled("one"), styled("two"), styled("three"), styled("four")],
        maxLines: 10,
      }),
    ).toEqual([
      "prefix",
      "\u001b[0mone\u001b[0m",
      "\u001b[0mtwo\u001b[0m",
      "\u001b[0mthree\u001b[0m",
      "\u001b[0mfour\u001b[0m",
    ]);
  });

  it("uses the matching suffix when the grid contains more history", () => {
    expect(
      mergeCmuxStyledTail({
        plainLines: ["two", "three", "four"],
        gridLines: [styled("one"), styled("two"), styled("three"), styled("four")],
        maxLines: 3,
      }),
    ).toEqual(["\u001b[0mtwo\u001b[0m", "\u001b[0mthree\u001b[0m", "\u001b[0mfour\u001b[0m"]);
  });

  it("ignores blank viewport rows after the textual tail", () => {
    expect(
      mergeCmuxStyledTail({
        plainLines: ["one", "two", "three"],
        gridLines: [styled("one"), styled("two"), styled("three"), styled(""), styled(" ")],
        maxLines: 10,
      }),
    ).toEqual(["\u001b[0mone\u001b[0m", "\u001b[0mtwo\u001b[0m", "\u001b[0mthree\u001b[0m"]);
  });

  it("aligns rows containing wide characters without synthetic spaces", () => {
    expect(
      mergeCmuxStyledTail({
        plainLines: ["before", "こんにちは！", "幅広文字の行", "after"],
        gridLines: [styled("こんにちは！"), styled("幅広文字の行"), styled("after")],
        maxLines: 10,
      }),
    ).toEqual([
      "before",
      "\u001b[0mこんにちは！\u001b[0m",
      "\u001b[0m幅広文字の行\u001b[0m",
      "\u001b[0mafter\u001b[0m",
    ]);
  });

  it("returns null when alignment is ambiguous", () => {
    expect(
      mergeCmuxStyledTail({
        plainLines: ["repeated line long enough", "repeated line long enough"],
        gridLines: [
          styled("repeated line long enough"),
          styled("repeated line long enough"),
          styled("repeated line long enough"),
        ],
        maxLines: 10,
      }),
    ).toBeNull();
  });

  it("returns null for a mismatch or an insufficient moving anchor", () => {
    expect(
      mergeCmuxStyledTail({
        plainLines: ["one", "two", "three"],
        gridLines: [styled("different"), styled("tail")],
        maxLines: 10,
      }),
    ).toBeNull();
    expect(
      mergeCmuxStyledTail({
        plainLines: ["old", "ok"],
        gridLines: [styled("ok"), styled("new")],
        maxLines: 10,
      }),
    ).toBeNull();
  });
});

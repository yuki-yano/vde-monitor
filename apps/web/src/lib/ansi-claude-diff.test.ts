import { describe, expect, it } from "vitest";

import { applyClaudeDiffMask, buildClaudeDiffMask, renderClaudeDiffLine } from "./ansi-claude-diff";

describe("buildClaudeDiffMask", () => {
  it("marks diff blocks including continuation and neutral lines", () => {
    const lines = [
      "  1 -old",
      "    continuation",
      "...",
      "  2 +new",
      "    continuation 2",
      "outside",
    ];

    const mask = buildClaudeDiffMask(lines);

    expect(mask).toEqual([true, true, true, true, true, false]);
  });

  it("does not mark numbered blocks when no +/- marker is present", () => {
    const lines = ["  10 context", "  11 more-context", "outside"];

    const mask = buildClaudeDiffMask(lines);

    expect(mask).toEqual([false, false, false]);
  });
});

describe("applyClaudeDiffMask", () => {
  it("styles continuation lines using current marker and resets at mask gaps", () => {
    const plainLines = ["  1 +foo", "    cont", "gap", "    after-gap"];
    const mask = [true, true, false, true];

    const rendered = applyClaudeDiffMask(plainLines, mask);

    expect(rendered[0]).toContain('class="text-latte-green-text"');
    expect(rendered[1]).toContain('class="text-latte-green-text"');
    expect(rendered[2]).toBeNull();
    expect(rendered[3]).toContain('class="text-latte-text"');
  });
});

describe("renderClaudeDiffLine", () => {
  it("escapes html and applies diff marker class", () => {
    const rendered = renderClaudeDiffLine("  10 +<tag>");

    expect(rendered).toContain("&lt;tag&gt;");
    expect(rendered).toContain('class="text-latte-text"');
    expect(rendered).toContain('class="text-latte-green-text"');
  });
});

import { describe, expect, it } from "vitest";

import { resolveChatGridLayout } from "./chat-grid-layout";

describe("resolveChatGridLayout", () => {
  it("maps 2 panes to 2 columns x 1 row", () => {
    expect(resolveChatGridLayout(2)).toEqual({ columns: 2, rows: 1 });
  });

  it("maps 3 panes to 3 columns x 1 row", () => {
    expect(resolveChatGridLayout(3)).toEqual({ columns: 3, rows: 1 });
  });

  it("maps 4 panes to 2 columns x 2 rows", () => {
    expect(resolveChatGridLayout(4)).toEqual({ columns: 2, rows: 2 });
  });

  it("maps 5 panes to 3 columns x 2 rows", () => {
    expect(resolveChatGridLayout(5)).toEqual({ columns: 3, rows: 2 });
  });

  it("maps 6 panes to 3 columns x 2 rows", () => {
    expect(resolveChatGridLayout(6)).toEqual({ columns: 3, rows: 2 });
  });

  it("clamps values outside the supported range", () => {
    expect(resolveChatGridLayout(1)).toEqual({ columns: 2, rows: 1 });
    expect(resolveChatGridLayout(100)).toEqual({ columns: 3, rows: 2 });
  });
});

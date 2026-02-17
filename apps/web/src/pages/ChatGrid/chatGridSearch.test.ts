import { describe, expect, it } from "vitest";

import { normalizeChatGridPaneParam, serializeChatGridPaneParam } from "./chatGridSearch";

describe("chatGridSearch", () => {
  it("normalizes unknown search values to empty pane ids", () => {
    expect(normalizeChatGridPaneParam(undefined)).toEqual([]);
    expect(normalizeChatGridPaneParam(100)).toEqual([]);
    expect(normalizeChatGridPaneParam("")).toEqual([]);
  });

  it("parses comma separated pane ids with trim, dedupe, and max 6", () => {
    expect(
      normalizeChatGridPaneParam(" pane-1, pane-2 ,pane-1,pane-3,pane-4,pane-5,pane-6,pane-7 "),
    ).toEqual(["pane-1", "pane-2", "pane-3", "pane-4", "pane-5", "pane-6"]);
  });

  it("serializes pane ids for URL search params", () => {
    expect(serializeChatGridPaneParam(["pane-1", "pane-2"])).toBe("pane-1,pane-2");
    expect(serializeChatGridPaneParam(["pane-1", "pane-1"])).toBe("pane-1");
    expect(serializeChatGridPaneParam([])).toBeUndefined();
  });
});

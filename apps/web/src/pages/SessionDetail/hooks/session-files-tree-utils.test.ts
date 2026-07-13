import { describe, expect, it } from "vitest";

import { buildNormalRenderNodes, buildSearchRenderNodes } from "./session-files-tree-utils";

describe("session-files-tree-utils", () => {
  it("preserves ignored metadata for a directly matched directory", () => {
    const nodes = buildSearchRenderNodes({
      searchItems: [
        {
          path: "generated",
          name: "generated",
          kind: "directory",
          score: 1,
          highlights: [],
          isIgnored: true,
        },
      ],
      selectedFilePath: null,
      activeMatchPath: "generated",
      expandedDirSet: new Set(),
    });

    expect(nodes).toEqual([
      expect.objectContaining({
        path: "generated",
        kind: "directory",
        isIgnored: true,
        searchMatched: true,
      }),
    ]);
  });

  it("preserves ignored metadata from a lazily loaded tree page", () => {
    const nodes = buildNormalRenderNodes({
      treePages: {
        ".": {
          basePath: ".",
          entries: [
            {
              path: "generated",
              name: "generated",
              kind: "directory",
              hasChildren: true,
              isIgnored: true,
            },
          ],
        },
      },
      expandedDirSet: new Set(),
      selectedFilePath: null,
    });

    expect(nodes[0]).toEqual(
      expect.objectContaining({
        path: "generated",
        isIgnored: true,
        hasChildren: true,
      }),
    );
  });
});

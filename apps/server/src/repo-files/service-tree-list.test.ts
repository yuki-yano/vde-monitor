// @vitest-environment node
import fs from "node:fs/promises";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createTreeChildrenResolver } from "./service-tree-list";

describe("createTreeChildrenResolver", () => {
  it("evicts old path entries when the cache reaches its limit", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-tree-cache-"));
    try {
      await mkdir(path.join(repoRoot, "first", "child"), { recursive: true });
      await mkdir(path.join(repoRoot, "second", "child"), { recursive: true });
      const firstRealPath = await fs.realpath(path.join(repoRoot, "first"));
      const secondRealPath = await fs.realpath(path.join(repoRoot, "second"));
      const readdirSpy = vi.spyOn(fs, "readdir");
      const resolver = createTreeChildrenResolver({ now: () => 0, maxCacheEntries: 1 });

      await resolver.resolveHasChildren({
        repoRoot,
        nestedWorktreeRoots: [],
        entry: {
          path: "first",
          name: "first",
          kind: "directory",
          classificationRoot: repoRoot,
          classificationPath: "first",
          realPath: firstRealPath,
          isSymbolicLink: false,
        },
      });
      await resolver.resolveHasChildren({
        repoRoot,
        nestedWorktreeRoots: [],
        entry: {
          path: "second",
          name: "second",
          kind: "directory",
          classificationRoot: repoRoot,
          classificationPath: "second",
          realPath: secondRealPath,
          isSymbolicLink: false,
        },
      });
      await resolver.resolveHasChildren({
        repoRoot,
        nestedWorktreeRoots: [],
        entry: {
          path: "first",
          name: "first",
          kind: "directory",
          classificationRoot: repoRoot,
          classificationPath: "first",
          realPath: firstRealPath,
          isSymbolicLink: false,
        },
      });

      expect(
        readdirSpy.mock.calls.filter(([targetPath]) => String(targetPath) === firstRealPath),
      ).toHaveLength(2);
    } finally {
      vi.restoreAllMocks();
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});

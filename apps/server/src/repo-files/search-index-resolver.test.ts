import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createSearchIndexResolver } from "./search-index-resolver";

describe("search index resolver", () => {
  it("adds ignored flags from known paths for file and directory nodes", async () => {
    const runLsFiles = vi.fn(async (_repoRoot: string, args: string[]): Promise<string[]> => {
      if (args[0] === "ls-files" && args[1] === "-z") {
        return ["src/index.ts"];
      }
      if (args[0] === "ls-files" && args.includes("--directory")) {
        return [];
      }
      return [];
    });
    const resolver = createSearchIndexResolver({
      now: () => 0,
      runLsFiles,
    });

    const items = await resolver.withIgnoredFlags("/repo", [
      { path: "src/index.ts", kind: "file" as const },
      { path: "src", kind: "directory" as const },
      { path: "build", kind: "directory" as const },
    ]);

    expect(items).toEqual([
      { path: "src/index.ts", kind: "file", isIgnored: false },
      { path: "src", kind: "directory", isIgnored: false },
      { path: "build", kind: "directory", isIgnored: true },
    ]);
  });

  it("caches search index and known paths within ttl window", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-search-index-"));
    try {
      await mkdir(path.join(repoRoot, "src"), { recursive: true });
      await writeFile(path.join(repoRoot, "src", "index.ts"), "export {};\n");
      const runLsFiles = vi.fn(
        async (_targetRepoRoot: string, args: string[]): Promise<string[]> => {
          if (args[0] === "ls-files" && args[1] === "-z") {
            return ["src/index.ts"];
          }
          return [];
        },
      );
      const resolver = createSearchIndexResolver({
        now: () => 1000,
        runLsFiles,
      });
      const policy = {
        shouldIncludePath: () => true,
        shouldTraverseDirectory: () => true,
        planDirectoryTraversal: () => new Set<string>(),
      };

      const first = await resolver.resolveSearchIndex(repoRoot, policy);
      const second = await resolver.resolveSearchIndex(repoRoot, policy);

      expect(first).toEqual(second);
      expect(first.map((item) => item.path)).toContain("src/index.ts");
      expect(runLsFiles).toHaveBeenCalledTimes(3);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("falls back to non-ignored when known path lookup fails", async () => {
    const resolver = createSearchIndexResolver({
      now: () => 0,
      runLsFiles: vi.fn(async () => {
        throw new Error("git failed");
      }),
    });

    const items = await resolver.withIgnoredFlags("/repo", [
      { path: "src/index.ts", kind: "file" as const },
    ]);

    expect(items).toEqual([{ path: "src/index.ts", kind: "file", isIgnored: false }]);
  });
});

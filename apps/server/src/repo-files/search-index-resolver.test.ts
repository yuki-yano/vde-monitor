import fs from "node:fs/promises";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createSearchIndexResolver } from "./search-index-resolver";

describe("search index resolver", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it("skips full index rebuild when known paths are unchanged after ttl", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-search-index-stable-"));
    try {
      await mkdir(path.join(repoRoot, "src"), { recursive: true });
      await writeFile(path.join(repoRoot, "src", "index.ts"), "export {};\n");
      let nowMs = 0;
      const runLsFiles = vi.fn(
        async (_targetRepoRoot: string, args: string[]): Promise<string[]> => {
          if (args[0] === "ls-files" && args[1] === "-z") {
            return ["src/index.ts"];
          }
          return [];
        },
      );
      const readdirSpy = vi.spyOn(fs, "readdir");
      const resolver = createSearchIndexResolver({
        now: () => nowMs,
        runLsFiles,
      });
      const policy = {
        shouldIncludePath: () => true,
        shouldTraverseDirectory: () => true,
        planDirectoryTraversal: () => new Set<string>(),
      };

      const first = await resolver.resolveSearchIndex(repoRoot, policy);
      const firstReaddirCount = readdirSpy.mock.calls.length;

      nowMs = 6_000;
      const second = await resolver.resolveSearchIndex(repoRoot, policy);

      expect(second).toEqual(first);
      expect(readdirSpy.mock.calls.length).toBe(firstReaddirCount);
      expect(runLsFiles).toHaveBeenCalledTimes(6);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("rebuilds index when known paths change after ttl", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-search-index-changed-"));
    try {
      await mkdir(path.join(repoRoot, "src"), { recursive: true });
      await writeFile(path.join(repoRoot, "src", "index.ts"), "export {};\n");
      let trackedPaths = ["src/index.ts"];
      let nowMs = 0;
      const runLsFiles = vi.fn(
        async (_targetRepoRoot: string, args: string[]): Promise<string[]> => {
          if (args[0] === "ls-files" && args[1] === "-z") {
            return trackedPaths;
          }
          return [];
        },
      );
      const resolver = createSearchIndexResolver({
        now: () => nowMs,
        runLsFiles,
      });
      const policy = {
        shouldIncludePath: () => true,
        shouldTraverseDirectory: () => true,
        planDirectoryTraversal: () => new Set<string>(),
      };

      const first = await resolver.resolveSearchIndex(repoRoot, policy);
      expect(first.map((item) => item.path)).toContain("src/index.ts");
      expect(first.map((item) => item.path)).not.toContain("src/new.ts");

      await writeFile(path.join(repoRoot, "src", "new.ts"), "export const next = true;\n");
      trackedPaths = ["src/index.ts", "src/new.ts"];
      nowMs = 6_000;

      const second = await resolver.resolveSearchIndex(repoRoot, policy);
      expect(second.map((item) => item.path)).toContain("src/new.ts");
      expect(runLsFiles).toHaveBeenCalledTimes(6);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("avoids re-scanning large trees when post-ttl known paths are unchanged", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-search-index-large-"));
    try {
      const trackedPaths: string[] = [];
      for (let index = 0; index < 40; index += 1) {
        const dirName = `pkg-${String(index).padStart(2, "0")}`;
        await mkdir(path.join(repoRoot, dirName), { recursive: true });
        const relativePath = `${dirName}/index.ts`;
        trackedPaths.push(relativePath);
        await writeFile(
          path.join(repoRoot, relativePath),
          `export const value${index} = ${index};\n`,
        );
      }

      let nowMs = 0;
      const runLsFiles = vi.fn(
        async (_targetRepoRoot: string, args: string[]): Promise<string[]> => {
          if (args[0] === "ls-files" && args[1] === "-z") {
            return trackedPaths;
          }
          return [];
        },
      );
      const readdirSpy = vi.spyOn(fs, "readdir");
      const resolver = createSearchIndexResolver({
        now: () => nowMs,
        runLsFiles,
      });
      const policy = {
        shouldIncludePath: () => true,
        shouldTraverseDirectory: () => true,
        planDirectoryTraversal: () => new Set<string>(),
      };

      const first = await resolver.resolveSearchIndex(repoRoot, policy);
      const firstReaddirCount = readdirSpy.mock.calls.length;
      expect(first.map((item) => item.path)).toContain("pkg-00/index.ts");
      expect(firstReaddirCount).toBeGreaterThanOrEqual(41);

      nowMs = 6_000;
      const second = await resolver.resolveSearchIndex(repoRoot, policy);
      expect(second).toEqual(first);
      expect(readdirSpy.mock.calls.length).toBe(firstReaddirCount);
      expect(runLsFiles).toHaveBeenCalledTimes(6);
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

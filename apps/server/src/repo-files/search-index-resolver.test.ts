import fs from "node:fs/promises";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createGitPathSnapshotResolver } from "./git-path-snapshot";
import { createSearchIndexResolver } from "./search-index-resolver";

describe("search index resolver", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shares tracked and ignored classification through a cached git snapshot", async () => {
    const runGitPaths = vi.fn(
      async (_repoRoot: string, args: string[], input?: string): Promise<string[]> => {
        if (args[0] === "ls-files") {
          return ["src/tracked.log"];
        }
        return (input ?? "").split("\0").filter((entry) => entry.endsWith(".log"));
      },
    );
    const gitPaths = createGitPathSnapshotResolver({ now: () => 0, runGitPaths });

    const first = await gitPaths.classifyPaths("/repo", [
      { path: "src", kind: "directory" as const },
      { path: "src/tracked.log", kind: "file" as const },
      { path: "ignored.log", kind: "file" as const },
    ]);
    const second = await gitPaths.classifyPaths("/repo", [
      { path: "ignored.log", kind: "file" as const },
    ]);

    expect(first.map(({ path: targetPath, isIgnored }) => [targetPath, isIgnored])).toEqual([
      ["src", false],
      ["src/tracked.log", false],
      ["ignored.log", true],
    ]);
    expect(second[0]?.isIgnored).toBe(true);
    expect(runGitPaths.mock.calls.filter(([, args]) => args[0] === "ls-files")).toHaveLength(1);
    expect(runGitPaths.mock.calls.filter(([, args]) => args[0] === "check-ignore")).toHaveLength(1);
  });

  it("caches the filesystem index and does not recurse into ignored directories", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-search-index-"));
    try {
      await mkdir(path.join(repoRoot, "src"), { recursive: true });
      await mkdir(path.join(repoRoot, "ignored"), { recursive: true });
      await writeFile(path.join(repoRoot, "src", "index.ts"), "export {};\n");
      await writeFile(path.join(repoRoot, "ignored", "deep.txt"), "hidden\n");
      const canonicalRepoRoot = await fs.realpath(repoRoot);
      const gitPaths = {
        classifyPaths: async <T extends { path: string }>(_targetRepoRoot: string, items: T[]) =>
          items.map((item) => ({
            ...item,
            isIgnored: item.path === "ignored" || item.path.startsWith("ignored/"),
          })),
      };
      const readdirSpy = vi.spyOn(fs, "readdir");
      const resolver = createSearchIndexResolver({ now: () => 0, gitPaths });

      const first = await resolver.resolveSearchIndex(repoRoot);
      const second = await resolver.resolveSearchIndex(repoRoot);

      expect(first).toEqual(second);
      expect(first.map((item) => item.path)).toContain("ignored");
      expect(first.map((item) => item.path)).not.toContain("ignored/deep.txt");
      expect(
        readdirSpy.mock.calls.some(
          ([targetPath]) => String(targetPath) === path.join(canonicalRepoRoot, "ignored"),
        ),
      ).toBe(false);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("propagates git failures instead of classifying files as visible", async () => {
    const gitPaths = createGitPathSnapshotResolver({
      now: () => 0,
      runGitPaths: vi.fn(async () => {
        throw new Error("git failed");
      }),
    });

    await expect(
      gitPaths.classifyPaths("/repo", [{ path: "file.txt", kind: "file" }]),
    ).rejects.toThrow("git failed");
  });
});

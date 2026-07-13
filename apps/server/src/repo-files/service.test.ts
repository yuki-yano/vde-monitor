// @vitest-environment node
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createRepoFileService } from "./service";

const execFileAsync = promisify(execFile);

const runGitCommand = async (repoRoot: string, args: string[]) => {
  await execFileAsync("git", ["-C", repoRoot, ...args], { encoding: "utf8" });
};

const createService = (now?: () => number) =>
  createRepoFileService({
    fileNavigatorConfig: {
      externalRoots: [],
      autoExpandMatchLimit: 100,
    },
    now,
  });

const makeRepo = async (prefix: string) => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), prefix));
  await runGitCommand(repoRoot, ["init", "--quiet"]);
  return repoRoot;
};

describe("createRepoFileService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists ignored entries as gray metadata without pre-reading ignored directories", async () => {
    const repoRoot = await makeRepo("vde-monitor-repo-files-tree-");
    try {
      await mkdir(path.join(repoRoot, "build", "deep"), { recursive: true });
      await mkdir(path.join(repoRoot, "src"), { recursive: true });
      await writeFile(path.join(repoRoot, ".gitignore"), "build/\n*.log\n");
      await writeFile(path.join(repoRoot, "build", "deep", "artifact.txt"), "artifact\n");
      await writeFile(path.join(repoRoot, "debug.log"), "debug\n");
      await writeFile(path.join(repoRoot, "src", "index.ts"), "export {};\n");

      const canonicalRepoRoot = await fs.realpath(repoRoot);
      const readdirSpy = vi.spyOn(fs, "readdir");
      const service = createService();
      const rootPage = await service.listTree({ repoRoot, path: ".", limit: 100 });

      expect(rootPage.entries.find((entry) => entry.path === "build")).toMatchObject({
        kind: "directory",
        hasChildren: true,
        isIgnored: true,
      });
      expect(rootPage.entries.find((entry) => entry.path === "debug.log")?.isIgnored).toBe(true);
      expect(rootPage.entries.find((entry) => entry.path === "src")?.isIgnored).toBe(false);
      expect(
        readdirSpy.mock.calls.some(
          ([targetPath]) => String(targetPath) === path.join(canonicalRepoRoot, "build"),
        ),
      ).toBe(false);

      const buildPage = await service.listTree({ repoRoot, path: "build", limit: 100 });
      expect(buildPage.entries).toEqual([
        expect.objectContaining({
          path: "build/deep",
          kind: "directory",
          isIgnored: true,
          hasChildren: true,
        }),
      ]);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("uses gitignore, nested gitignore, info exclude, global exclude, negation, and tracked priority", async () => {
    const repoRoot = await makeRepo("vde-monitor-repo-files-ignore-");
    try {
      await mkdir(path.join(repoRoot, "nested"), { recursive: true });
      await writeFile(path.join(repoRoot, "tracked.log"), "tracked\n");
      await runGitCommand(repoRoot, ["add", "tracked.log"]);
      await writeFile(path.join(repoRoot, ".gitignore"), "*.log\n!important.log\n");
      await writeFile(path.join(repoRoot, "ignored.log"), "ignored\n");
      await writeFile(path.join(repoRoot, "important.log"), "important\n");
      await writeFile(path.join(repoRoot, "nested", ".gitignore"), "*.tmp\n!keep.tmp\n");
      await writeFile(path.join(repoRoot, "nested", "drop.tmp"), "drop\n");
      await writeFile(path.join(repoRoot, "nested", "keep.tmp"), "keep\n");
      await writeFile(path.join(repoRoot, "info.secret"), "info\n");
      await writeFile(path.join(repoRoot, ".git", "info", "exclude"), "info.secret\n");
      const globalIgnorePath = path.join(repoRoot, ".global-ignore");
      await writeFile(globalIgnorePath, "*.global\n");
      await writeFile(path.join(repoRoot, "ignored.global"), "global\n");
      await runGitCommand(repoRoot, ["config", "core.excludesFile", globalIgnorePath]);

      const service = createService();
      const root = await service.listTree({ repoRoot, path: ".", limit: 100 });
      const ignoredByPath = new Map(root.entries.map((entry) => [entry.path, entry.isIgnored]));
      expect(ignoredByPath.get("tracked.log")).toBe(false);
      expect(ignoredByPath.get("ignored.log")).toBe(true);
      expect(ignoredByPath.get("important.log")).toBe(false);
      expect(ignoredByPath.get("info.secret")).toBe(true);
      expect(ignoredByPath.get("ignored.global")).toBe(true);
      expect(ignoredByPath.has(".git")).toBe(false);

      const nested = await service.listTree({ repoRoot, path: "nested", limit: 100 });
      const nestedIgnoredByPath = new Map(
        nested.entries.map((entry) => [entry.path, entry.isIgnored]),
      );
      expect(nestedIgnoredByPath.get("nested/drop.tmp")).toBe(true);
      expect(nestedIgnoredByPath.get("nested/keep.tmp")).toBe(false);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("indexes ignored directory entries but does not recursively search their children", async () => {
    const repoRoot = await makeRepo("vde-monitor-repo-files-search-ignore-");
    try {
      await mkdir(path.join(repoRoot, "build"), { recursive: true });
      await writeFile(path.join(repoRoot, ".gitignore"), "build/\n");
      await writeFile(path.join(repoRoot, "build", "output.txt"), "hidden\n");

      const service = createService();
      const directorySearch = await service.searchFiles({ repoRoot, query: "build", limit: 20 });
      expect(directorySearch.items).toContainEqual(
        expect.objectContaining({ path: "build", kind: "directory", isIgnored: true }),
      );

      const childSearch = await service.searchFiles({ repoRoot, query: "output", limit: 20 });
      expect(childSearch.items.map((item) => item.path)).not.toContain("build/output.txt");
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("opens ignored files of any extension and resolves exact references", async () => {
    const repoRoot = await makeRepo("vde-monitor-repo-files-exact-");
    try {
      await mkdir(path.join(repoRoot, "generated"), { recursive: true });
      await writeFile(path.join(repoRoot, ".gitignore"), "generated/\n");
      await writeFile(path.join(repoRoot, "generated", "payload.custom"), "payload\n");

      const service = createService();
      const exact = await service.searchFiles({
        repoRoot,
        query: "generated/payload.custom",
        limit: 20,
        exactReference: true,
      });
      expect(exact.items).toEqual([
        expect.objectContaining({
          path: "generated/payload.custom",
          kind: "file",
          isIgnored: true,
        }),
      ]);

      const content = await service.getFileContent({
        repoRoot,
        path: "generated/payload.custom",
        maxBytes: 100,
      });
      expect(content.content).toBe("payload\n");
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("allows in-repo symlinks, rejects escapes and git aliases, and avoids directory cycles", async () => {
    const repoRoot = await makeRepo("vde-monitor-repo-files-symlink-");
    const outsideRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-repo-files-outside-"));
    try {
      await mkdir(path.join(repoRoot, "src"), { recursive: true });
      await writeFile(path.join(repoRoot, ".gitignore"), "");
      await writeFile(path.join(repoRoot, "src", "target.txt"), "target\n");
      await writeFile(path.join(outsideRoot, "outside.txt"), "outside\n");
      await symlink(path.join(repoRoot, "src", "target.txt"), path.join(repoRoot, "linked.txt"));
      await symlink(path.join(outsideRoot, "outside.txt"), path.join(repoRoot, "outside.txt"));
      await symlink(path.join(repoRoot, ".git"), path.join(repoRoot, "git-alias"));
      await symlink(
        path.join(repoRoot, "src", "target.txt"),
        path.join(repoRoot, ".git", "public-link"),
      );
      await symlink(repoRoot, path.join(repoRoot, "src", "loop"));

      const service = createService();
      const linkedContent = await service.getFileContent({
        repoRoot,
        path: "linked.txt",
        maxBytes: 100,
      });
      expect(linkedContent.content).toBe("target\n");
      await expect(
        service.getFileContent({ repoRoot, path: "outside.txt", maxBytes: 100 }),
      ).rejects.toMatchObject({ code: "FORBIDDEN_PATH", status: 403 });
      await expect(
        service.getFileContent({ repoRoot, path: "git-alias/config", maxBytes: 100 }),
      ).rejects.toMatchObject({ code: "FORBIDDEN_PATH", status: 403 });
      await expect(
        service.getFileContent({ repoRoot, path: "git-alias/public-link", maxBytes: 100 }),
      ).rejects.toMatchObject({ code: "FORBIDDEN_PATH", status: 403 });

      const rootTree = await service.listTree({ repoRoot, path: ".", limit: 100 });
      expect(rootTree.entries.map((entry) => entry.path)).toContain("linked.txt");
      expect(rootTree.entries.map((entry) => entry.path)).not.toContain("outside.txt");
      expect(rootTree.entries.map((entry) => entry.path)).not.toContain("git-alias");
      const srcTree = await service.listTree({ repoRoot, path: "src", limit: 100 });
      expect(srcTree.entries.map((entry) => entry.path)).not.toContain("src/loop");

      const search = await service.searchFiles({ repoRoot, query: "target", limit: 20 });
      expect(search.items.map((item) => item.path)).toContain("src/target.txt");
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
      await rm(outsideRoot, { recursive: true, force: true });
    }
  });

  it("rejects direct .git access", async () => {
    const repoRoot = await makeRepo("vde-monitor-repo-files-git-hidden-");
    try {
      const service = createService();
      await expect(service.listTree({ repoRoot, path: ".git", limit: 20 })).rejects.toMatchObject({
        code: "FORBIDDEN_PATH",
        status: 403,
      });
      await expect(
        service.searchFiles({
          repoRoot,
          query: ".git/config",
          limit: 20,
          exactReference: true,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN_PATH", status: 403 });
      await expect(
        service.getFileContent({ repoRoot, path: ".git/config", maxBytes: 100 }),
      ).rejects.toMatchObject({ code: "FORBIDDEN_PATH", status: 403 });
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("does not silently fall back when git metadata lookup fails", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-repo-files-no-git-"));
    try {
      await writeFile(path.join(repoRoot, "file.txt"), "text\n");
      const service = createService();
      await expect(service.listTree({ repoRoot, path: ".", limit: 20 })).rejects.toMatchObject({
        code: "INTERNAL",
        status: 500,
      });
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("caches non-ignored directory child checks within ttl", async () => {
    const repoRoot = await makeRepo("vde-monitor-repo-files-children-cache-");
    try {
      await mkdir(path.join(repoRoot, "src"), { recursive: true });
      await writeFile(path.join(repoRoot, "src", "index.ts"), "export {};\n");
      let nowMs = 0;
      const service = createService(() => nowMs);
      const readdirSpy = vi.spyOn(fs, "readdir");

      await service.listTree({ repoRoot, path: ".", limit: 100 });
      await service.listTree({ repoRoot, path: ".", limit: 100 });
      const srcPath = await fs.realpath(path.join(repoRoot, "src"));
      expect(
        readdirSpy.mock.calls.filter(([targetPath]) => String(targetPath) === srcPath),
      ).toHaveLength(1);

      nowMs = 6_000;
      await service.listTree({ repoRoot, path: ".", limit: 100 });
      expect(
        readdirSpy.mock.calls.filter(([targetPath]) => String(targetPath) === srcPath),
      ).toHaveLength(2);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});

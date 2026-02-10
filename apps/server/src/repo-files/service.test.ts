import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { createRepoFileService } from "./service";

const execFileAsync = promisify(execFile);

const runGitCommand = async (repoRoot: string, args: string[]) => {
  await execFileAsync("git", ["-C", repoRoot, ...args], { encoding: "utf8" });
};

describe("createRepoFileService", () => {
  it("lists tree nodes with pagination and includeIgnoredPaths override", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-repo-files-"));
    try {
      await runGitCommand(repoRoot, ["init"]);
      await mkdir(path.join(repoRoot, "src"), { recursive: true });
      await mkdir(path.join(repoRoot, "build"), { recursive: true });
      await writeFile(path.join(repoRoot, ".gitignore"), "build/\n");
      await writeFile(path.join(repoRoot, "src", "index.ts"), "export {};\n");
      await writeFile(path.join(repoRoot, "build", "artifact.txt"), "artifact\n");

      const service = createRepoFileService({
        fileNavigatorConfig: {
          includeIgnoredPaths: ["build/**"],
          autoExpandMatchLimit: 100,
        },
      });

      const rootPage = await service.listTree({
        repoRoot,
        path: ".",
        limit: 1,
      });
      expect(rootPage.entries.length).toBe(1);
      expect(typeof rootPage.nextCursor).toBe("string");

      const buildPage = await service.listTree({
        repoRoot,
        path: "build",
        limit: 100,
      });
      const artifactEntry = buildPage.entries.find((entry) => entry.path === "build/artifact.txt");
      expect(artifactEntry).toBeDefined();
      expect(artifactEntry?.isIgnored).toBe(true);

      const rootFullPage = await service.listTree({
        repoRoot,
        path: ".",
        limit: 100,
      });
      expect(rootFullPage.entries.find((entry) => entry.path === "build")?.isIgnored).toBe(true);
      expect(rootFullPage.entries.find((entry) => entry.path === "src")?.isIgnored).toBe(false);

      const buildSearch = await service.searchFiles({
        repoRoot,
        query: "build",
        limit: 20,
      });
      expect(buildSearch.items.find((item) => item.path === "build")?.kind).toBe("directory");
      expect(buildSearch.items.find((item) => item.path === "build")?.isIgnored).toBe(true);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("excludes gitignored files from search when include override is not set", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-repo-files-search-ignore-"));
    try {
      await runGitCommand(repoRoot, ["init"]);
      await mkdir(path.join(repoRoot, "build"), { recursive: true });
      await writeFile(path.join(repoRoot, ".gitignore"), "build/\n");
      await writeFile(path.join(repoRoot, "build", "output.txt"), "hidden\n");

      const hiddenService = createRepoFileService({
        fileNavigatorConfig: {
          includeIgnoredPaths: [],
          autoExpandMatchLimit: 100,
        },
      });
      const hiddenSearch = await hiddenService.searchFiles({
        repoRoot,
        query: "output",
        limit: 20,
      });
      expect(hiddenSearch.items.map((item) => item.path)).not.toContain("build/output.txt");

      const visibleService = createRepoFileService({
        fileNavigatorConfig: {
          includeIgnoredPaths: ["build/**"],
          autoExpandMatchLimit: 100,
        },
      });
      const visibleSearch = await visibleService.searchFiles({
        repoRoot,
        query: "output",
        limit: 20,
      });
      expect(visibleSearch.items.map((item) => item.path)).toContain("build/output.txt");
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("marks ignored files from .git/info/exclude and global ignore", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-repo-files-ignore-meta-"));
    try {
      await runGitCommand(repoRoot, ["init"]);
      await writeFile(path.join(repoRoot, ".gitignore"), "");
      await writeFile(path.join(repoRoot, "ignored-by-info.log"), "info\n");
      await writeFile(path.join(repoRoot, "ignored-by-global.tmp"), "global\n");
      await writeFile(path.join(repoRoot, "visible.ts"), "visible\n");
      await writeFile(path.join(repoRoot, ".git", "info", "exclude"), "ignored-by-info.log\n");
      const globalIgnorePath = path.join(repoRoot, ".global-ignore");
      await writeFile(globalIgnorePath, "ignored-by-global.tmp\n");
      await runGitCommand(repoRoot, ["config", "core.excludesFile", globalIgnorePath]);

      const service = createRepoFileService({
        fileNavigatorConfig: {
          includeIgnoredPaths: [],
          autoExpandMatchLimit: 100,
        },
      });

      const tree = await service.listTree({
        repoRoot,
        path: ".",
        limit: 100,
      });
      expect(tree.entries.find((entry) => entry.path === "ignored-by-info.log")?.isIgnored).toBe(
        true,
      );
      expect(tree.entries.find((entry) => entry.path === "ignored-by-global.tmp")?.isIgnored).toBe(
        true,
      );
      expect(tree.entries.find((entry) => entry.path === "visible.ts")?.isIgnored).toBe(false);

      const search = await service.searchFiles({
        repoRoot,
        query: "ignored-by",
        limit: 10,
      });
      expect(search.items.find((item) => item.path === "ignored-by-info.log")?.isIgnored).toBe(
        true,
      );
      expect(search.items.find((item) => item.path === "ignored-by-global.tmp")?.isIgnored).toBe(
        true,
      );
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("searches file paths with space-separated words and truncation metadata", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-repo-files-search-"));
    try {
      await mkdir(path.join(repoRoot, "src"), { recursive: true });
      await writeFile(path.join(repoRoot, ".gitignore"), "");
      await writeFile(path.join(repoRoot, "src", "alpha.ts"), "export const alpha = 1;\n");
      await writeFile(path.join(repoRoot, "src", "beta.ts"), "export const beta = 1;\n");
      await writeFile(path.join(repoRoot, "src", "gamma.ts"), "export const gamma = 1;\n");

      const service = createRepoFileService({
        fileNavigatorConfig: {
          includeIgnoredPaths: [],
          autoExpandMatchLimit: 100,
        },
      });

      const page = await service.searchFiles({
        repoRoot,
        query: "a",
        limit: 1,
      });
      expect(page.items.length).toBe(1);
      expect(page.totalMatchedCount).toBeGreaterThanOrEqual(2);
      expect(page.truncated).toBe(true);
      expect(typeof page.nextCursor).toBe("string");
      expect(typeof page.items[0]?.score).toBe("number");
      expect(Array.isArray(page.items[0]?.highlights)).toBe(true);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("matches query tokens across path segments and file names", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-repo-files-search-path-"));
    try {
      await mkdir(path.join(repoRoot, "apps", "server"), { recursive: true });
      await mkdir(path.join(repoRoot, "lib"), { recursive: true });
      await writeFile(path.join(repoRoot, ".gitignore"), "");
      await writeFile(path.join(repoRoot, "apps", "server", "git-helper.ts"), "export {};\n");
      await writeFile(path.join(repoRoot, "lib", "git-helper.ts"), "export {};\n");

      const service = createRepoFileService({
        fileNavigatorConfig: {
          includeIgnoredPaths: [],
          autoExpandMatchLimit: 100,
        },
      });

      const page = await service.searchFiles({
        repoRoot,
        query: "app git",
        limit: 10,
      });

      expect(page.items.map((item) => item.path)).toContain("apps/server/git-helper.ts");
      expect(page.items.map((item) => item.path)).not.toContain("lib/git-helper.ts");
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("matches only files that contain all query words", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-repo-files-search-words-"));
    try {
      await mkdir(path.join(repoRoot, "src"), { recursive: true });
      await writeFile(path.join(repoRoot, ".gitignore"), "");
      await writeFile(path.join(repoRoot, "src", "alpha-beta.ts"), "export const alphaBeta = 1;\n");
      await writeFile(path.join(repoRoot, "src", "alpha.ts"), "export const alpha = 1;\n");
      await writeFile(path.join(repoRoot, "src", "beta.ts"), "export const beta = 1;\n");

      const service = createRepoFileService({
        fileNavigatorConfig: {
          includeIgnoredPaths: [],
          autoExpandMatchLimit: 100,
        },
      });

      const page = await service.searchFiles({
        repoRoot,
        query: "alpha beta",
        limit: 10,
      });

      expect(page.items.map((item) => item.path)).toEqual(["src/alpha-beta.ts"]);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("sets truncated=false on the last search page", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-repo-files-search-last-"));
    try {
      await mkdir(path.join(repoRoot, "src"), { recursive: true });
      await writeFile(path.join(repoRoot, ".gitignore"), "");
      await writeFile(path.join(repoRoot, "src", "alpha.ts"), "export const alpha = 1;\n");
      await writeFile(path.join(repoRoot, "src", "alpine.ts"), "export const alpine = 1;\n");
      await writeFile(path.join(repoRoot, "src", "beta.ts"), "export const beta = 1;\n");

      const service = createRepoFileService({
        fileNavigatorConfig: {
          includeIgnoredPaths: [],
          autoExpandMatchLimit: 100,
        },
      });

      const first = await service.searchFiles({
        repoRoot,
        query: "alp",
        limit: 1,
      });
      expect(first.truncated).toBe(true);
      expect(typeof first.nextCursor).toBe("string");

      const last = await service.searchFiles({
        repoRoot,
        query: "alp",
        cursor: first.nextCursor,
        limit: 1,
      });
      expect(last.nextCursor).toBeUndefined();
      expect(last.truncated).toBe(false);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("throws INVALID_PAYLOAD on empty query", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-repo-files-invalid-"));
    try {
      const service = createRepoFileService({
        fileNavigatorConfig: {
          includeIgnoredPaths: [],
          autoExpandMatchLimit: 100,
        },
      });

      await expect(
        service.searchFiles({
          repoRoot,
          query: " ",
          limit: 10,
        }),
      ).rejects.toMatchObject({
        code: "INVALID_PAYLOAD",
        status: 400,
      });
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("loads file content with truncation and language hint", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-repo-files-content-"));
    try {
      await mkdir(path.join(repoRoot, "src"), { recursive: true });
      await writeFile(path.join(repoRoot, ".gitignore"), "");
      await writeFile(path.join(repoRoot, "src", "index.ts"), "export const value = 123;\n");

      const service = createRepoFileService({
        fileNavigatorConfig: {
          includeIgnoredPaths: [],
          autoExpandMatchLimit: 100,
        },
      });

      const file = await service.getFileContent({
        repoRoot,
        path: "src/index.ts",
        maxBytes: 10,
      });

      expect(file.path).toBe("src/index.ts");
      expect(file.isBinary).toBe(false);
      expect(file.truncated).toBe(true);
      expect(file.languageHint).toBe("typescript");
      expect(file.content?.length).toBe(10);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("returns metadata only when target file is binary", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-repo-files-binary-"));
    try {
      await writeFile(path.join(repoRoot, ".gitignore"), "");
      await writeFile(path.join(repoRoot, "archive.bin"), new Uint8Array([0x00, 0xff, 0x10, 0x20]));

      const service = createRepoFileService({
        fileNavigatorConfig: {
          includeIgnoredPaths: [],
          autoExpandMatchLimit: 100,
        },
      });

      const file = await service.getFileContent({
        repoRoot,
        path: "archive.bin",
        maxBytes: 200,
      });

      expect(file.isBinary).toBe(true);
      expect(file.content).toBeNull();
      expect(file.languageHint).toBeNull();
      expect(file.truncated).toBe(false);
      expect(file.sizeBytes).toBe(4);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("respects visibility policy for file content", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-repo-files-visibility-"));
    try {
      await mkdir(path.join(repoRoot, "build"), { recursive: true });
      await writeFile(path.join(repoRoot, ".gitignore"), "build/\n");
      await writeFile(path.join(repoRoot, "build", "output.txt"), "visible by override\n");

      const hiddenService = createRepoFileService({
        fileNavigatorConfig: {
          includeIgnoredPaths: [],
          autoExpandMatchLimit: 100,
        },
      });
      await expect(
        hiddenService.getFileContent({
          repoRoot,
          path: "build/output.txt",
          maxBytes: 100,
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN_PATH",
        status: 403,
      });

      const overriddenService = createRepoFileService({
        fileNavigatorConfig: {
          includeIgnoredPaths: ["build/**"],
          autoExpandMatchLimit: 100,
        },
      });
      const file = await overriddenService.getFileContent({
        repoRoot,
        path: "build/output.txt",
        maxBytes: 100,
      });

      expect(file.content).toBe("visible by override\n");
      expect(file.isBinary).toBe(false);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("rejects file content access via symbolic links", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-repo-files-symlink-"));
    const outsideRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-repo-files-outside-"));
    try {
      await writeFile(path.join(repoRoot, ".gitignore"), "");
      const outsideFile = path.join(outsideRoot, "outside.txt");
      await writeFile(outsideFile, "outside\n");
      try {
        await symlink(outsideFile, path.join(repoRoot, "outside-link.txt"));
      } catch (error) {
        const code = (error as { code?: unknown }).code;
        if (code === "EPERM" || code === "EACCES" || code === "ENOTSUP") {
          return;
        }
        throw error;
      }

      const service = createRepoFileService({
        fileNavigatorConfig: {
          includeIgnoredPaths: [],
          autoExpandMatchLimit: 100,
        },
      });

      await expect(
        service.getFileContent({
          repoRoot,
          path: "outside-link.txt",
          maxBytes: 100,
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN_PATH",
        status: 403,
      });
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
      await rm(outsideRoot, { recursive: true, force: true });
    }
  });
});

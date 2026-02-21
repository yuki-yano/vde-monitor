import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveFileContent } from "./file-content-resolver";

describe("file content resolver", () => {
  it("reads text files with truncation and language hint", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-file-content-text-"));
    try {
      await mkdir(path.join(repoRoot, "src"), { recursive: true });
      await writeFile(path.join(repoRoot, "src", "index.ts"), "export const value = 123;\n");

      const result = await resolveFileContent({
        repoRoot,
        normalizedPath: "src/index.ts",
        maxBytes: 10,
      });

      expect(result).toMatchObject({
        path: "src/index.ts",
        isBinary: false,
        truncated: true,
        languageHint: "typescript",
      });
      expect(result.content).toBe("export con");
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("detects binary files", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-file-content-bin-"));
    try {
      await mkdir(path.join(repoRoot, "assets"), { recursive: true });
      await writeFile(path.join(repoRoot, "assets", "raw.bin"), Buffer.from([0, 1, 2, 3, 4, 5]));

      const result = await resolveFileContent({
        repoRoot,
        normalizedPath: "assets/raw.bin",
        maxBytes: 1024,
      });

      expect(result).toMatchObject({
        path: "assets/raw.bin",
        isBinary: true,
        truncated: false,
        languageHint: null,
        content: null,
      });
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("does not misclassify utf-8 text when sample ends mid-character", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-file-content-utf8-edge-"));
    try {
      await mkdir(path.join(repoRoot, "tmp"), { recursive: true });
      const content = `${"a".repeat(8_191)}あ`;
      await writeFile(path.join(repoRoot, "tmp", "edge.md"), content);

      const result = await resolveFileContent({
        repoRoot,
        normalizedPath: "tmp/edge.md",
        maxBytes: 20_000,
      });

      expect(result).toMatchObject({
        path: "tmp/edge.md",
        isBinary: false,
        truncated: false,
        languageHint: "markdown",
      });
      expect(result.content).toBe(content);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("rejects non-file paths", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-file-content-dir-"));
    try {
      await mkdir(path.join(repoRoot, "src"), { recursive: true });

      await expect(
        resolveFileContent({
          repoRoot,
          normalizedPath: "src",
          maxBytes: 100,
        }),
      ).rejects.toMatchObject({
        code: "INVALID_PAYLOAD",
        status: 400,
      });
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it("rejects symlink traversal", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-file-content-link-"));
    try {
      await writeFile(path.join(repoRoot, "target.txt"), "target\n");
      await symlink(path.join(repoRoot, "target.txt"), path.join(repoRoot, "linked.txt"));

      await expect(
        resolveFileContent({
          repoRoot,
          normalizedPath: "linked.txt",
          maxBytes: 100,
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN_PATH",
        status: 403,
      });
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});

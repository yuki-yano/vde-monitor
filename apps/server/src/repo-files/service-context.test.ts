import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { normalizeRepoRelativePath } from "./path-guard";
import {
  createServiceError,
  ensureRepoRootAvailable,
  normalizeFileContentPath,
  normalizeSearchQuery,
  toServiceError,
  validateMaxBytes,
} from "./service-context";

describe("repo file service context helpers", () => {
  it("normalizes search query and rejects empty query", () => {
    expect(normalizeSearchQuery("  src test  ")).toBe("src test");
    expect(() => normalizeSearchQuery("   ")).toThrowError();
    try {
      normalizeSearchQuery("   ");
    } catch (error) {
      expect(error).toMatchObject({
        code: "INVALID_PAYLOAD",
        status: 400,
      });
    }
  });

  it("normalizes content path and rejects directory root", () => {
    expect(normalizeFileContentPath("./src/index.ts")).toBe("src/index.ts");
    expect(() => normalizeFileContentPath(".")).toThrowError();
    try {
      normalizeFileContentPath(".");
    } catch (error) {
      expect(error).toMatchObject({
        code: "INVALID_PAYLOAD",
        status: 400,
      });
    }
  });

  it("validates maxBytes as positive number", () => {
    expect(() => validateMaxBytes(1)).not.toThrow();
    expect(() => validateMaxBytes(0)).toThrowError();
    try {
      validateMaxBytes(0);
    } catch (error) {
      expect(error).toMatchObject({
        code: "INVALID_PAYLOAD",
        status: 400,
      });
    }
  });

  it("maps path guard errors with toServiceError", () => {
    let forbiddenError: unknown = null;
    try {
      normalizeRepoRelativePath("../outside");
    } catch (error) {
      forbiddenError = error;
    }
    expect(toServiceError(forbiddenError)).toMatchObject({
      code: "FORBIDDEN_PATH",
      status: 403,
    });
  });

  it("passes through RepoFileServiceError as-is", () => {
    const serviceError = createServiceError("NOT_FOUND", 404, "path not found");
    expect(toServiceError(serviceError)).toBe(serviceError);
  });

  it("ensures repo root exists and is a directory", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "vde-monitor-repo-context-"));
    const filePath = path.join(tempRoot, "file.txt");
    await writeFile(filePath, "x");
    try {
      await expect(ensureRepoRootAvailable(tempRoot)).resolves.toBeUndefined();
      await expect(ensureRepoRootAvailable(filePath)).rejects.toMatchObject({
        code: "REPO_UNAVAILABLE",
        status: 400,
      });
      await expect(ensureRepoRootAvailable(path.join(tempRoot, "missing"))).rejects.toMatchObject({
        code: "REPO_UNAVAILABLE",
        status: 400,
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

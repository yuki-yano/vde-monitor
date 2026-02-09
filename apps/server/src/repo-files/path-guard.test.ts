import path from "node:path";

import { describe, expect, it } from "vitest";

import { normalizeRepoRelativePath, resolveRepoAbsolutePath } from "./path-guard";

describe("normalizeRepoRelativePath", () => {
  it("returns dot for empty input", () => {
    expect(normalizeRepoRelativePath(undefined)).toBe(".");
    expect(normalizeRepoRelativePath("")).toBe(".");
    expect(normalizeRepoRelativePath(".")).toBe(".");
  });

  it("normalizes relative paths", () => {
    expect(normalizeRepoRelativePath("./src/index.ts")).toBe("src/index.ts");
    expect(normalizeRepoRelativePath("src/./index.ts")).toBe("src/index.ts");
  });

  it("rejects absolute paths", () => {
    expect(() => normalizeRepoRelativePath("/etc/passwd")).toThrow();
  });

  it("rejects parent traversal", () => {
    expect(() => normalizeRepoRelativePath("../secret.txt")).toThrow();
    expect(() => normalizeRepoRelativePath("src/../../secret.txt")).toThrow();
  });

  it("rejects backslash-separated input", () => {
    expect(() => normalizeRepoRelativePath("src\\index.ts")).toThrow();
  });
});

describe("resolveRepoAbsolutePath", () => {
  it("resolves paths inside repo root", () => {
    const repoRoot = path.resolve("/tmp/repo");
    const resolved = resolveRepoAbsolutePath(repoRoot, "src/index.ts");
    expect(resolved).toBe(path.resolve(repoRoot, "src/index.ts"));
  });

  it("rejects resolved path outside repo root", () => {
    const repoRoot = path.resolve("/tmp/repo");
    expect(() => resolveRepoAbsolutePath(repoRoot, "../../etc/passwd")).toThrow();
  });
});

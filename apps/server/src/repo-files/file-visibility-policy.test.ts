import { describe, expect, it } from "vitest";

import { createFileVisibilityPolicy } from "./file-visibility-policy";

describe("createFileVisibilityPolicy", () => {
  it("excludes gitignored paths by default", () => {
    const policy = createFileVisibilityPolicy({
      gitignorePatterns: ["build/"],
      includeIgnoredPaths: [],
    });

    expect(policy.shouldIncludePath({ relativePath: "src/index.ts", isDirectory: false })).toBe(
      true,
    );
    expect(policy.shouldIncludePath({ relativePath: "build", isDirectory: true })).toBe(false);
    expect(policy.shouldIncludePath({ relativePath: "build/output.txt", isDirectory: false })).toBe(
      false,
    );
  });

  it("includes ignored paths when includeIgnoredPaths matches", () => {
    const policy = createFileVisibilityPolicy({
      gitignorePatterns: ["build/"],
      includeIgnoredPaths: ["build/**"],
    });

    expect(policy.shouldIncludePath({ relativePath: "build", isDirectory: true })).toBe(true);
    expect(policy.shouldIncludePath({ relativePath: "build/output.txt", isDirectory: false })).toBe(
      true,
    );
  });

  it("keeps ignored ancestor directories traversable for include patterns", () => {
    const policy = createFileVisibilityPolicy({
      gitignorePatterns: ["dist/"],
      includeIgnoredPaths: ["dist/**/*.map"],
    });

    expect(policy.shouldIncludePath({ relativePath: "dist", isDirectory: true })).toBe(true);
    expect(policy.shouldTraverseDirectory("dist")).toBe(true);
    expect(policy.shouldIncludePath({ relativePath: "dist/app.js", isDirectory: false })).toBe(
      false,
    );
    expect(policy.shouldIncludePath({ relativePath: "dist/app.js.map", isDirectory: false })).toBe(
      true,
    );
  });

  it("treats root-wildcard include as traversable for ignored directories", () => {
    const policy = createFileVisibilityPolicy({
      gitignorePatterns: ["cache/"],
      includeIgnoredPaths: ["**/*.snap"],
    });

    expect(policy.shouldTraverseDirectory("cache")).toBe(true);
  });
});

import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { type FileVisibilityPolicy, createFileVisibilityPolicy } from "./file-visibility-policy";
import { resolveRepoAbsolutePath } from "./path-guard";
import { createServiceError, isNotFoundError, isReadablePermissionError } from "./service-context";

type VisibilityCacheEntry = {
  policy: FileVisibilityPolicy;
  expiresAt: number;
};

type VisibleChildrenCacheEntry = {
  hasChildren: boolean;
  expiresAt: number;
};

type CreateServiceVisibilityResolverDeps = {
  now: () => number;
  includeIgnoredPaths: string[];
  visibilityCacheTtlMs: number;
};

export const toDirectoryRelativePath = (basePath: string, name: string) => {
  return basePath === "." ? name : `${basePath}/${name}`;
};

const resolveGitignorePatterns = async (repoRoot: string) => {
  const gitignorePath = path.join(repoRoot, ".gitignore");
  const basePatterns = [".git/"];
  try {
    const raw = await fs.readFile(gitignorePath, "utf8");
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    return [...basePatterns, ...lines];
  } catch (error) {
    if (isNotFoundError(error)) {
      return basePatterns;
    }
    if (isReadablePermissionError(error)) {
      throw createServiceError("PERMISSION_DENIED", 403, "permission denied");
    }
    throw createServiceError("INTERNAL", 500, "failed to read .gitignore");
  }
};

const hasVisibleChildren = async ({
  repoRoot,
  relativePath,
  policy,
}: {
  repoRoot: string;
  relativePath: string;
  policy: FileVisibilityPolicy;
}) => {
  const absolutePath = resolveRepoAbsolutePath(repoRoot, relativePath);
  let entries: Dirent[];
  try {
    entries = await fs.readdir(absolutePath, { withFileTypes: true });
  } catch (error) {
    if (isReadablePermissionError(error)) {
      return false;
    }
    if (isNotFoundError(error)) {
      return false;
    }
    throw error;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }
    const childRelativePath = toDirectoryRelativePath(relativePath, entry.name);
    if (entry.isDirectory()) {
      if (
        policy.shouldIncludePath({ relativePath: childRelativePath, isDirectory: true }) ||
        policy.shouldTraverseDirectory(childRelativePath)
      ) {
        return true;
      }
      continue;
    }
    if (
      entry.isFile() &&
      policy.shouldIncludePath({ relativePath: childRelativePath, isDirectory: false })
    ) {
      return true;
    }
  }
  return false;
};

export const createServiceVisibilityResolver = ({
  now,
  includeIgnoredPaths,
  visibilityCacheTtlMs,
}: CreateServiceVisibilityResolverDeps) => {
  const visibilityCache = new Map<string, VisibilityCacheEntry>();
  const visibleChildrenCache = new Map<string, Map<string, VisibleChildrenCacheEntry>>();

  const resolveVisibilityPolicy = async (repoRoot: string) => {
    const cached = visibilityCache.get(repoRoot);
    if (cached && cached.expiresAt > now()) {
      return cached.policy;
    }
    const gitignorePatterns = await resolveGitignorePatterns(repoRoot);
    const policy = createFileVisibilityPolicy({
      gitignorePatterns,
      includeIgnoredPaths,
    });
    visibilityCache.set(repoRoot, {
      policy,
      expiresAt: now() + visibilityCacheTtlMs,
    });
    // Policy更新時は子要素判定キャッシュを破棄して整合性を保つ。
    visibleChildrenCache.delete(repoRoot);
    return policy;
  };

  const resolveHasVisibleChildren = async ({
    repoRoot,
    relativePath,
    policy,
  }: {
    repoRoot: string;
    relativePath: string;
    policy: FileVisibilityPolicy;
  }) => {
    const nowMs = now();
    const cacheByRepo =
      visibleChildrenCache.get(repoRoot) ?? new Map<string, VisibleChildrenCacheEntry>();
    if (!visibleChildrenCache.has(repoRoot)) {
      visibleChildrenCache.set(repoRoot, cacheByRepo);
    }
    const cached = cacheByRepo.get(relativePath);
    if (cached && cached.expiresAt > nowMs) {
      return cached.hasChildren;
    }

    const hasChildren = await hasVisibleChildren({ repoRoot, relativePath, policy });
    cacheByRepo.set(relativePath, {
      hasChildren,
      expiresAt: nowMs + visibilityCacheTtlMs,
    });
    return hasChildren;
  };

  return {
    resolveVisibilityPolicy,
    resolveHasVisibleChildren,
  };
};

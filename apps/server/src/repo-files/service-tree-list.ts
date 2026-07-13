import fs from "node:fs/promises";
import path from "node:path";

import type { RepoFileTreeNode, RepoFileTreePage } from "@vde-monitor/shared";

import { setMapEntryWithLimit } from "../cache";
import type { GitPathSnapshotResolver } from "./git-path-snapshot";
import { resolveSafeRepoPath } from "./repo-path-resolver";
import {
  createServiceError,
  isNotFoundError,
  isReadablePermissionError,
  isRepoFileServiceError,
} from "./service-context";
import { paginateItems } from "./service-pagination";

const CHILDREN_CACHE_TTL_MS = 5_000;
const CHILDREN_CACHE_MAX_ENTRIES = 1_000;

export type TreeDirectoryEntry = {
  path: string;
  name: string;
  kind: "file" | "directory";
  classificationPath: string;
  realPath: string;
  isSymbolicLink: boolean;
};

type ReadTreeDirectoryEntriesArgs = {
  repoRoot: string;
  basePath: string;
};

type BuildTreeNodesArgs = {
  entries: TreeDirectoryEntry[];
  repoRoot: string;
  inheritedIgnored: boolean;
  gitPaths: GitPathSnapshotResolver;
  resolveHasChildren: (input: { repoRoot: string; entry: TreeDirectoryEntry }) => Promise<boolean>;
};

type BuildListTreePageArgs = {
  basePath: string;
  nodes: RepoFileTreeNode[];
  cursor?: string;
  limit: number;
};

export const toDirectoryRelativePath = (basePath: string, name: string) => {
  return basePath === "." ? name : `${basePath}/${name}`;
};

const isPathAncestorOf = (ancestorPath: string, targetPath: string) => {
  const relativePath = path.relative(ancestorPath, targetPath);
  return (
    relativePath.length === 0 ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  );
};

export const readTreeDirectoryEntries = async ({
  repoRoot,
  basePath,
}: ReadTreeDirectoryEntriesArgs): Promise<TreeDirectoryEntry[]> => {
  try {
    const resolvedBase = await resolveSafeRepoPath({ repoRoot, relativePath: basePath });
    const baseStats = await fs.stat(resolvedBase.realPath);
    if (!baseStats.isDirectory()) {
      throw createServiceError("INVALID_PAYLOAD", 400, "path must point to a directory");
    }

    const entries = await fs.readdir(resolvedBase.realPath, { withFileTypes: true });
    const output: TreeDirectoryEntry[] = [];
    for (const entry of entries) {
      if (basePath === "." && entry.name.toLowerCase() === ".git") {
        continue;
      }
      const relativePath = toDirectoryRelativePath(basePath, entry.name);
      let resolvedEntry: Awaited<ReturnType<typeof resolveSafeRepoPath>>;
      try {
        resolvedEntry = await resolveSafeRepoPath({ repoRoot, relativePath });
      } catch (error) {
        if (isRepoFileServiceError(error) && error.code === "FORBIDDEN_PATH") {
          continue;
        }
        if (isRepoFileServiceError(error) && error.code === "NOT_FOUND") {
          continue;
        }
        throw error;
      }

      const stats = await fs.stat(resolvedEntry.realPath);
      const kind = stats.isDirectory() ? "directory" : stats.isFile() ? "file" : null;
      if (kind == null) {
        continue;
      }
      if (kind === "directory" && isPathAncestorOf(resolvedEntry.realPath, resolvedBase.realPath)) {
        continue;
      }
      output.push({
        path: relativePath,
        name: entry.name,
        kind,
        classificationPath: entry.isSymbolicLink() ? relativePath : resolvedEntry.realRelativePath,
        realPath: resolvedEntry.realPath,
        isSymbolicLink: entry.isSymbolicLink(),
      });
    }
    return output;
  } catch (error) {
    if (isRepoFileServiceError(error)) {
      throw error;
    }
    if (isReadablePermissionError(error)) {
      throw createServiceError("PERMISSION_DENIED", 403, "permission denied");
    }
    if (isNotFoundError(error)) {
      throw createServiceError("NOT_FOUND", 404, "path not found");
    }
    throw error;
  }
};

export const createTreeChildrenResolver = ({
  now,
  maxCacheEntries = CHILDREN_CACHE_MAX_ENTRIES,
}: {
  now: () => number;
  maxCacheEntries?: number;
}) => {
  const cache = new Map<string, { hasChildren: boolean; expiresAt: number }>();

  const resolveHasChildren = async ({
    repoRoot,
    entry,
  }: {
    repoRoot: string;
    entry: TreeDirectoryEntry;
  }) => {
    const cacheKey = `${repoRoot}\0${entry.realPath}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now()) {
      setMapEntryWithLimit(cache, cacheKey, cached, maxCacheEntries);
      return cached.hasChildren;
    }
    const hasChildren =
      (
        await readTreeDirectoryEntries({
          repoRoot,
          basePath: entry.path,
        })
      ).length > 0;
    setMapEntryWithLimit(
      cache,
      cacheKey,
      {
        hasChildren,
        expiresAt: now() + CHILDREN_CACHE_TTL_MS,
      },
      maxCacheEntries,
    );
    return hasChildren;
  };

  return { resolveHasChildren };
};

export const buildTreeNodes = async ({
  entries,
  repoRoot,
  inheritedIgnored,
  gitPaths,
  resolveHasChildren,
}: BuildTreeNodesArgs): Promise<RepoFileTreeNode[]> => {
  const classifiedEntries = await gitPaths.classifyPaths(
    repoRoot,
    entries.map((entry) => ({
      ...entry,
      inheritedIgnored,
    })),
  );

  return Promise.all(
    classifiedEntries.map(async (entry) => {
      if (entry.kind === "file") {
        return {
          path: entry.path,
          name: entry.name,
          kind: "file",
          isIgnored: entry.isIgnored,
        } satisfies RepoFileTreeNode;
      }
      return {
        path: entry.path,
        name: entry.name,
        kind: "directory",
        hasChildren: entry.isIgnored ? true : await resolveHasChildren({ repoRoot, entry }),
        isIgnored: entry.isIgnored,
      } satisfies RepoFileTreeNode;
    }),
  );
};

export const buildListTreePage = ({ basePath, nodes, cursor, limit }: BuildListTreePageArgs) => {
  const sortedNodes = [...nodes].sort((left, right) => left.name.localeCompare(right.name));
  const paged = paginateItems({
    allItems: sortedNodes,
    cursor,
    limit,
  });
  return {
    basePath,
    entries: paged.items,
    nextCursor: paged.nextCursor,
  } satisfies RepoFileTreePage;
};

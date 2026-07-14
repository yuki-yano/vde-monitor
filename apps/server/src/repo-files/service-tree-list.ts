import fs from "node:fs/promises";
import path from "node:path";

import type { RepoFileTreeNode, RepoFileTreePage } from "@vde-monitor/shared";

import type { GitPathSnapshotResolver } from "./git-path-snapshot";
import {
  type NestedWorktreeRoot,
  findContainingNestedWorktreeRoot,
  isNestedWorktreeAncestorPath,
} from "./nested-worktree-roots";
import { resolveSafeRepoPath } from "./repo-path-resolver";
import {
  createServiceError,
  isNotFoundError,
  isReadablePermissionError,
  isRepoFileServiceError,
} from "./service-context";
import { paginateItems } from "./service-pagination";

const CHILDREN_CACHE_TTL_MS = 5_000;

export type TreeDirectoryEntry = {
  path: string;
  name: string;
  kind: "file" | "directory";
  classificationRoot: string;
  classificationPath: string;
  realPath: string;
  isSymbolicLink: boolean;
  forceVisible?: boolean;
};

type ReadTreeDirectoryEntriesArgs = {
  repoRoot: string;
  basePath: string;
  nestedWorktreeRoots?: readonly NestedWorktreeRoot[];
};

type BuildTreeNodesArgs = {
  entries: TreeDirectoryEntry[];
  repoRoot: string;
  inheritedIgnored: boolean;
  gitPaths: GitPathSnapshotResolver;
  nestedWorktreeRoots: readonly NestedWorktreeRoot[];
  resolveHasChildren: (input: {
    repoRoot: string;
    entry: TreeDirectoryEntry;
    nestedWorktreeRoots: readonly NestedWorktreeRoot[];
  }) => Promise<boolean>;
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

const toInnerWorktreePath = (worktreeRoot: NestedWorktreeRoot, relativePath: string) => {
  if (relativePath === worktreeRoot.relativePath) {
    return ".";
  }
  return relativePath.slice(worktreeRoot.relativePath.length + 1);
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

const readRegularTreeDirectoryEntries = async ({
  repoRoot,
  basePath,
}: Omit<ReadTreeDirectoryEntriesArgs, "nestedWorktreeRoots">): Promise<TreeDirectoryEntry[]> => {
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
        classificationRoot: repoRoot,
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

const buildNestedWorktreeAncestorEntries = async ({
  repoRoot,
  basePath,
  nestedWorktreeRoots,
}: Required<ReadTreeDirectoryEntriesArgs>): Promise<TreeDirectoryEntry[]> => {
  const baseSegments = basePath === "." ? [] : basePath.split("/");
  const childPaths = new Set<string>();
  for (const worktreeRoot of nestedWorktreeRoots) {
    if (basePath !== "." && !worktreeRoot.relativePath.startsWith(`${basePath}/`)) {
      continue;
    }
    const rootSegments = worktreeRoot.relativePath.split("/");
    const childName = rootSegments[baseSegments.length];
    if (childName) {
      childPaths.add(toDirectoryRelativePath(basePath, childName));
    }
  }

  const entries = await Promise.all(
    [...childPaths].map(async (childPath) => {
      try {
        return {
          path: childPath,
          name: childPath.split("/").at(-1) ?? childPath,
          kind: "directory" as const,
          classificationRoot: repoRoot,
          classificationPath: childPath,
          realPath: await fs.realpath(path.join(repoRoot, ...childPath.split("/"))),
          isSymbolicLink: false,
          forceVisible: true,
        };
      } catch (error) {
        if (isNotFoundError(error)) {
          return null;
        }
        throw error;
      }
    }),
  );
  return entries.filter((entry) => entry != null);
};

export const readTreeDirectoryEntries = async ({
  repoRoot,
  basePath,
  nestedWorktreeRoots = [],
}: ReadTreeDirectoryEntriesArgs): Promise<TreeDirectoryEntry[]> => {
  const containingWorktree = findContainingNestedWorktreeRoot(nestedWorktreeRoots, basePath);
  if (containingWorktree) {
    const innerBasePath = toInnerWorktreePath(containingWorktree, basePath);
    const entries = await readRegularTreeDirectoryEntries({
      repoRoot: containingWorktree.canonicalPath,
      basePath: innerBasePath,
    });
    return entries.map((entry) => ({
      ...entry,
      path: `${containingWorktree.relativePath}/${entry.path}`,
      classificationRoot: containingWorktree.canonicalPath,
    }));
  }

  if (isNestedWorktreeAncestorPath(nestedWorktreeRoots, basePath)) {
    return buildNestedWorktreeAncestorEntries({ repoRoot, basePath, nestedWorktreeRoots });
  }

  const entries = await readRegularTreeDirectoryEntries({ repoRoot, basePath });
  if (basePath !== "." || nestedWorktreeRoots.length === 0) {
    return entries;
  }
  return [
    ...entries,
    ...(await buildNestedWorktreeAncestorEntries({ repoRoot, basePath, nestedWorktreeRoots })),
  ];
};

export const classifyTreeEntries = async ({
  repoRoot,
  entries,
  inheritedIgnored,
  gitPaths,
}: {
  repoRoot: string;
  entries: TreeDirectoryEntry[];
  inheritedIgnored: boolean;
  gitPaths: GitPathSnapshotResolver;
}) => {
  const classified = Array.from<(TreeDirectoryEntry & { isIgnored: boolean }) | undefined>({
    length: entries.length,
  });
  const entriesByRoot = new Map<string, Array<{ entry: TreeDirectoryEntry; index: number }>>();
  entries.forEach((entry, index) => {
    if (entry.forceVisible) {
      classified[index] = { ...entry, isIgnored: false };
      return;
    }
    const classificationRoot = entry.classificationRoot || repoRoot;
    const group = entriesByRoot.get(classificationRoot) ?? [];
    group.push({ entry, index });
    entriesByRoot.set(classificationRoot, group);
  });

  await Promise.all(
    [...entriesByRoot].map(async ([classificationRoot, group]) => {
      const nextEntries = await gitPaths.classifyPaths(
        classificationRoot,
        group.map(({ entry }) => ({ ...entry, inheritedIgnored })),
      );
      nextEntries.forEach((entry, groupIndex) => {
        const targetIndex = group[groupIndex]?.index;
        if (targetIndex != null) {
          classified[targetIndex] = entry;
        }
      });
    }),
  );
  return classified.filter(
    (entry): entry is TreeDirectoryEntry & { isIgnored: boolean } => entry != null,
  );
};

export const createTreeChildrenResolver = ({ now }: { now: () => number }) => {
  const cache = new Map<string, { hasChildren: boolean; expiresAt: number }>();

  const resolveHasChildren = async ({
    repoRoot,
    entry,
    nestedWorktreeRoots,
  }: {
    repoRoot: string;
    entry: TreeDirectoryEntry;
    nestedWorktreeRoots: readonly NestedWorktreeRoot[];
  }) => {
    const cacheKey = `${repoRoot}\0${entry.realPath}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > now()) {
      return cached.hasChildren;
    }
    const hasChildren =
      (
        await readTreeDirectoryEntries({
          repoRoot,
          basePath: entry.path,
          nestedWorktreeRoots,
        })
      ).length > 0;
    cache.set(cacheKey, {
      hasChildren,
      expiresAt: now() + CHILDREN_CACHE_TTL_MS,
    });
    return hasChildren;
  };

  return { resolveHasChildren };
};

export const buildTreeNodes = async ({
  entries,
  repoRoot,
  inheritedIgnored,
  gitPaths,
  nestedWorktreeRoots,
  resolveHasChildren,
}: BuildTreeNodesArgs): Promise<RepoFileTreeNode[]> => {
  const classifiedEntries = await classifyTreeEntries({
    repoRoot,
    entries,
    inheritedIgnored,
    gitPaths,
  });

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
        hasChildren: entry.isIgnored
          ? true
          : await resolveHasChildren({ repoRoot, entry, nestedWorktreeRoots }),
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

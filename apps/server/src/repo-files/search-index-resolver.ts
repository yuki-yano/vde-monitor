import { setMapEntryWithLimit } from "../cache";
import type { GitPathSnapshotResolver } from "./git-path-snapshot";
import type { NestedWorktreeRoot } from "./nested-worktree-roots";
import { resolveNestedWorktreeRoots } from "./nested-worktree-roots";
import { resolveRepoClassificationPath, resolveSafeRepoPath } from "./repo-path-resolver";
import { classifyTreeEntries, readTreeDirectoryEntries } from "./service-tree-list";

const INDEX_CACHE_TTL_MS = 5_000;
const INDEX_CACHE_MAX_ENTRIES = 100;

export type SearchIndexItem = {
  path: string;
  name: string;
  kind: "file" | "directory";
  isIgnored: boolean;
};

type SearchIndexCacheEntry = {
  items: SearchIndexItem[];
  expiresAt: number;
};

type CreateSearchIndexResolverDeps = {
  now: () => number;
  gitPaths: GitPathSnapshotResolver;
  maxCacheEntries?: number;
};

export const createSearchIndexResolver = ({
  now,
  gitPaths,
  maxCacheEntries = INDEX_CACHE_MAX_ENTRIES,
}: CreateSearchIndexResolverDeps) => {
  const searchIndexCache = new Map<string, SearchIndexCacheEntry>();

  const withIgnoredFlags = async <T extends { path: string; kind: "file" | "directory" }>(
    repoRoot: string,
    items: T[],
  ): Promise<Array<T & { isIgnored: boolean }>> => {
    const itemsWithClassificationPath = await Promise.all(
      items.map(async (item) => {
        return {
          ...item,
          classificationPath: await resolveRepoClassificationPath({
            repoRoot,
            relativePath: item.path,
          }),
        };
      }),
    );
    return gitPaths.classifyPaths(repoRoot, itemsWithClassificationPath);
  };

  const buildSearchIndex = async (
    repoRoot: string,
    currentRelativePath: string,
    visitedDirectories: Set<string>,
    output: SearchIndexItem[],
    nestedWorktreeRoots: readonly NestedWorktreeRoot[],
  ) => {
    const entries = await readTreeDirectoryEntries({
      repoRoot,
      basePath: currentRelativePath,
      nestedWorktreeRoots,
    });
    const classifiedEntries = await classifyTreeEntries({
      repoRoot,
      entries,
      inheritedIgnored: false,
      gitPaths,
    });

    for (const entry of classifiedEntries) {
      output.push({
        path: entry.path,
        name: entry.name,
        kind: entry.kind,
        isIgnored: entry.isIgnored,
      });
      if (entry.kind !== "directory" || entry.isIgnored) {
        continue;
      }
      if (visitedDirectories.has(entry.realPath)) {
        continue;
      }
      visitedDirectories.add(entry.realPath);
      await buildSearchIndex(repoRoot, entry.path, visitedDirectories, output, nestedWorktreeRoots);
    }
  };

  const resolveSearchIndex = async (repoRoot: string) => {
    const nowMs = now();
    const cached = searchIndexCache.get(repoRoot);
    if (cached && cached.expiresAt > nowMs) {
      setMapEntryWithLimit(searchIndexCache, repoRoot, cached, maxCacheEntries);
      return cached.items;
    }

    const rootPath = await resolveSafeRepoPath({ repoRoot, relativePath: "." });
    const nestedWorktreeRoots = await resolveNestedWorktreeRoots(repoRoot);
    const items: SearchIndexItem[] = [];
    await buildSearchIndex(repoRoot, ".", new Set([rootPath.realPath]), items, nestedWorktreeRoots);
    setMapEntryWithLimit(
      searchIndexCache,
      repoRoot,
      {
        items,
        expiresAt: nowMs + INDEX_CACHE_TTL_MS,
      },
      maxCacheEntries,
    );
    return items;
  };

  return {
    resolveSearchIndex,
    withIgnoredFlags,
  };
};

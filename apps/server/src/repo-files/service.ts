import type {
  FileNavigatorConfig,
  RepoFileContent,
  RepoFileSearchPage,
  RepoFileTreePage,
} from "@vde-monitor/shared";

import { resolveFileContent, resolveFileMetadata } from "./file-content-resolver";
import { normalizeRepoRelativePath } from "./path-guard";
import { createSearchIndexResolver } from "./search-index-resolver";
import {
  type RepoFileServiceError,
  createServiceError,
  ensureRepoRootAvailable,
  isRepoFileServiceError,
  normalizeFileContentPath,
  normalizeSearchQuery,
  toServiceError,
  validateMaxBytes,
} from "./service-context";
import { createRunLsFiles } from "./service-git-ls-files";
import { executeSearchFiles } from "./service-search";
import { withServiceTimeout } from "./service-timeout";
import {
  buildListTreePage,
  buildVisibleTreeNodes,
  readTreeDirectoryEntries,
} from "./service-tree-list";
import { createServiceVisibilityResolver } from "./service-visibility";

const VISIBILITY_CACHE_TTL_MS = 5_000;
const GIT_LS_FILES_TIMEOUT_MS = 1_500;
const DEFAULT_SEARCH_TIMEOUT_MS = 2_000;
const DEFAULT_CONTENT_TIMEOUT_MS = 2_000;
const GIT_LS_FILES_MAX_BUFFER = 10_000_000;
const previewablePathPattern = /\.(html?|md|markdown)$/i;

const isPreviewablePath = (targetPath: string) => previewablePathPattern.test(targetPath);
const isHardHiddenPath = (targetPath: string) =>
  targetPath === ".git" || targetPath.startsWith(".git/");

type ListTreeInput = {
  repoRoot: string;
  path?: string;
  cursor?: string;
  limit: number;
};

type SearchFilesInput = {
  repoRoot: string;
  query: string;
  cursor?: string;
  limit: number;
  timeoutMs?: number;
  includeIgnoredPreviewExact?: boolean;
};

type GetFileContentInput = {
  repoRoot: string;
  path: string;
  maxBytes: number;
  timeoutMs?: number;
  includeIgnoredPreviewExact?: boolean;
};

type RepoFileService = {
  listTree: (input: ListTreeInput) => Promise<RepoFileTreePage>;
  searchFiles: (input: SearchFilesInput) => Promise<RepoFileSearchPage>;
  getFileContent: (input: GetFileContentInput) => Promise<RepoFileContent>;
};

type RepoFileServiceDeps = {
  fileNavigatorConfig: FileNavigatorConfig;
  now?: () => number;
};

export const createRepoFileService = ({
  fileNavigatorConfig,
  now = () => Date.now(),
}: RepoFileServiceDeps): RepoFileService => {
  const { resolveVisibilityPolicy, resolveHasVisibleChildren } = createServiceVisibilityResolver({
    now,
    includeIgnoredPaths: fileNavigatorConfig.includeIgnoredPaths,
    visibilityCacheTtlMs: VISIBILITY_CACHE_TTL_MS,
  });

  const runLsFiles = createRunLsFiles({
    timeoutMs: GIT_LS_FILES_TIMEOUT_MS,
    maxBuffer: GIT_LS_FILES_MAX_BUFFER,
  });
  const { resolveSearchIndex, withIgnoredFlags } = createSearchIndexResolver({
    now,
    runLsFiles,
  });

  const resolveExactPreviewSearchPage = async ({
    repoRoot,
    query,
    cursor,
    includeIgnoredPreviewExact,
  }: {
    repoRoot: string;
    query: string;
    cursor?: string;
    includeIgnoredPreviewExact: boolean;
  }): Promise<RepoFileSearchPage | null> => {
    if (!includeIgnoredPreviewExact || cursor != null) {
      return null;
    }
    const normalizedSearchQuery = normalizeSearchQuery(query);
    const buildEmptyPage = () => ({
      query: normalizedSearchQuery,
      items: [],
      truncated: false,
      totalMatchedCount: 0,
    });
    try {
      const normalizedQuery = normalizeFileContentPath(normalizedSearchQuery);
      if (!isPreviewablePath(normalizedQuery)) {
        return null;
      }
      if (isHardHiddenPath(normalizedQuery)) {
        throw createServiceError("FORBIDDEN_PATH", 403, "path is not visible by policy");
      }
      const exactPreviewMatch = await resolveFileMetadata({
        repoRoot,
        normalizedPath: normalizedQuery,
      });
      const [item] = (await withIgnoredFlags(repoRoot, [exactPreviewMatch])).map((searchItem) => ({
        ...searchItem,
        score: Number.MAX_SAFE_INTEGER,
        highlights: [] as number[],
      }));
      return {
        query: normalizedSearchQuery,
        items: item ? [item] : [],
        truncated: false,
        totalMatchedCount: item ? 1 : 0,
      };
    } catch (error) {
      if (isRepoFileServiceError(error) && error.code === "NOT_FOUND") {
        return buildEmptyPage();
      }
      throw error;
    }
  };

  const listTree = async ({ repoRoot, path: rawPath, cursor, limit }: ListTreeInput) => {
    await ensureRepoRootAvailable(repoRoot);
    try {
      const basePath = normalizeRepoRelativePath(rawPath);
      const policy = await resolveVisibilityPolicy(repoRoot);
      const entries = await readTreeDirectoryEntries({ repoRoot, basePath });
      const visibleNodes = await buildVisibleTreeNodes({
        entries,
        basePath,
        repoRoot,
        policy,
        resolveHasVisibleChildren,
      });

      const nodesWithIgnored = await withIgnoredFlags(repoRoot, visibleNodes);
      return buildListTreePage({
        basePath,
        nodes: nodesWithIgnored,
        cursor,
        limit,
      });
    } catch (error) {
      throw toServiceError(error);
    }
  };

  const searchFiles = async ({
    repoRoot,
    query,
    cursor,
    limit,
    timeoutMs = DEFAULT_SEARCH_TIMEOUT_MS,
    includeIgnoredPreviewExact = false,
  }: SearchFilesInput) => {
    await ensureRepoRootAvailable(repoRoot);
    try {
      const exactPreviewPage = await resolveExactPreviewSearchPage({
        repoRoot,
        query,
        cursor,
        includeIgnoredPreviewExact,
      });
      if (exactPreviewPage) {
        return exactPreviewPage;
      }
      return executeSearchFiles({
        repoRoot,
        query,
        cursor,
        limit,
        timeoutMs,
        resolveVisibilityPolicy,
        resolveSearchIndex,
      });
    } catch (error) {
      throw toServiceError(error);
    }
  };

  const getFileContent = async ({
    repoRoot,
    path: rawPath,
    maxBytes,
    timeoutMs = DEFAULT_CONTENT_TIMEOUT_MS,
    includeIgnoredPreviewExact = false,
  }: GetFileContentInput) => {
    await ensureRepoRootAvailable(repoRoot);
    try {
      validateMaxBytes(maxBytes);
      const normalizedPath = normalizeFileContentPath(rawPath);
      const policy = await resolveVisibilityPolicy(repoRoot);
      if (isHardHiddenPath(normalizedPath)) {
        throw createServiceError("FORBIDDEN_PATH", 403, "path is not visible by policy");
      }
      const canReadIgnoredPreviewExact =
        includeIgnoredPreviewExact && isPreviewablePath(normalizedPath);
      if (
        !canReadIgnoredPreviewExact &&
        !policy.shouldIncludePath({ relativePath: normalizedPath, isDirectory: false })
      ) {
        throw createServiceError("FORBIDDEN_PATH", 403, "path is not visible by policy");
      }

      return withServiceTimeout(
        resolveFileContent({
          repoRoot,
          normalizedPath,
          maxBytes,
        }),
        timeoutMs,
        "file content read timed out",
      );
    } catch (error) {
      throw toServiceError(error);
    }
  };

  return {
    listTree,
    searchFiles,
    getFileContent,
  };
};

export type { RepoFileServiceError };

import type {
  FileNavigatorConfig,
  RepoFileContent,
  RepoFileSearchPage,
  RepoFileTreePage,
} from "@vde-monitor/shared";

import { resolveFileContent } from "./file-content-resolver";
import { normalizeRepoRelativePath } from "./path-guard";
import { createSearchIndexResolver } from "./search-index-resolver";
import {
  type RepoFileServiceError,
  createServiceError,
  ensureRepoRootAvailable,
  normalizeFileContentPath,
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
};

type GetFileContentInput = {
  repoRoot: string;
  path: string;
  maxBytes: number;
  timeoutMs?: number;
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
  }: SearchFilesInput) => {
    await ensureRepoRootAvailable(repoRoot);
    try {
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
  }: GetFileContentInput) => {
    await ensureRepoRootAvailable(repoRoot);
    try {
      validateMaxBytes(maxBytes);
      const normalizedPath = normalizeFileContentPath(rawPath);
      const policy = await resolveVisibilityPolicy(repoRoot);
      if (!policy.shouldIncludePath({ relativePath: normalizedPath, isDirectory: false })) {
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

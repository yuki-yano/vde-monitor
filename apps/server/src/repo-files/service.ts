import { execFile } from "node:child_process";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import { promisify } from "node:util";

import type {
  FileNavigatorConfig,
  RepoFileContent,
  RepoFileSearchPage,
  RepoFileTreeNode,
  RepoFileTreePage,
} from "@vde-monitor/shared";

import { resolveFileContent } from "./file-content-resolver";
import { normalizeRepoRelativePath, resolveRepoAbsolutePath } from "./path-guard";
import { createSearchIndexResolver } from "./search-index-resolver";
import {
  createServiceError,
  ensureRepoRootAvailable,
  isNotFoundError,
  isReadablePermissionError,
  isRepoFileServiceError,
  normalizeFileContentPath,
  normalizeSearchQuery,
  type RepoFileServiceError,
  toServiceError,
  validateMaxBytes,
} from "./service-context";
import { paginateItems } from "./service-pagination";
import { buildWordSearchMatch, tokenizeQuery } from "./service-search-matcher";
import { withServiceTimeout } from "./service-timeout";
import { createServiceVisibilityResolver, toDirectoryRelativePath } from "./service-visibility";

const VISIBILITY_CACHE_TTL_MS = 5_000;
const GIT_LS_FILES_TIMEOUT_MS = 1_500;
const DEFAULT_SEARCH_TIMEOUT_MS = 2_000;
const DEFAULT_CONTENT_TIMEOUT_MS = 2_000;
const GIT_LS_FILES_MAX_BUFFER = 10_000_000;

const execFileAsync = promisify(execFile);

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

const splitNullSeparated = (value: string) => value.split("\0").filter((token) => token.length > 0);

const extractStdoutFromExecError = (error: unknown) => {
  if (typeof error !== "object" || error == null) {
    return "";
  }
  const stdout = (error as { stdout?: unknown }).stdout;
  return typeof stdout === "string" ? stdout : "";
};

const normalizeAndSortNodes = (nodes: RepoFileTreeNode[]) => {
  return nodes.sort((left, right) => left.name.localeCompare(right.name));
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

  const runLsFiles = async (repoRoot: string, args: string[]) => {
    const output = await execFileAsync("git", ["-C", repoRoot, ...args], {
      timeout: GIT_LS_FILES_TIMEOUT_MS,
      maxBuffer: GIT_LS_FILES_MAX_BUFFER,
      encoding: "utf8",
    })
      .then((result) => result.stdout)
      .catch((error: unknown) => {
        const stdout = extractStdoutFromExecError(error);
        if (stdout.length > 0) {
          return stdout;
        }
        throw error;
      });
    return splitNullSeparated(output);
  };
  const { resolveSearchIndex, withIgnoredFlags } = createSearchIndexResolver({
    now,
    runLsFiles,
  });

  const listTree = async ({ repoRoot, path: rawPath, cursor, limit }: ListTreeInput) => {
    await ensureRepoRootAvailable(repoRoot);
    try {
      const basePath = normalizeRepoRelativePath(rawPath);
      const absoluteBasePath = resolveRepoAbsolutePath(repoRoot, basePath);
      const policy = await resolveVisibilityPolicy(repoRoot);
      let entries: Dirent[];
      try {
        const stats = await fs.stat(absoluteBasePath);
        if (!stats.isDirectory()) {
          throw createServiceError("INVALID_PAYLOAD", 400, "path must point to a directory");
        }
        entries = await fs.readdir(absoluteBasePath, { withFileTypes: true });
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

      const visibleNodes: RepoFileTreeNode[] = [];
      const sortedEntries = [...entries].sort((left, right) => left.name.localeCompare(right.name));

      for (const entry of sortedEntries) {
        if (entry.isSymbolicLink()) {
          continue;
        }
        const relativePath = toDirectoryRelativePath(basePath, entry.name);
        if (entry.isDirectory()) {
          const include = policy.shouldIncludePath({ relativePath, isDirectory: true });
          if (!include) {
            continue;
          }
          const hasChildren = await resolveHasVisibleChildren({ repoRoot, relativePath, policy });
          visibleNodes.push({
            path: relativePath,
            name: entry.name,
            kind: "directory",
            hasChildren,
          });
          continue;
        }
        if (!entry.isFile()) {
          continue;
        }
        if (!policy.shouldIncludePath({ relativePath, isDirectory: false })) {
          continue;
        }
        visibleNodes.push({
          path: relativePath,
          name: entry.name,
          kind: "file",
        });
      }

      const nodesWithIgnored = await withIgnoredFlags(repoRoot, visibleNodes);

      const normalizedNodes = normalizeAndSortNodes(nodesWithIgnored);
      const paged = paginateItems({
        allItems: normalizedNodes,
        cursor,
        limit,
      });
      return {
        basePath,
        entries: paged.items,
        nextCursor: paged.nextCursor,
      } satisfies RepoFileTreePage;
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
      const normalizedQuery = normalizeSearchQuery(query);
      const policy = await resolveVisibilityPolicy(repoRoot);
      const index = await withServiceTimeout(
        resolveSearchIndex(repoRoot, policy),
        timeoutMs,
        "search timed out",
      );
      const queryTokens = tokenizeQuery(normalizedQuery);
      const normalizedMatches = index
        .map((item) => buildWordSearchMatch(item, queryTokens))
        .filter((item): item is NonNullable<typeof item> => item != null)
        .sort((left, right) => {
          const scoreDiff = right.score - left.score;
          if (scoreDiff !== 0) {
            return scoreDiff;
          }
          return left.path.localeCompare(right.path);
        });

      const paged = paginateItems({
        allItems: normalizedMatches,
        cursor,
        limit,
      });

      return {
        query: normalizedQuery,
        items: paged.items,
        nextCursor: paged.nextCursor,
        truncated: paged.nextCursor != null,
        totalMatchedCount: paged.totalCount,
      } satisfies RepoFileSearchPage;
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

export type { RepoFileService, RepoFileServiceError };

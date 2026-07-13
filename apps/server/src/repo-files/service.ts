import path from "node:path";

import type {
  FileNavigatorConfig,
  RepoFileContent,
  RepoFileSearchPage,
  RepoFileTreePage,
} from "@vde-monitor/shared";

import { resolveAllowedFile } from "../file-access/allowed-file-resolver";
import { resolveFileContentFromAbsolutePath } from "./file-content-resolver";
import { createGitPathSnapshotResolver } from "./git-path-snapshot";
import { normalizeRepoRelativePath } from "./path-guard";
import { resolveRepoClassificationPath } from "./repo-path-resolver";
import { createSearchIndexResolver } from "./search-index-resolver";
import {
  type RepoFileServiceError,
  ensureRepoRootAvailable,
  isRepoFileServiceError,
  normalizeSearchQuery,
  toServiceError,
  validateMaxBytes,
} from "./service-context";
import { createRunLsFiles } from "./service-git-ls-files";
import { executeSearchFiles } from "./service-search";
import { withServiceTimeout } from "./service-timeout";
import {
  buildListTreePage,
  buildTreeNodes,
  createTreeChildrenResolver,
  readTreeDirectoryEntries,
} from "./service-tree-list";

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
  exactReference?: boolean;
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
  const runLsFiles = createRunLsFiles({
    timeoutMs: GIT_LS_FILES_TIMEOUT_MS,
    maxBuffer: GIT_LS_FILES_MAX_BUFFER,
  });
  const gitPaths = createGitPathSnapshotResolver({
    now,
    runGitPaths: runLsFiles,
  });
  const { resolveSearchIndex } = createSearchIndexResolver({
    now,
    gitPaths,
  });
  const { resolveHasChildren } = createTreeChildrenResolver({ now });

  const resolveExactSearchPage = async ({
    repoRoot,
    query,
    cursor,
    exactReference,
  }: {
    repoRoot: string;
    query: string;
    cursor?: string;
    exactReference: boolean;
  }): Promise<RepoFileSearchPage | null> => {
    if (!exactReference || cursor != null) {
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
      const resolvedFile = await resolveAllowedFile({
        repoRoot,
        externalRoots: fileNavigatorConfig.externalRoots,
        requestedPath: normalizedSearchQuery,
      });
      const exactMatch = {
        path: resolvedFile.requestedPath,
        name: path.basename(resolvedFile.requestedPath),
        kind: "file" as const,
      };
      const classificationPath = path.isAbsolute(resolvedFile.requestedPath)
        ? resolvedFile.repoRelativePath
        : resolvedFile.requestedPath;
      const [classifiedMatch] =
        classificationPath == null
          ? [{ ...exactMatch, isIgnored: false }]
          : await gitPaths.classifyPaths(repoRoot, [{ ...exactMatch, classificationPath }]);
      const item = classifiedMatch
        ? {
            ...classifiedMatch,
            score: Number.MAX_SAFE_INTEGER,
            highlights: [] as number[],
          }
        : undefined;
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
      const [baseClassification] =
        basePath === "."
          ? [{ isIgnored: false }]
          : await gitPaths.classifyPaths(repoRoot, [
              {
                path: basePath,
                classificationPath: await resolveRepoClassificationPath({
                  repoRoot,
                  relativePath: basePath,
                }),
                kind: "directory" as const,
              },
            ]);
      const entries = await readTreeDirectoryEntries({ repoRoot, basePath });
      const nodes = await buildTreeNodes({
        entries,
        repoRoot,
        inheritedIgnored: baseClassification?.isIgnored === true,
        gitPaths,
        resolveHasChildren,
      });

      return buildListTreePage({
        basePath,
        nodes,
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
    exactReference = false,
  }: SearchFilesInput) => {
    await ensureRepoRootAvailable(repoRoot);
    try {
      const exactPage = await resolveExactSearchPage({
        repoRoot,
        query,
        cursor,
        exactReference,
      });
      if (exactPage) {
        return exactPage;
      }
      return executeSearchFiles({
        repoRoot,
        query,
        cursor,
        limit,
        timeoutMs,
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
      const resolvedFile = await resolveAllowedFile({
        repoRoot,
        externalRoots: fileNavigatorConfig.externalRoots,
        requestedPath: rawPath,
      });

      return withServiceTimeout(
        resolveFileContentFromAbsolutePath({
          absolutePath: resolvedFile.absolutePath,
          allowedRootPath: resolvedFile.root.canonicalPath,
          displayPath: resolvedFile.requestedPath,
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

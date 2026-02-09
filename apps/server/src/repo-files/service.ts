import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  FileNavigatorConfig,
  RepoFileContent,
  RepoFileLanguageHint,
  RepoFileSearchPage,
  RepoFileTreeNode,
  RepoFileTreePage,
} from "@vde-monitor/shared";

import { createFileVisibilityPolicy, type FileVisibilityPolicy } from "./file-visibility-policy";
import { isPathGuardError, normalizeRepoRelativePath, resolveRepoAbsolutePath } from "./path-guard";

const DEFAULT_CURSOR_OFFSET = 0;
const INDEX_CACHE_TTL_MS = 5_000;
const VISIBILITY_CACHE_TTL_MS = 5_000;
const DEFAULT_SEARCH_TIMEOUT_MS = 2_000;
const DEFAULT_CONTENT_TIMEOUT_MS = 2_000;
const BINARY_SAMPLE_BYTES = 8_192;

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

type SearchIndexItem = {
  path: string;
  name: string;
};

type RepoFileServiceError = {
  code:
    | "INVALID_PAYLOAD"
    | "NOT_FOUND"
    | "REPO_UNAVAILABLE"
    | "FORBIDDEN_PATH"
    | "PERMISSION_DENIED"
    | "INTERNAL";
  status: 400 | 403 | 404 | 500;
  message: string;
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

type VisibilityCacheEntry = {
  policy: FileVisibilityPolicy;
  expiresAt: number;
};

type SearchIndexCacheEntry = {
  items: SearchIndexItem[];
  expiresAt: number;
};

const createServiceError = (
  code: RepoFileServiceError["code"],
  status: RepoFileServiceError["status"],
  message: string,
): RepoFileServiceError => ({ code, status, message });

const isRepoFileServiceError = (error: unknown): error is RepoFileServiceError => {
  if (typeof error !== "object" || error == null) {
    return false;
  }
  const candidate = error as { code?: unknown; status?: unknown; message?: unknown };
  return (
    typeof candidate.code === "string" &&
    typeof candidate.status === "number" &&
    typeof candidate.message === "string"
  );
};

const toNodeErrorCode = (error: unknown) => {
  if (typeof error !== "object" || error == null) {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
};

const encodeCursor = (offset: number) => {
  return Buffer.from(String(offset), "utf8").toString("base64url");
};

const decodeCursor = (cursor: string | undefined) => {
  if (!cursor) {
    return DEFAULT_CURSOR_OFFSET;
  }
  let decoded = "";
  try {
    decoded = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    throw createServiceError("INVALID_PAYLOAD", 400, "invalid cursor");
  }
  const parsed = Number.parseInt(decoded, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw createServiceError("INVALID_PAYLOAD", 400, "invalid cursor");
  }
  return parsed;
};

const normalizeAndSortNodes = (nodes: RepoFileTreeNode[]) => {
  return nodes.sort((left, right) => left.name.localeCompare(right.name));
};

const isReadablePermissionError = (error: unknown) => {
  const code = toNodeErrorCode(error);
  return code === "EACCES" || code === "EPERM";
};

const isNotFoundError = (error: unknown) => toNodeErrorCode(error) === "ENOENT";

const assertNoSymlinkInTargetPath = async ({
  repoRoot,
  relativePath,
}: {
  repoRoot: string;
  relativePath: string;
}) => {
  const segments = relativePath.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return;
  }

  let currentPath = path.resolve(repoRoot);
  for (const segment of segments) {
    currentPath = path.join(currentPath, segment);
    let stats: Awaited<ReturnType<typeof fs.lstat>>;
    try {
      stats = await fs.lstat(currentPath);
    } catch (error) {
      if (isReadablePermissionError(error)) {
        throw createServiceError("PERMISSION_DENIED", 403, "permission denied");
      }
      if (isNotFoundError(error)) {
        throw createServiceError("NOT_FOUND", 404, "path not found");
      }
      throw error;
    }
    if (stats.isSymbolicLink()) {
      throw createServiceError("FORBIDDEN_PATH", 403, "path must not traverse symbolic links");
    }
  }
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

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(createServiceError("INTERNAL", 500, timeoutMessage));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId != null) {
      clearTimeout(timeoutId);
    }
  }
};

const ensureRepoRootAvailable = async (repoRoot: string) => {
  try {
    const stats = await fs.stat(repoRoot);
    if (!stats.isDirectory()) {
      throw createServiceError("REPO_UNAVAILABLE", 400, "repo root is not a directory");
    }
  } catch (error) {
    if (isRepoFileServiceError(error)) {
      throw error;
    }
    if (isReadablePermissionError(error)) {
      throw createServiceError("PERMISSION_DENIED", 403, "permission denied");
    }
    if (isNotFoundError(error)) {
      throw createServiceError("REPO_UNAVAILABLE", 400, "repo root is unavailable");
    }
    throw createServiceError("INTERNAL", 500, "failed to access repo root");
  }
};

const toServiceError = (error: unknown): RepoFileServiceError => {
  if (isRepoFileServiceError(error)) {
    return error;
  }
  if (isPathGuardError(error)) {
    if (error.code === "FORBIDDEN_PATH") {
      return createServiceError("FORBIDDEN_PATH", 403, error.message);
    }
    return createServiceError("INVALID_PAYLOAD", 400, error.message);
  }
  if (isReadablePermissionError(error)) {
    return createServiceError("PERMISSION_DENIED", 403, "permission denied");
  }
  return createServiceError("INTERNAL", 500, "failed to access files");
};

const toDirectoryRelativePath = (basePath: string, name: string) => {
  return basePath === "." ? name : `${basePath}/${name}`;
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

const tokenizeQuery = (query: string) => {
  const rawTokens = query
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);
  return Array.from(new Set(rawTokens));
};

const buildWordSearchMatch = (item: SearchIndexItem, tokens: string[]) => {
  const lowerName = item.name.toLowerCase();
  const highlightSet = new Set<number>();
  let score = 0;

  for (const token of tokens) {
    const matchStart = lowerName.indexOf(token);
    if (matchStart < 0) {
      return null;
    }
    for (let offset = 0; offset < token.length; offset += 1) {
      highlightSet.add(matchStart + offset);
    }
    const positionScore = Math.max(0, 200 - matchStart);
    score += positionScore + token.length * 10;
  }

  score += Math.max(0, 100 - item.name.length);

  return {
    path: item.path,
    name: item.name,
    score,
    highlights: Array.from(highlightSet).sort((left, right) => left - right),
  };
};

const paginateItems = <T>({
  allItems,
  cursor,
  limit,
}: {
  allItems: T[];
  cursor: string | undefined;
  limit: number;
}) => {
  const offset = decodeCursor(cursor);
  const pagedItems = allItems.slice(offset, offset + limit);
  const nextOffset = offset + pagedItems.length;
  const nextCursor = nextOffset < allItems.length ? encodeCursor(nextOffset) : undefined;
  return {
    items: pagedItems,
    nextCursor,
    totalCount: allItems.length,
  };
};

const readFileSlice = async ({
  absolutePath,
  byteLength,
}: {
  absolutePath: string;
  byteLength: number;
}) => {
  if (byteLength <= 0) {
    return Buffer.alloc(0);
  }

  let fileHandle: fs.FileHandle | null = null;
  try {
    fileHandle = await fs.open(absolutePath, "r");
    const buffer = Buffer.alloc(byteLength);
    const { bytesRead } = await fileHandle.read(buffer, 0, byteLength, 0);
    return buffer.subarray(0, bytesRead);
  } catch (error) {
    if (isReadablePermissionError(error)) {
      throw createServiceError("PERMISSION_DENIED", 403, "permission denied");
    }
    if (isNotFoundError(error)) {
      throw createServiceError("NOT_FOUND", 404, "path not found");
    }
    throw error;
  } finally {
    await fileHandle?.close();
  }
};

const isTextControlByte = (byte: number) => {
  return (byte <= 8 || (byte >= 14 && byte <= 31) || byte === 127) && byte !== 0;
};

const isBinaryContent = (sample: Buffer) => {
  if (sample.length === 0) {
    return false;
  }
  let controlByteCount = 0;
  for (const byte of sample) {
    if (byte === 0) {
      return true;
    }
    if (isTextControlByte(byte)) {
      controlByteCount += 1;
    }
  }
  if (controlByteCount / sample.length >= 0.3) {
    return true;
  }
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    decoder.decode(sample);
    return false;
  } catch {
    return true;
  }
};

const resolveLanguageHint = (targetPath: string): RepoFileLanguageHint => {
  const normalized = targetPath.toLowerCase();
  const baseName = path.posix.basename(normalized);
  if (baseName === "dockerfile") {
    return "dockerfile";
  }
  const extension = path.posix.extname(normalized);
  if (extension === ".ts") {
    return "typescript";
  }
  if (extension === ".tsx") {
    return "tsx";
  }
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") {
    return "javascript";
  }
  if (extension === ".jsx") {
    return "jsx";
  }
  if (extension === ".json") {
    return "json";
  }
  if (extension === ".yml" || extension === ".yaml") {
    return "yaml";
  }
  if (extension === ".sh" || extension === ".bash" || extension === ".zsh") {
    return "bash";
  }
  if (extension === ".md" || extension === ".markdown") {
    return "markdown";
  }
  if (extension === ".diff" || extension === ".patch") {
    return "diff";
  }
  return "text";
};

export const createRepoFileService = ({
  fileNavigatorConfig,
  now = () => Date.now(),
}: RepoFileServiceDeps): RepoFileService => {
  const visibilityCache = new Map<string, VisibilityCacheEntry>();
  const searchIndexCache = new Map<string, SearchIndexCacheEntry>();

  const resolveVisibilityPolicy = async (repoRoot: string) => {
    const cached = visibilityCache.get(repoRoot);
    if (cached && cached.expiresAt > now()) {
      return cached.policy;
    }
    const gitignorePatterns = await resolveGitignorePatterns(repoRoot);
    const policy = createFileVisibilityPolicy({
      gitignorePatterns,
      includeIgnoredPaths: fileNavigatorConfig.includeIgnoredPaths,
    });
    visibilityCache.set(repoRoot, {
      policy,
      expiresAt: now() + VISIBILITY_CACHE_TTL_MS,
    });
    return policy;
  };

  const buildSearchIndex = async (
    repoRoot: string,
    policy: FileVisibilityPolicy,
    currentRelativePath = ".",
    output: SearchIndexItem[] = [],
  ): Promise<SearchIndexItem[]> => {
    const absolutePath = resolveRepoAbsolutePath(repoRoot, currentRelativePath);
    let entries: Dirent[];
    try {
      entries = await fs.readdir(absolutePath, { withFileTypes: true });
    } catch (error) {
      if (isReadablePermissionError(error)) {
        throw createServiceError("PERMISSION_DENIED", 403, "permission denied");
      }
      if (isNotFoundError(error)) {
        return output;
      }
      throw error;
    }

    const sortedEntries = [...entries].sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of sortedEntries) {
      if (entry.isSymbolicLink()) {
        continue;
      }
      const relativePath = toDirectoryRelativePath(currentRelativePath, entry.name);
      if (entry.isDirectory()) {
        if (!policy.shouldTraverseDirectory(relativePath)) {
          continue;
        }
        await buildSearchIndex(repoRoot, policy, relativePath, output);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (!policy.shouldIncludePath({ relativePath, isDirectory: false })) {
        continue;
      }
      output.push({ path: relativePath, name: entry.name });
    }
    return output;
  };

  const resolveSearchIndex = async (repoRoot: string, policy: FileVisibilityPolicy) => {
    const cached = searchIndexCache.get(repoRoot);
    if (cached && cached.expiresAt > now()) {
      return cached.items;
    }
    const items = await buildSearchIndex(repoRoot, policy);
    searchIndexCache.set(repoRoot, {
      items,
      expiresAt: now() + INDEX_CACHE_TTL_MS,
    });
    return items;
  };

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
          const hasChildren = await hasVisibleChildren({ repoRoot, relativePath, policy });
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

      const normalizedNodes = normalizeAndSortNodes(visibleNodes);
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
      const normalizedQuery = query.trim();
      if (normalizedQuery.length === 0) {
        throw createServiceError("INVALID_PAYLOAD", 400, "query must not be empty");
      }
      const policy = await resolveVisibilityPolicy(repoRoot);
      const index = await withTimeout(
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
      if (!Number.isFinite(maxBytes) || maxBytes < 1) {
        throw createServiceError("INVALID_PAYLOAD", 400, "maxBytes must be a positive number");
      }

      const normalizedPath = normalizeRepoRelativePath(rawPath);
      if (normalizedPath === ".") {
        throw createServiceError("INVALID_PAYLOAD", 400, "path must point to a file");
      }
      const absolutePath = resolveRepoAbsolutePath(repoRoot, normalizedPath);
      const policy = await resolveVisibilityPolicy(repoRoot);
      if (!policy.shouldIncludePath({ relativePath: normalizedPath, isDirectory: false })) {
        throw createServiceError("FORBIDDEN_PATH", 403, "path is not visible by policy");
      }

      return withTimeout(
        (async () => {
          await assertNoSymlinkInTargetPath({
            repoRoot,
            relativePath: normalizedPath,
          });

          let stats: Awaited<ReturnType<typeof fs.stat>>;
          try {
            stats = await fs.stat(absolutePath);
          } catch (error) {
            if (isReadablePermissionError(error)) {
              throw createServiceError("PERMISSION_DENIED", 403, "permission denied");
            }
            if (isNotFoundError(error)) {
              throw createServiceError("NOT_FOUND", 404, "path not found");
            }
            throw error;
          }
          if (!stats.isFile()) {
            throw createServiceError("INVALID_PAYLOAD", 400, "path must point to a file");
          }

          const sample = await readFileSlice({
            absolutePath,
            byteLength: Math.min(stats.size, BINARY_SAMPLE_BYTES),
          });
          const isBinary = isBinaryContent(sample);
          if (isBinary) {
            return {
              path: normalizedPath,
              sizeBytes: stats.size,
              isBinary: true,
              truncated: false,
              languageHint: null,
              content: null,
            } satisfies RepoFileContent;
          }

          const readBytes = Math.min(stats.size, maxBytes);
          const fileBuffer = await readFileSlice({
            absolutePath,
            byteLength: readBytes,
          });

          return {
            path: normalizedPath,
            sizeBytes: stats.size,
            isBinary: false,
            truncated: stats.size > maxBytes,
            languageHint: resolveLanguageHint(normalizedPath),
            content: fileBuffer.toString("utf8"),
          } satisfies RepoFileContent;
        })(),
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

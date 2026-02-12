import type { Dirent } from "node:fs";
import fs from "node:fs/promises";

import type { FileVisibilityPolicy } from "./file-visibility-policy";
import { resolveRepoAbsolutePath } from "./path-guard";
import { createServiceError, isNotFoundError, isReadablePermissionError } from "./service-context";

const INDEX_CACHE_TTL_MS = 5_000;
const KNOWN_PATH_CACHE_TTL_MS = 5_000;

type SearchIndexBaseItem = {
  path: string;
  name: string;
  kind: "file" | "directory";
};

export type SearchIndexItem = SearchIndexBaseItem & {
  isIgnored: boolean;
};

type SearchIndexCacheEntry = {
  items: SearchIndexItem[];
  expiresAt: number;
  knownPathFingerprint: string | null;
  policy: FileVisibilityPolicy;
};

type KnownPathCacheEntry = {
  knownFiles: Set<string> | null;
  knownDirectories: Set<string> | null;
  fingerprint: string | null;
  expiresAt: number;
};

type CreateSearchIndexResolverDeps = {
  now: () => number;
  runLsFiles: (repoRoot: string, args: string[]) => Promise<string[]>;
};

const toDirectoryRelativePath = (basePath: string, name: string) => {
  return basePath === "." ? name : `${basePath}/${name}`;
};

const buildKnownDirectorySet = (knownFiles: Set<string>) => {
  const knownDirectories = new Set<string>();
  knownFiles.forEach((relativePath) => {
    const segments = relativePath.split("/").filter((segment) => segment.length > 0);
    if (segments.length <= 1) {
      return;
    }
    let current = "";
    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index];
      if (!segment) {
        continue;
      }
      current = current.length > 0 ? `${current}/${segment}` : segment;
      knownDirectories.add(current);
    }
  });
  return knownDirectories;
};

const normalizeDirectoryPath = (relativePath: string) => {
  if (!relativePath.endsWith("/")) {
    return relativePath;
  }
  return relativePath.slice(0, -1);
};

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const updateFingerprintHash = (hash: number, value: string) => {
  let next = hash >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    next ^= value.charCodeAt(index);
    next = Math.imul(next, FNV_PRIME) >>> 0;
  }
  next ^= 0xff;
  return Math.imul(next, FNV_PRIME) >>> 0;
};

const buildKnownPathFingerprint = ({
  trackedFiles,
  untrackedFiles,
  untrackedPathHints,
}: {
  trackedFiles: string[];
  untrackedFiles: string[];
  untrackedPathHints: string[];
}) => {
  let hash = FNV_OFFSET_BASIS;
  for (const entry of trackedFiles) {
    hash = updateFingerprintHash(hash, `t:${entry}`);
  }
  for (const entry of untrackedFiles) {
    hash = updateFingerprintHash(hash, `u:${entry}`);
  }
  for (const entry of untrackedPathHints) {
    hash = updateFingerprintHash(hash, `h:${entry}`);
  }
  return hash.toString(16).padStart(8, "0");
};

export const createSearchIndexResolver = ({ now, runLsFiles }: CreateSearchIndexResolverDeps) => {
  const searchIndexCache = new Map<string, SearchIndexCacheEntry>();
  const knownPathCache = new Map<string, KnownPathCacheEntry>();

  const resolveKnownPaths = async (repoRoot: string) => {
    const cached = knownPathCache.get(repoRoot);
    if (cached && cached.expiresAt > now()) {
      return cached;
    }
    try {
      const [trackedFiles, untrackedFiles, untrackedPathHints] = await Promise.all([
        runLsFiles(repoRoot, ["ls-files", "-z"]),
        runLsFiles(repoRoot, ["ls-files", "--others", "--exclude-standard", "-z"]),
        runLsFiles(repoRoot, ["ls-files", "--others", "--exclude-standard", "--directory", "-z"]),
      ]);
      const fingerprint = buildKnownPathFingerprint({
        trackedFiles,
        untrackedFiles,
        untrackedPathHints,
      });
      const knownFiles = new Set([...trackedFiles, ...untrackedFiles]);
      const untrackedDirectories = new Set<string>();
      untrackedPathHints.forEach((entry) => {
        if (entry.endsWith("/")) {
          const normalized = normalizeDirectoryPath(entry);
          if (normalized.length > 0) {
            untrackedDirectories.add(normalized);
          }
          return;
        }
        knownFiles.add(entry);
      });
      const knownDirectories = buildKnownDirectorySet(knownFiles);
      untrackedDirectories.forEach((directoryPath) => {
        knownDirectories.add(directoryPath);
      });
      const next = {
        knownFiles,
        knownDirectories,
        fingerprint,
        expiresAt: now() + KNOWN_PATH_CACHE_TTL_MS,
      } satisfies KnownPathCacheEntry;
      knownPathCache.set(repoRoot, next);
      return next;
    } catch {
      const next = {
        knownFiles: null,
        knownDirectories: null,
        fingerprint: null,
        expiresAt: now() + KNOWN_PATH_CACHE_TTL_MS,
      } satisfies KnownPathCacheEntry;
      knownPathCache.set(repoRoot, next);
      return next;
    }
  };

  const resolveIsIgnored = ({
    path: relativePath,
    kind,
    knownPathEntry,
  }: {
    path: string;
    kind: "file" | "directory";
    knownPathEntry: KnownPathCacheEntry;
  }) => {
    if (kind === "file") {
      if (!knownPathEntry.knownFiles) {
        return false;
      }
      return !knownPathEntry.knownFiles.has(relativePath);
    }
    if (!knownPathEntry.knownDirectories) {
      return false;
    }
    if (knownPathEntry.knownDirectories.has(relativePath)) {
      return false;
    }
    if (knownPathEntry.knownFiles?.has(relativePath)) {
      return false;
    }
    return true;
  };

  const withIgnoredFlags = async <T extends { path: string; kind: "file" | "directory" }>(
    repoRoot: string,
    items: T[],
    knownPathEntryOverride?: KnownPathCacheEntry,
  ): Promise<Array<T & { isIgnored: boolean }>> => {
    const knownPathEntry = knownPathEntryOverride ?? (await resolveKnownPaths(repoRoot));
    return items.map((item) => ({
      ...item,
      isIgnored: resolveIsIgnored({
        path: item.path,
        kind: item.kind,
        knownPathEntry,
      }),
    }));
  };

  const buildSearchIndex = async (
    repoRoot: string,
    policy: FileVisibilityPolicy,
    currentRelativePath = ".",
    output: SearchIndexBaseItem[] = [],
  ): Promise<SearchIndexBaseItem[]> => {
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
        const includeDirectory = policy.shouldIncludePath({ relativePath, isDirectory: true });
        if (includeDirectory) {
          output.push({
            path: relativePath,
            name: entry.name,
            kind: "directory",
          });
        }
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
      output.push({
        path: relativePath,
        name: entry.name,
        kind: "file",
      });
    }
    return output;
  };

  const resolveSearchIndex = async (repoRoot: string, policy: FileVisibilityPolicy) => {
    const nowMs = now();
    const cached = searchIndexCache.get(repoRoot);
    if (cached && cached.expiresAt > nowMs) {
      return cached.items;
    }

    let knownPathEntry: KnownPathCacheEntry | null = null;
    if (cached && cached.policy === policy) {
      knownPathEntry = await resolveKnownPaths(repoRoot);
      if (
        knownPathEntry.fingerprint != null &&
        cached.knownPathFingerprint != null &&
        knownPathEntry.fingerprint === cached.knownPathFingerprint
      ) {
        searchIndexCache.set(repoRoot, {
          ...cached,
          expiresAt: nowMs + INDEX_CACHE_TTL_MS,
        });
        return cached.items;
      }
    }

    const items = await buildSearchIndex(repoRoot, policy);
    if (knownPathEntry == null) {
      knownPathEntry = await resolveKnownPaths(repoRoot);
    }
    const itemsWithIgnored = await withIgnoredFlags(repoRoot, items, knownPathEntry);
    searchIndexCache.set(repoRoot, {
      items: itemsWithIgnored,
      expiresAt: nowMs + INDEX_CACHE_TTL_MS,
      knownPathFingerprint: knownPathEntry.fingerprint,
      policy,
    });
    return itemsWithIgnored;
  };

  return {
    resolveSearchIndex,
    withIgnoredFlags,
  };
};

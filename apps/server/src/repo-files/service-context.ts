import fs from "node:fs/promises";

import { isPathGuardError, normalizeRepoRelativePath } from "./path-guard";

export type RepoFileServiceError = {
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

export const createServiceError = (
  code: RepoFileServiceError["code"],
  status: RepoFileServiceError["status"],
  message: string,
): RepoFileServiceError => ({ code, status, message });

export const isRepoFileServiceError = (error: unknown): error is RepoFileServiceError => {
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

export const isReadablePermissionError = (error: unknown) => {
  const code = toNodeErrorCode(error);
  return code === "EACCES" || code === "EPERM";
};

export const isNotFoundError = (error: unknown) => toNodeErrorCode(error) === "ENOENT";

export const ensureRepoRootAvailable = async (repoRoot: string) => {
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

export const normalizeSearchQuery = (query: string) => {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length === 0) {
    throw createServiceError("INVALID_PAYLOAD", 400, "query must not be empty");
  }
  return normalizedQuery;
};

export const normalizeFileContentPath = (rawPath: string) => {
  const normalizedPath = normalizeRepoRelativePath(rawPath);
  if (normalizedPath === ".") {
    throw createServiceError("INVALID_PAYLOAD", 400, "path must point to a file");
  }
  return normalizedPath;
};

export const validateMaxBytes = (maxBytes: number) => {
  if (!Number.isFinite(maxBytes) || maxBytes < 1) {
    throw createServiceError("INVALID_PAYLOAD", 400, "maxBytes must be a positive number");
  }
};

export const toServiceError = (error: unknown): RepoFileServiceError => {
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

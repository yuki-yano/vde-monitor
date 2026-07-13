import fs from "node:fs/promises";
import path from "node:path";

import { resolveRepoAbsolutePath } from "./path-guard";
import { createServiceError, isNotFoundError, isReadablePermissionError } from "./service-context";

type ResolvedRepoPath = {
  absolutePath: string;
  realPath: string;
  repoRootRealPath: string;
  realRelativePath: string;
};

const isPathInside = (rootPath: string, targetPath: string) => {
  const relativePath = path.relative(rootPath, targetPath);
  return (
    relativePath.length === 0 ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  );
};

const isGitMetadataPath = (relativePath: string) => {
  const normalizedPath = relativePath.toLowerCase();
  return normalizedPath === ".git" || normalizedPath.startsWith(".git/");
};

const toPosixRelativePath = (rootPath: string, targetPath: string) => {
  return path.relative(rootPath, targetPath).split(path.sep).join("/") || ".";
};

const resolveOptionalRealPath = async (targetPath: string) => {
  try {
    return await fs.realpath(targetPath);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
};

export const resolveSafeRepoPath = async ({
  repoRoot,
  relativePath,
}: {
  repoRoot: string;
  relativePath: string;
}): Promise<ResolvedRepoPath> => {
  if (isGitMetadataPath(relativePath)) {
    throw createServiceError("FORBIDDEN_PATH", 403, "path is not visible by policy");
  }

  const absolutePath = resolveRepoAbsolutePath(repoRoot, relativePath);
  try {
    const repoRootRealPath = await fs.realpath(repoRoot);
    const gitMetadataRealPath = await resolveOptionalRealPath(path.join(repoRootRealPath, ".git"));
    const segments = relativePath === "." ? [] : relativePath.split("/");
    let currentPath = repoRootRealPath;
    let realPath = repoRootRealPath;
    for (const segment of segments) {
      currentPath = path.join(currentPath, segment);
      realPath = await fs.realpath(currentPath);
      if (!isPathInside(repoRootRealPath, realPath)) {
        throw createServiceError("FORBIDDEN_PATH", 403, "path must stay within repo root");
      }
      if (gitMetadataRealPath && isPathInside(gitMetadataRealPath, realPath)) {
        throw createServiceError("FORBIDDEN_PATH", 403, "path is not visible by policy");
      }
    }
    if (!isPathInside(repoRootRealPath, realPath)) {
      throw createServiceError("FORBIDDEN_PATH", 403, "path must stay within repo root");
    }
    if (gitMetadataRealPath && isPathInside(gitMetadataRealPath, realPath)) {
      throw createServiceError("FORBIDDEN_PATH", 403, "path is not visible by policy");
    }

    return {
      absolutePath,
      realPath,
      repoRootRealPath,
      realRelativePath: toPosixRelativePath(repoRootRealPath, realPath),
    };
  } catch (error) {
    if (isReadablePermissionError(error)) {
      throw createServiceError("PERMISSION_DENIED", 403, "permission denied");
    }
    if (isNotFoundError(error)) {
      throw createServiceError("NOT_FOUND", 404, "path not found");
    }
    throw error;
  }
};

export const resolveRepoClassificationPath = async ({
  repoRoot,
  relativePath,
}: {
  repoRoot: string;
  relativePath: string;
}) => {
  const resolvedPath = await resolveSafeRepoPath({ repoRoot, relativePath });
  const stats = await fs.lstat(resolvedPath.absolutePath);
  return stats.isSymbolicLink() ? relativePath : resolvedPath.realRelativePath;
};

export const isHardHiddenRepoPath = isGitMetadataPath;

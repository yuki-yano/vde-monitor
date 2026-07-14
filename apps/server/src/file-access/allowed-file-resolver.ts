import fs from "node:fs/promises";
import path from "node:path";

import type { PreviewRoot } from "../file-preview";
import {
  type NestedWorktreeRoot,
  isRegisteredNestedWorktreeRoot,
} from "../repo-files/nested-worktree-roots";
import { normalizeRepoRelativePath } from "../repo-files/path-guard";
import {
  createServiceError,
  isNotFoundError,
  isReadablePermissionError,
} from "../repo-files/service-context";

export type AllowedFileRoots = {
  repoRoot: PreviewRoot;
  roots: PreviewRoot[];
  aliases: Array<{ lexicalPath: string; root: PreviewRoot }>;
};

export type ResolvedAllowedFile = {
  requestedPath: string;
  absolutePath: string;
  root: PreviewRoot;
  relativePath: string;
  repoRelativePath: string | null;
  roots: PreviewRoot[];
};

const isPathInside = (rootPath: string, targetPath: string) => {
  const relative = path.relative(rootPath, targetPath);
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
};

const toPosixPath = (value: string) => value.split(path.sep).join("/");

const containsGitMetadataSegment = (value: string) =>
  toPosixPath(value)
    .split("/")
    .some((segment) => segment.toLowerCase() === ".git");

const assertExternalRootIsVisible = (lexicalPath: string, canonicalPath: string) => {
  if (
    containsGitMetadataSegment(path.resolve(lexicalPath)) ||
    containsGitMetadataSegment(canonicalPath)
  ) {
    throw createServiceError("FORBIDDEN_PATH", 403, "externalRoots must not point into .git");
  }
};

const resolveDarwinSystemAliasCandidate = (canonicalPath: string) => {
  if (
    canonicalPath === "/private/tmp" ||
    canonicalPath.startsWith("/private/tmp/") ||
    canonicalPath === "/private/var" ||
    canonicalPath.startsWith("/private/var/")
  ) {
    return canonicalPath.slice("/private".length);
  }
  return null;
};

const resolveSystemAliases = async (root: PreviewRoot) => {
  const candidate = resolveDarwinSystemAliasCandidate(root.canonicalPath);
  if (!candidate) {
    return [];
  }
  try {
    const canonicalCandidate = await fs.realpath(candidate);
    return canonicalCandidate === root.canonicalPath ? [{ lexicalPath: candidate, root }] : [];
  } catch (error) {
    if (isNotFoundError(error) || isReadablePermissionError(error)) {
      return [];
    }
    throw error;
  }
};

const resolveCanonicalDirectory = async (targetPath: string) => {
  const canonicalPath = await fs.realpath(targetPath);
  const stats = await fs.stat(canonicalPath);
  if (!stats.isDirectory()) {
    throw createServiceError("INVALID_PAYLOAD", 400, "externalRoots must point to directories");
  }
  return canonicalPath;
};

const isLinkedWorktreeDirectory = async (canonicalPath: string) => {
  try {
    return (await fs.lstat(path.join(canonicalPath, ".git"))).isFile();
  } catch {
    return false;
  }
};

export const resolveAllowedFileRoots = async ({
  repoRoot,
  externalRoots,
  nestedWorktreeRoots = [],
}: {
  repoRoot: string;
  externalRoots: readonly string[];
  nestedWorktreeRoots?: readonly NestedWorktreeRoot[];
}): Promise<AllowedFileRoots> => {
  try {
    externalRoots.forEach((externalRoot) => {
      assertExternalRootIsVisible(externalRoot, path.resolve(externalRoot));
    });
    const canonicalRepoRoot = await resolveCanonicalDirectory(repoRoot);
    const canonicalExternalRoots = await Promise.all(
      externalRoots.map((externalRoot) => resolveCanonicalDirectory(externalRoot)),
    );
    const canonicalNestedWorktreeRoots = await Promise.all(
      nestedWorktreeRoots.map((worktreeRoot) => {
        if (!isRegisteredNestedWorktreeRoot(worktreeRoot)) {
          throw createServiceError("FORBIDDEN_PATH", 403, "linked worktree root is not registered");
        }
        return resolveCanonicalDirectory(worktreeRoot.canonicalPath);
      }),
    );
    externalRoots.forEach((externalRoot, index) => {
      assertExternalRootIsVisible(externalRoot, canonicalExternalRoots[index] ?? "");
    });
    const uniquePaths = [...new Set([canonicalRepoRoot, ...canonicalExternalRoots])];
    const repoRootIsLinkedWorktree = await isLinkedWorktreeDirectory(canonicalRepoRoot);
    const roots: PreviewRoot[] = uniquePaths.map((canonicalPath, index) => ({
      rootId: canonicalPath === canonicalRepoRoot ? "repo" : `external-${index}`,
      canonicalPath,
      kind:
        canonicalPath === canonicalRepoRoot
          ? repoRootIsLinkedWorktree
            ? "linked-worktree"
            : "repository"
          : "external",
    }));
    canonicalNestedWorktreeRoots.forEach((canonicalPath, index) => {
      if (!roots.some((root) => root.canonicalPath === canonicalPath)) {
        roots.push({ rootId: `worktree-${index}`, canonicalPath, kind: "linked-worktree" });
      }
    });
    const resolvedRepoRoot = roots.find((root) => root.canonicalPath === canonicalRepoRoot);
    if (!resolvedRepoRoot) {
      throw createServiceError("INTERNAL", 500, "failed to resolve repository root");
    }
    const configuredAliases = [repoRoot, ...externalRoots].map((lexicalPath, index) => {
      const canonicalPath =
        index === 0 ? canonicalRepoRoot : (canonicalExternalRoots[index - 1] ?? "");
      const root = roots.find((candidate) => candidate.canonicalPath === canonicalPath);
      if (!root) {
        throw createServiceError("INTERNAL", 500, "failed to resolve configured file root");
      }
      return { lexicalPath: path.resolve(lexicalPath), root };
    });
    const nestedWorktreeAliases = nestedWorktreeRoots.map((worktreeRoot, index) => {
      const canonicalPath = canonicalNestedWorktreeRoots[index] ?? "";
      const root = roots.find((candidate) => candidate.canonicalPath === canonicalPath);
      if (!root) {
        throw createServiceError("INTERNAL", 500, "failed to resolve linked worktree root");
      }
      return {
        lexicalPath: path.resolve(repoRoot, ...worktreeRoot.relativePath.split("/")),
        root,
      };
    });
    const canonicalAliases = roots.map((root) => ({ lexicalPath: root.canonicalPath, root }));
    const systemAliases = (await Promise.all(roots.map(resolveSystemAliases))).flat();
    const aliases = [
      ...configuredAliases,
      ...nestedWorktreeAliases,
      ...canonicalAliases,
      ...systemAliases,
    ].filter(
      (alias, index, allAliases) =>
        allAliases.findIndex(
          (candidate) =>
            candidate.lexicalPath === alias.lexicalPath &&
            candidate.root.canonicalPath === alias.root.canonicalPath,
        ) === index,
    );
    return { repoRoot: resolvedRepoRoot, roots, aliases };
  } catch (error) {
    if (isReadablePermissionError(error)) {
      throw createServiceError("PERMISSION_DENIED", 403, "permission denied");
    }
    if (isNotFoundError(error)) {
      throw createServiceError("NOT_FOUND", 404, "configured file root was not found");
    }
    throw error;
  }
};

const resolveMostSpecificRoot = (roots: readonly PreviewRoot[], targetPath: string) =>
  roots
    .filter((root) => isPathInside(root.canonicalPath, targetPath))
    .sort((left, right) => right.canonicalPath.length - left.canonicalPath.length)[0] ?? null;

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

const assertSafeTraversal = async (
  root: PreviewRoot,
  lexicalRootPath: string,
  lexicalTarget: string,
) => {
  const lexicalRelativePath = path.relative(lexicalRootPath, lexicalTarget);
  if (!isPathInside(lexicalRootPath, lexicalTarget)) {
    throw createServiceError("FORBIDDEN_PATH", 403, "path is outside the allowed file roots");
  }
  const gitMetadataRoot = await resolveOptionalRealPath(path.join(root.canonicalPath, ".git"));
  let currentPath = lexicalRootPath;
  for (const segment of lexicalRelativePath.split(path.sep).filter(Boolean)) {
    if (segment.toLowerCase() === ".git") {
      throw createServiceError("FORBIDDEN_PATH", 403, "path is not visible by policy");
    }
    currentPath = path.join(currentPath, segment);
    const canonicalPrefix = await fs.realpath(currentPath);
    if (!isPathInside(root.canonicalPath, canonicalPrefix)) {
      throw createServiceError("FORBIDDEN_PATH", 403, "path is outside the allowed file roots");
    }
    if (gitMetadataRoot && isPathInside(gitMetadataRoot, canonicalPrefix)) {
      throw createServiceError("FORBIDDEN_PATH", 403, "path is not visible by policy");
    }
  }
};

export const resolveAllowedFile = async ({
  repoRoot,
  externalRoots,
  nestedWorktreeRoots = [],
  requestedPath,
}: {
  repoRoot: string;
  externalRoots: readonly string[];
  nestedWorktreeRoots?: readonly NestedWorktreeRoot[];
  requestedPath: string;
}): Promise<ResolvedAllowedFile> => {
  const rawPath = requestedPath.trim();
  if (!rawPath || rawPath.includes("\0")) {
    throw createServiceError("INVALID_PAYLOAD", 400, "invalid file path");
  }
  const allowed = await resolveAllowedFileRoots({
    repoRoot,
    externalRoots,
    nestedWorktreeRoots,
  });
  const isAbsoluteReference = path.isAbsolute(rawPath);
  const normalizedRepoPath = isAbsoluteReference ? null : normalizeRepoRelativePath(rawPath);
  const repoLexicalRoot = allowed.aliases.find(
    (alias) => alias.root.rootId === allowed.repoRoot.rootId,
  );
  if (!repoLexicalRoot) {
    throw createServiceError("INTERNAL", 500, "failed to resolve repository root alias");
  }
  const lexicalTarget = isAbsoluteReference
    ? path.resolve(rawPath)
    : path.resolve(
        repoLexicalRoot.lexicalPath,
        normalizedRepoPath === "." ? "" : (normalizedRepoPath ?? ""),
      );

  const lexicalRootAlias = allowed.aliases
    .filter((alias) => isPathInside(alias.lexicalPath, lexicalTarget))
    .sort((left, right) => right.lexicalPath.length - left.lexicalPath.length)[0];
  if (!lexicalRootAlias) {
    throw createServiceError("FORBIDDEN_PATH", 403, "path is outside the allowed file roots");
  }
  const lexicalRootRelativePath = path.relative(lexicalRootAlias.lexicalPath, lexicalTarget);
  if (containsGitMetadataSegment(lexicalRootRelativePath)) {
    throw createServiceError("FORBIDDEN_PATH", 403, "path is not visible by policy");
  }
  await assertSafeTraversal(lexicalRootAlias.root, lexicalRootAlias.lexicalPath, lexicalTarget);

  let canonicalTarget: string;
  try {
    canonicalTarget = await fs.realpath(lexicalTarget);
  } catch (error) {
    if (isReadablePermissionError(error)) {
      throw createServiceError("PERMISSION_DENIED", 403, "permission denied");
    }
    if (isNotFoundError(error)) {
      throw createServiceError("NOT_FOUND", 404, "path not found");
    }
    throw error;
  }

  const candidateRoots = [lexicalRootAlias.root];
  const containingRoot = resolveMostSpecificRoot(candidateRoots, canonicalTarget);
  if (!containingRoot) {
    throw createServiceError("FORBIDDEN_PATH", 403, "path is outside the allowed file roots");
  }
  const relativePath = toPosixPath(path.relative(containingRoot.canonicalPath, canonicalTarget));
  if (!relativePath || containsGitMetadataSegment(relativePath)) {
    throw createServiceError("FORBIDDEN_PATH", 403, "path is not visible by policy");
  }
  const stats = await fs.stat(canonicalTarget);
  if (!stats.isFile()) {
    throw createServiceError("INVALID_PAYLOAD", 400, "path must point to a file");
  }
  const repoRelativePath = isPathInside(allowed.repoRoot.canonicalPath, canonicalTarget)
    ? toPosixPath(path.relative(allowed.repoRoot.canonicalPath, canonicalTarget))
    : null;
  return {
    requestedPath: normalizedRepoPath ?? rawPath,
    absolutePath: canonicalTarget,
    root: containingRoot,
    relativePath,
    repoRelativePath,
    roots: allowed.roots,
  };
};

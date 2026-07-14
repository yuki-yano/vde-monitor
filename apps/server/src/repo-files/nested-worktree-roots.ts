import fs from "node:fs/promises";
import path from "node:path";

import { runGit } from "../domain/git/git-utils";

const CACHE_TTL_MS = 5_000;
const NESTED_WORKTREE_REGISTRATION = Symbol("nested-worktree-registration");

export type NestedWorktreeRoot = {
  canonicalPath: string;
  relativePath: string;
  readonly [NESTED_WORKTREE_REGISTRATION]: true;
};

const cache = new Map<string, { expiresAt: number; roots: readonly NestedWorktreeRoot[] }>();

const toPosixPath = (value: string) => value.split(path.sep).join("/");

const isPathInside = (rootPath: string, targetPath: string) => {
  const relativePath = path.relative(rootPath, targetPath);
  return (
    relativePath.length === 0 ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  );
};

const parseWorktreePaths = (output: string) =>
  output
    .split("\0")
    .filter((field) => field.startsWith("worktree "))
    .map((field) => field.slice("worktree ".length));

const isGitMetadataRelativePath = (relativePath: string) =>
  relativePath.toLowerCase().startsWith(".git/wt/");

export const resolveNestedWorktreeRoots = async (
  repoRoot: string,
  options: { fresh?: boolean } = {},
): Promise<readonly NestedWorktreeRoot[]> => {
  let canonicalRepoRoot: string;
  try {
    canonicalRepoRoot = await fs.realpath(repoRoot);
  } catch {
    return [];
  }

  const cached = cache.get(canonicalRepoRoot);
  if (!options.fresh && cached && cached.expiresAt > Date.now()) {
    return cached.roots;
  }

  let roots: NestedWorktreeRoot[] = [];
  try {
    const output = await runGit(canonicalRepoRoot, ["worktree", "list", "--porcelain", "-z"], {
      timeoutMs: 1_500,
      maxBuffer: 2_000_000,
      allowStdoutOnError: false,
    });
    const candidates = await Promise.all(
      parseWorktreePaths(output).map(async (worktreePath) => {
        const canonicalPath = await fs.realpath(worktreePath);
        if (
          canonicalPath === canonicalRepoRoot ||
          !isPathInside(canonicalRepoRoot, canonicalPath)
        ) {
          return null;
        }
        const relativePath = toPosixPath(path.relative(canonicalRepoRoot, canonicalPath));
        if (!isGitMetadataRelativePath(relativePath)) {
          return null;
        }
        const marker = await fs.lstat(path.join(canonicalPath, ".git"));
        if (!marker.isFile()) {
          return null;
        }
        return {
          canonicalPath,
          relativePath,
          [NESTED_WORKTREE_REGISTRATION]: true as const,
        };
      }),
    );
    roots = candidates.filter((candidate): candidate is NestedWorktreeRoot => candidate != null);
  } catch {
    roots = [];
  }

  const uniqueRoots = [...new Map(roots.map((root) => [root.canonicalPath, root])).values()].sort(
    (left, right) => left.relativePath.localeCompare(right.relativePath),
  );
  cache.set(canonicalRepoRoot, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    roots: uniqueRoots,
  });
  return uniqueRoots;
};

export const findContainingNestedWorktreeRoot = (
  roots: readonly NestedWorktreeRoot[],
  relativePath: string,
) =>
  roots
    .filter(
      (root) =>
        relativePath === root.relativePath || relativePath.startsWith(`${root.relativePath}/`),
    )
    .sort((left, right) => right.relativePath.length - left.relativePath.length)[0] ?? null;

export const isNestedWorktreeAncestorPath = (
  roots: readonly NestedWorktreeRoot[],
  relativePath: string,
) => roots.some((root) => root.relativePath.startsWith(`${relativePath}/`));

export const isRegisteredNestedWorktreeRoot = (value: NestedWorktreeRoot) =>
  value[NESTED_WORKTREE_REGISTRATION] === true;

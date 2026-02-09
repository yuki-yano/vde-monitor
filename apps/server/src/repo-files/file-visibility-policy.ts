import type { RepoFileTreeNode } from "@vde-monitor/shared";
import ignore, { type Ignore } from "ignore";

type FileVisibilityPolicyInput = {
  relativePath: string;
  isDirectory: boolean;
};

type PlanDirectoryTraversalInput = {
  entries: RepoFileTreeNode[];
};

export type FileVisibilityPolicy = {
  shouldIncludePath: (input: FileVisibilityPolicyInput) => boolean;
  shouldTraverseDirectory: (relativePath: string) => boolean;
  planDirectoryTraversal: (input: PlanDirectoryTraversalInput) => Set<string>;
};

export type FileVisibilityPolicyDeps = {
  gitignorePatterns: string[];
  includeIgnoredPaths: string[];
};

const hasGlobSyntax = (segment: string) => /[*?[]/.test(segment);

const toDirectoryCandidates = (relativePath: string) => {
  if (relativePath === ".") {
    return [];
  }
  const normalized = relativePath.replace(/\/+$/g, "");
  return [normalized, `${normalized}/`];
};

const toFileCandidates = (relativePath: string) => {
  if (relativePath === ".") {
    return [];
  }
  return [relativePath];
};

const matchesAnyPattern = (matcher: Ignore, candidates: string[]) =>
  candidates.some((candidate) => matcher.ignores(candidate));

const resolvePatternAnchors = (patterns: string[]) => {
  const anchors = new Set<string>();
  let hasGlobalPattern = false;

  patterns.forEach((pattern) => {
    const segments = pattern.split("/").filter((segment) => segment.length > 0);
    if (segments.length === 0) {
      hasGlobalPattern = true;
      return;
    }
    if (hasGlobSyntax(segments[0] ?? "")) {
      hasGlobalPattern = true;
      return;
    }

    let current = "";
    for (const segment of segments) {
      if (hasGlobSyntax(segment)) {
        break;
      }
      current = current.length > 0 ? `${current}/${segment}` : segment;
      anchors.add(current);
    }
  });

  return { anchors, hasGlobalPattern };
};

const canContainIncludedDescendant = (
  relativePath: string,
  anchors: Set<string>,
  hasGlobalPattern: boolean,
) => {
  if (hasGlobalPattern) {
    return true;
  }
  if (anchors.has(relativePath)) {
    return true;
  }
  for (const anchor of anchors) {
    if (anchor.startsWith(`${relativePath}/`)) {
      return true;
    }
  }
  return false;
};

export const createFileVisibilityPolicy = ({
  gitignorePatterns,
  includeIgnoredPaths,
}: FileVisibilityPolicyDeps): FileVisibilityPolicy => {
  const gitignoreMatcher = ignore({ ignorecase: false }).add(gitignorePatterns);
  const includeMatcher = ignore({ ignorecase: false }).add(includeIgnoredPaths);
  const { anchors, hasGlobalPattern } = resolvePatternAnchors(includeIgnoredPaths);

  const shouldIncludePath = ({ relativePath, isDirectory }: FileVisibilityPolicyInput) => {
    const candidates = isDirectory
      ? toDirectoryCandidates(relativePath)
      : toFileCandidates(relativePath);
    if (matchesAnyPattern(includeMatcher, candidates)) {
      return true;
    }
    if (!matchesAnyPattern(gitignoreMatcher, candidates)) {
      return true;
    }
    if (!isDirectory) {
      return false;
    }
    return canContainIncludedDescendant(relativePath, anchors, hasGlobalPattern);
  };

  const shouldTraverseDirectory = (relativePath: string) => {
    const candidates = toDirectoryCandidates(relativePath);
    if (matchesAnyPattern(includeMatcher, candidates)) {
      return true;
    }
    if (!matchesAnyPattern(gitignoreMatcher, candidates)) {
      return true;
    }
    return canContainIncludedDescendant(relativePath, anchors, hasGlobalPattern);
  };

  const planDirectoryTraversal = ({ entries }: PlanDirectoryTraversalInput) => {
    const traversable = new Set<string>();
    entries.forEach((entry) => {
      if (entry.kind !== "directory") {
        return;
      }
      if (shouldTraverseDirectory(entry.path)) {
        traversable.add(entry.path);
      }
    });
    return traversable;
  };

  return {
    shouldIncludePath,
    shouldTraverseDirectory,
    planDirectoryTraversal,
  };
};

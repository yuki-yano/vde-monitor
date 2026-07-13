import type { RunGitPaths } from "./service-git-ls-files";

const SNAPSHOT_TTL_MS = 5_000;

type GitPathSnapshot = {
  trackedFiles: Set<string>;
  trackedDirectories: Set<string>;
  ignoredPaths: Map<string, boolean>;
  expiresAt: number;
};

type ClassifiablePath = {
  path: string;
  classificationPath?: string;
  kind: "file" | "directory";
  inheritedIgnored?: boolean;
};

const buildTrackedDirectories = (trackedFiles: Set<string>) => {
  const trackedDirectories = new Set<string>();
  for (const trackedFile of trackedFiles) {
    const segments = trackedFile.split("/");
    let currentPath = "";
    for (let index = 0; index < segments.length - 1; index += 1) {
      currentPath = currentPath ? `${currentPath}/${segments[index]}` : (segments[index] ?? "");
      if (currentPath) {
        trackedDirectories.add(currentPath);
      }
    }
  }
  return trackedDirectories;
};

const isTrackedPath = (snapshot: GitPathSnapshot, target: ClassifiablePath) => {
  const classificationPath = target.classificationPath ?? target.path;
  if (target.kind === "file") {
    return snapshot.trackedFiles.has(classificationPath);
  }
  return (
    snapshot.trackedDirectories.has(classificationPath) ||
    snapshot.trackedFiles.has(classificationPath)
  );
};

export const createGitPathSnapshotResolver = ({
  now,
  runGitPaths,
}: {
  now: () => number;
  runGitPaths: RunGitPaths;
}) => {
  const snapshots = new Map<string, GitPathSnapshot>();

  const resolveSnapshot = async (repoRoot: string) => {
    const cached = snapshots.get(repoRoot);
    if (cached && cached.expiresAt > now()) {
      return cached;
    }

    const trackedFiles = new Set(await runGitPaths(repoRoot, ["ls-files", "--cached", "-z"]));
    const snapshot = {
      trackedFiles,
      trackedDirectories: buildTrackedDirectories(trackedFiles),
      ignoredPaths: new Map<string, boolean>(),
      expiresAt: now() + SNAPSHOT_TTL_MS,
    } satisfies GitPathSnapshot;
    snapshots.set(repoRoot, snapshot);
    return snapshot;
  };

  const classifyPaths = async <T extends ClassifiablePath>(repoRoot: string, paths: T[]) => {
    const snapshot = await resolveSnapshot(repoRoot);
    const unresolvedPaths = new Set<string>();

    for (const target of paths) {
      const classificationPath = target.classificationPath ?? target.path;
      if (
        !target.inheritedIgnored &&
        !isTrackedPath(snapshot, target) &&
        !snapshot.ignoredPaths.has(classificationPath)
      ) {
        unresolvedPaths.add(classificationPath);
      }
    }

    if (unresolvedPaths.size > 0) {
      const candidates = [...unresolvedPaths];
      const ignoredPaths = new Set(
        await runGitPaths(
          repoRoot,
          ["check-ignore", "-z", "--stdin"],
          `${candidates.join("\0")}\0`,
        ),
      );
      for (const candidate of candidates) {
        snapshot.ignoredPaths.set(candidate, ignoredPaths.has(candidate));
      }
    }

    return paths.map((target) => ({
      ...target,
      isIgnored: isTrackedPath(snapshot, target)
        ? false
        : target.inheritedIgnored ||
          snapshot.ignoredPaths.get(target.classificationPath ?? target.path) === true,
    }));
  };

  return {
    classifyPaths,
  };
};

export type GitPathSnapshotResolver = ReturnType<typeof createGitPathSnapshotResolver>;

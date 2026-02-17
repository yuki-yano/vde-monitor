import type { ApiError } from "@vde-monitor/shared";
import type { TmuxAdapter } from "@vde-monitor/tmux";
import { execa } from "execa";

import { buildError } from "../errors";
import { resolveVwWorktreeSnapshotCached } from "../monitor/vw-worktree";
import { normalizeAbsolutePath } from "../path-normalization";
import { normalizeOptionalText } from "./launch-validation";

const normalizePathValue = (value: string): string => {
  const normalized = normalizeAbsolutePath(value);
  if (normalized) {
    return normalized;
  }
  return normalizeAbsolutePath(process.cwd()) ?? process.cwd();
};

export const resolveSessionSnapshotCwd = async ({
  adapter,
  sessionName,
}: {
  adapter: TmuxAdapter;
  sessionName: string;
}): Promise<{ ok: true; cwd: string } | { ok: false; error: ApiError }> => {
  const listed = await adapter.run([
    "list-panes",
    "-t",
    sessionName,
    "-F",
    "#{pane_current_path}",
  ]);
  if (listed.exitCode !== 0) {
    return {
      ok: false,
      error: buildError("INTERNAL", listed.stderr || "failed to inspect session pane cwd"),
    };
  }
  const firstPath =
    listed.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? null;
  if (!firstPath) {
    return {
      ok: false,
      error: buildError("INVALID_PAYLOAD", "failed to resolve session current path"),
    };
  }
  return { ok: true, cwd: firstPath };
};

type ResolveWorktreeCwdInput = {
  adapter: TmuxAdapter;
  sessionName: string;
  worktreePath?: string;
  worktreeBranch?: string;
  worktreeCreateIfMissing: boolean;
};

export const resolveWorktreeCwd = async ({
  adapter,
  sessionName,
  worktreePath,
  worktreeBranch,
  worktreeCreateIfMissing,
}: ResolveWorktreeCwdInput): Promise<{ ok: true; cwd?: string } | { ok: false; error: ApiError }> => {
  if (!worktreePath && !worktreeBranch && !worktreeCreateIfMissing) {
    return { ok: true, cwd: undefined };
  }

  const snapshotCwd = await resolveSessionSnapshotCwd({ adapter, sessionName });
  if (!snapshotCwd.ok) {
    return snapshotCwd;
  }

  const snapshot = await resolveVwWorktreeSnapshotCached(snapshotCwd.cwd, { ghMode: "never" });
  if (!snapshot) {
    return {
      ok: false,
      error: buildError("INVALID_PAYLOAD", "vw worktree snapshot is unavailable"),
    };
  }

  const normalizedPath = worktreePath ? normalizePathValue(worktreePath) : undefined;
  const matchedByPath = normalizedPath
    ? (snapshot.entries.find((entry) => normalizePathValue(entry.path) === normalizedPath) ?? null)
    : null;
  if (normalizedPath && !matchedByPath) {
    return {
      ok: false,
      error: buildError("INVALID_PAYLOAD", `worktree path not found: ${normalizedPath}`),
    };
  }

  const matchedByBranch = worktreeBranch
    ? (snapshot.entries.find((entry) => entry.branch === worktreeBranch) ?? null)
    : null;
  if (worktreeBranch && !matchedByBranch && !worktreeCreateIfMissing) {
    return {
      ok: false,
      error: buildError("INVALID_PAYLOAD", `worktree branch not found: ${worktreeBranch}`),
    };
  }

  if (matchedByPath && matchedByBranch && matchedByPath.path !== matchedByBranch.path) {
    return {
      ok: false,
      error: buildError(
        "INVALID_PAYLOAD",
        "worktreePath and worktreeBranch resolved to different worktrees",
      ),
    };
  }

  if (worktreeBranch && !matchedByBranch && worktreeCreateIfMissing) {
    const repoRoot = snapshot.repoRoot ? normalizePathValue(snapshot.repoRoot) : null;
    if (!repoRoot) {
      return {
        ok: false,
        error: buildError("INVALID_PAYLOAD", "repo root is unavailable for vw worktree creation"),
      };
    }

    const currentBranch = await execa("vw", ["branch", "--show-current"], {
      cwd: repoRoot,
      reject: false,
      timeout: 5000,
      maxBuffer: 2_000_000,
    });
    const previousBranch =
      currentBranch.exitCode === 0 ? normalizeOptionalText(currentBranch.stdout) : undefined;
    const rollbackSwitchedBranch = async () => {
      if (!previousBranch || previousBranch === worktreeBranch) {
        return;
      }
      await execa("vw", ["switch", previousBranch], {
        cwd: repoRoot,
        reject: false,
        timeout: 15_000,
        maxBuffer: 2_000_000,
      });
    };

    const switched = await execa("vw", ["switch", worktreeBranch], {
      cwd: repoRoot,
      reject: false,
      timeout: 15_000,
      maxBuffer: 2_000_000,
    });
    if (switched.exitCode !== 0) {
      const message = (switched.stderr || switched.stdout || "vw switch failed").trim();
      return {
        ok: false,
        error: buildError("INVALID_PAYLOAD", `vw switch failed: ${message}`),
      };
    }

    const resolvedPath = await execa("vw", ["path", worktreeBranch], {
      cwd: repoRoot,
      reject: false,
      timeout: 5000,
      maxBuffer: 2_000_000,
    });
    if (resolvedPath.exitCode !== 0) {
      await rollbackSwitchedBranch();
      const message = (resolvedPath.stderr || resolvedPath.stdout || "vw path failed").trim();
      return {
        ok: false,
        error: buildError("INVALID_PAYLOAD", `vw path failed: ${message}`),
      };
    }

    const nextCwd = normalizeOptionalText(resolvedPath.stdout);
    if (!nextCwd) {
      await rollbackSwitchedBranch();
      return {
        ok: false,
        error: buildError("INVALID_PAYLOAD", "vw path returned an empty path"),
      };
    }
    return { ok: true, cwd: normalizePathValue(nextCwd) };
  }

  const resolvedCwd = matchedByPath?.path ?? matchedByBranch?.path;
  return { ok: true, cwd: resolvedCwd };
};

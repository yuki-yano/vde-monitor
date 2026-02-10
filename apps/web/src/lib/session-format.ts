import { isEditorCommand as isSharedEditorCommand } from "@vde-monitor/shared";

export const stateTone = (state: string) => {
  switch (state) {
    case "RUNNING":
      return "running";
    case "WAITING_INPUT":
      return "waiting";
    case "WAITING_PERMISSION":
      return "permission";
    case "SHELL":
      return "shell";
    default:
      return "unknown";
  }
};

export const isEditorCommand = (command: string | null | undefined) => {
  return isSharedEditorCommand(command);
};

export const formatStateLabel = (state: string) => {
  switch (state) {
    case "WAITING_INPUT":
      return "WAITING";
    case "WAITING_PERMISSION":
      return "PERMISSION";
    default:
      return state.replace(/_/g, " ");
  }
};

export const agentToneFor = (agent: string | null | undefined) => {
  switch (agent) {
    case "codex":
      return "codex" as const;
    case "claude":
      return "claude" as const;
    default:
      return "unknown" as const;
  }
};

export const isKnownAgent = (agent: string | null | undefined) =>
  agent === "codex" || agent === "claude";

export const agentLabelFor = (agent: string | null | undefined) => {
  switch (agent) {
    case "codex":
      return "CODEX";
    case "claude":
      return "CLAUDE";
    default:
      return "UNKNOWN";
  }
};

export const formatPath = (value: string | null) => {
  if (!value) return "—";
  const match = value.match(/^\/(Users|home)\/[^/]+(\/.*)?$/);
  if (match) {
    return `~${match[2] ?? ""}`;
  }
  return value;
};

export const formatBranchLabel = (value: string | null | undefined) => {
  if (!value) return "No branch";
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "No branch";
};

export const formatWorktreeFlag = (value: boolean | null | undefined) => {
  if (value == null) return "?";
  return value ? "Y" : "N";
};

export type WorktreeFlagKind = "dirty" | "locked" | "pr" | "merged";

const WORKTREE_FLAG_CLASS_MAP: Record<WorktreeFlagKind, string> = {
  dirty: "border-latte-red/45 bg-latte-red/10 text-latte-red font-mono",
  locked: "border-latte-yellow/45 bg-latte-yellow/10 text-latte-yellow font-mono",
  pr: "border-latte-green/45 bg-latte-green/10 text-latte-green font-mono",
  merged: "border-latte-blue/45 bg-latte-blue/10 text-latte-blue font-mono",
};

export const worktreeFlagClass = (kind: WorktreeFlagKind, value: boolean | null | undefined) => {
  if (value !== true) {
    return "font-mono";
  }
  return WORKTREE_FLAG_CLASS_MAP[kind] ?? "font-mono";
};

const vwWorktreeSegmentPattern = /(^|[\\/])\.worktree([\\/]|$)/;

export const isVwManagedWorktreePath = (value: string | null | undefined) => {
  if (!value) {
    return false;
  }
  return vwWorktreeSegmentPattern.test(value.trim());
};

export const formatRelativeTime = (value: string | null, nowMs: number) => {
  if (!value) return "-";
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return "-";
  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d ago`;
};

export type LastInputTone = {
  pill: string;
  dot: string;
};

export const getLastInputTone = (value: string | null, nowMs: number): LastInputTone => {
  if (!value) {
    return {
      pill: "border-latte-surface2/70 bg-latte-crust/60 text-latte-subtext0",
      dot: "bg-latte-subtext0",
    };
  }
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) {
    return {
      pill: "border-latte-surface2/70 bg-latte-crust/60 text-latte-subtext0",
      dot: "bg-latte-subtext0",
    };
  }
  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSec < 300) {
    return {
      pill: "border-latte-green/40 bg-latte-green/10 text-latte-green",
      dot: "bg-latte-green shadow-[0_0_8px_rgba(64,160,43,0.6)]",
    };
  }
  if (diffSec < 1800) {
    return {
      pill: "border-latte-yellow/40 bg-latte-yellow/10 text-latte-yellow",
      dot: "bg-latte-yellow shadow-[0_0_8px_rgba(223,142,29,0.6)]",
    };
  }
  if (diffSec < 7200) {
    return {
      pill: "border-latte-peach/40 bg-latte-peach/10 text-latte-peach",
      dot: "bg-latte-peach shadow-[0_0_8px_rgba(239,159,118,0.6)]",
    };
  }
  return {
    pill: "border-latte-red/40 bg-latte-red/10 text-latte-red",
    dot: "bg-latte-red shadow-[0_0_8px_rgba(210,15,57,0.6)]",
  };
};

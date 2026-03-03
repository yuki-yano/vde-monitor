import type { SessionDetail } from "@vde-monitor/shared";

import type { AgentType } from "./agent-resolver-utils";
import { hostCandidates, normalizeTitle } from "./monitor-utils";

export type PaneSnapshot = {
  paneId: string;
  sessionName: string;
  windowIndex: number;
  paneIndex: number;
  windowActivity: number | null;
  paneActive: boolean;
  currentCommand: string | null;
  currentPath: string | null;
  paneTty: string | null;
  paneTitle: string | null;
  paneStartCommand: string | null;
  panePid: number | null;
  paneDead: boolean;
  alternateOn: boolean;
};

const hostCandidatesNormalized = new Set(
  [...hostCandidates].map((candidate) => candidate.toLowerCase()),
);

const resolveSessionTitle = (paneTitle: string | null) => {
  const normalized = normalizeTitle(paneTitle);
  if (!normalized || hostCandidatesNormalized.has(normalized.toLowerCase())) {
    return null;
  }
  return normalized;
};

type BuildSessionDetailArgs = {
  pane: PaneSnapshot;
  agent: AgentType;
  state: SessionDetail["state"];
  stateReason: string;
  lastMessage: string | null;
  lastOutputAt: string | null;
  lastEventAt: string | null;
  lastInputAt: string | null;
  agentSessionId?: string | null;
  agentSessionSource?: "hook" | "lsof" | "history" | null;
  agentSessionConfidence?: "high" | "medium" | "low" | null;
  agentSessionObservedAt?: string | null;
  pipeAttached: boolean;
  pipeConflict: boolean;
  customTitle: string | null;
  repoRoot: string | null;
  branch?: string | null;
  worktreePath?: string | null;
  worktreeDirty?: boolean | null;
  worktreeLocked?: boolean | null;
  worktreeLockOwner?: string | null;
  worktreeLockReason?: string | null;
  worktreeMerged?: boolean | null;
};

export const buildSessionDetail = ({
  pane,
  agent,
  state,
  stateReason,
  lastMessage,
  lastOutputAt,
  lastEventAt,
  lastInputAt,
  agentSessionId,
  agentSessionSource,
  agentSessionConfidence,
  agentSessionObservedAt,
  pipeAttached,
  pipeConflict,
  customTitle,
  repoRoot,
  branch,
  worktreePath,
  worktreeDirty,
  worktreeLocked,
  worktreeLockOwner,
  worktreeLockReason,
  worktreeMerged,
}: BuildSessionDetailArgs): SessionDetail => ({
  paneId: pane.paneId,
  sessionName: pane.sessionName,
  windowIndex: pane.windowIndex,
  paneIndex: pane.paneIndex,
  windowActivity: pane.windowActivity,
  paneActive: pane.paneActive,
  currentCommand: pane.currentCommand,
  currentPath: pane.currentPath,
  paneTty: pane.paneTty,
  title: resolveSessionTitle(pane.paneTitle),
  customTitle,
  branch: branch ?? null,
  worktreePath: worktreePath ?? null,
  worktreeDirty: worktreeDirty ?? null,
  worktreeLocked: worktreeLocked ?? null,
  worktreeLockOwner: worktreeLockOwner ?? null,
  worktreeLockReason: worktreeLockReason ?? null,
  worktreeMerged: worktreeMerged ?? null,
  repoRoot,
  agent,
  state,
  stateReason,
  lastMessage,
  lastOutputAt,
  lastEventAt,
  lastInputAt,
  agentSessionId: agentSessionId ?? null,
  agentSessionSource: agentSessionSource ?? null,
  agentSessionConfidence: agentSessionConfidence ?? null,
  agentSessionObservedAt: agentSessionObservedAt ?? null,
  paneDead: pane.paneDead,
  alternateOn: pane.alternateOn,
  pipeAttached,
  pipeConflict,
  startCommand: pane.paneStartCommand,
  panePid: pane.panePid,
});

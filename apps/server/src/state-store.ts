import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
  RepoNote,
  SessionDetail,
  SessionStateTimelineSource,
  SessionStateValue,
} from "@vde-monitor/shared";

import type { PersistedRepoNotesRecord } from "./repo-notes/store";

export type PersistedLifecycle = Exclude<SessionStateValue, "DONE">;

export type PersistedAgentIdentity = "codex" | "claude" | "unknown";

export type PersistedCompletionCursor = {
  epoch: string;
  paneInstanceKey: string | null;
  agent: "codex" | "claude";
  agentSessionId: string | null;
  identityConfirmedAt: string | null;
  agentPresent: boolean;
  syntheticCompletionArmed: boolean;
  consecutiveAbsentObservations: number;
  runSeq: number;
  openRunSeq: number | null;
  completedSeq: number;
  acknowledgedSeq: number;
};

export type PersistedSessionRuntimeState = {
  lifecycle: PersistedLifecycle;
  completionCursor: PersistedCompletionCursor | null;
  lastAgent: PersistedAgentIdentity;
  lastRunStartedRunId: string | null;
};

export type PersistedSession = {
  paneId: string;
  lastOutputAt: string | null;
  lastEventAt: string | null;
  lastMessage: string | null;
  lastInputAt: string | null;
  lastRunStartedAt?: string | null;
  lastRunStartedAtVerified?: boolean;
  lastRunStartedRunId?: string | null;
  manualSortAt?: string | null;
  agentSessionId?: string | null;
  agentSessionSource?: "hook" | "lsof" | "history" | null;
  agentSessionConfidence?: "high" | "medium" | "low" | null;
  agentSessionObservedAt?: string | null;
  customTitle: string | null;
  lifecycle: PersistedLifecycle;
  completionCursor: PersistedCompletionCursor | null;
  lastAgent: PersistedAgentIdentity;
  stateReason: string;
  repoRoot?: string | null;
};

export type PersistedTimelineState = SessionStateValue | "DONE";
export type PersistedTimelineSource = SessionStateTimelineSource | "view";

export type PersistedTimelineEvent = {
  id: string;
  paneId: string;
  state: PersistedTimelineState;
  reason: string;
  repoRoot?: string | null;
  startedAt: string;
  endedAt: string | null;
  source: PersistedTimelineSource;
};

type PersistedTimelineRecord = Record<string, PersistedTimelineEvent[]>;

type PersistedState = {
  version: 3;
  savedAt: string;
  sessions: Record<string, unknown>;
  timeline: Record<string, unknown>;
  repoNotes?: Record<string, unknown>;
  repositoryActivity?: unknown;
};

const getStatePath = () => {
  return path.join(os.homedir(), ".vde-monitor", "state.json");
};

const loadState = (): PersistedState | null => {
  let raw: string;
  try {
    raw = fs.readFileSync(getStatePath(), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw new Error(`failed to read persisted state: ${getStatePath()}`, { cause: error });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(`persisted state is corrupt: invalid JSON in ${getStatePath()}`, {
      cause: error,
    });
  }
  if (!isPersistedState(parsed)) {
    throw new Error(`persisted state is corrupt: invalid schema in ${getStatePath()}`);
  }
  return parsed;
};

export type SaveStateOptions = {
  runtimeStateByPaneId: ReadonlyMap<string, PersistedSessionRuntimeState>;
  retainedSessions?: ReadonlyMap<string, PersistedSession>;
  timeline?: PersistedTimelineRecord;
  repoNotes?: PersistedRepoNotesRecord;
  repositoryActivity?: unknown;
  skipIfContentKey?: string | null;
};

export type SaveStateResult = {
  written: boolean;
  contentKey: string;
};

const isLifecycle = (value: unknown): value is PersistedLifecycle =>
  value === "RUNNING" ||
  value === "WAITING_INPUT" ||
  value === "WAITING_PERMISSION" ||
  value === "SHELL" ||
  value === "UNKNOWN";

const isTimelineState = (value: unknown): value is PersistedTimelineState =>
  isLifecycle(value) || value === "DONE";

const isTimelineSource = (value: unknown): value is PersistedTimelineSource =>
  value === "poll" || value === "hook" || value === "restore" || value === "view";

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const isOptionalNullableString = (value: unknown): value is string | null | undefined =>
  value == null || typeof value === "string";

const isNullableTimestamp = (value: unknown): value is string | null =>
  value === null || (typeof value === "string" && !Number.isNaN(Date.parse(value)));

const isNonNegativeSafeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isPersistedAgentIdentity = (value: unknown): value is PersistedAgentIdentity =>
  value === "codex" || value === "claude" || value === "unknown";

const isPersistedCompletionCursor = (value: unknown): value is PersistedCompletionCursor => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const cursor = value as Partial<PersistedCompletionCursor>;
  if (
    typeof cursor.epoch !== "string" ||
    cursor.epoch.length === 0 ||
    !isNullableString(cursor.paneInstanceKey) ||
    (cursor.agent !== "codex" && cursor.agent !== "claude") ||
    !isNullableString(cursor.agentSessionId) ||
    !isNullableTimestamp(cursor.identityConfirmedAt) ||
    typeof cursor.agentPresent !== "boolean" ||
    typeof cursor.syntheticCompletionArmed !== "boolean" ||
    !isNonNegativeSafeInteger(cursor.consecutiveAbsentObservations) ||
    !isNonNegativeSafeInteger(cursor.runSeq) ||
    !isNonNegativeSafeInteger(cursor.completedSeq) ||
    !isNonNegativeSafeInteger(cursor.acknowledgedSeq) ||
    (cursor.openRunSeq != null && !isNonNegativeSafeInteger(cursor.openRunSeq))
  ) {
    return false;
  }
  if (
    cursor.acknowledgedSeq > cursor.completedSeq ||
    cursor.completedSeq > cursor.runSeq ||
    (cursor.openRunSeq != null && cursor.openRunSeq !== cursor.runSeq)
  ) {
    return false;
  }
  return (
    !cursor.syntheticCompletionArmed ||
    (cursor.runSeq === 0 && cursor.openRunSeq == null && cursor.completedSeq === 0)
  );
};

const isPersistedSession = (value: unknown): value is PersistedSession => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const session = value as Partial<PersistedSession>;
  return (
    typeof session.paneId === "string" &&
    isNullableString(session.lastOutputAt) &&
    isNullableString(session.lastEventAt) &&
    isNullableString(session.lastMessage) &&
    isNullableString(session.lastInputAt) &&
    isOptionalNullableString(session.lastRunStartedAt) &&
    (session.lastRunStartedAtVerified == null ||
      typeof session.lastRunStartedAtVerified === "boolean") &&
    isOptionalNullableString(session.lastRunStartedRunId) &&
    isOptionalNullableString(session.manualSortAt) &&
    isOptionalNullableString(session.agentSessionId) &&
    (session.agentSessionSource == null ||
      session.agentSessionSource === "hook" ||
      session.agentSessionSource === "lsof" ||
      session.agentSessionSource === "history") &&
    (session.agentSessionConfidence == null ||
      session.agentSessionConfidence === "high" ||
      session.agentSessionConfidence === "medium" ||
      session.agentSessionConfidence === "low") &&
    isOptionalNullableString(session.agentSessionObservedAt) &&
    isNullableString(session.customTitle) &&
    isLifecycle(session.lifecycle) &&
    (session.completionCursor == null || isPersistedCompletionCursor(session.completionCursor)) &&
    isPersistedAgentIdentity(session.lastAgent) &&
    typeof session.stateReason === "string" &&
    isOptionalNullableString(session.repoRoot)
  );
};

const isPersistedTimelineEvent = (value: unknown): value is PersistedTimelineEvent => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const event = value as Partial<PersistedTimelineEvent>;
  return (
    typeof event.id === "string" &&
    typeof event.paneId === "string" &&
    isTimelineState(event.state) &&
    typeof event.reason === "string" &&
    (event.repoRoot == null || typeof event.repoRoot === "string") &&
    typeof event.startedAt === "string" &&
    (event.endedAt == null || typeof event.endedAt === "string") &&
    isTimelineSource(event.source)
  );
};

const isPersistedRepoNote = (value: unknown): value is RepoNote => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const note = value as Partial<RepoNote>;
  return (
    typeof note.id === "string" &&
    typeof note.repoRoot === "string" &&
    (note.title == null || typeof note.title === "string") &&
    typeof note.body === "string" &&
    typeof note.createdAt === "string" &&
    typeof note.updatedAt === "string"
  );
};

const isPersistedState = (value: unknown): value is PersistedState => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const state = value as Partial<PersistedState>;
  if (
    state.version !== 3 ||
    !isNullableTimestamp(state.savedAt) ||
    state.savedAt == null ||
    !isRecord(state.sessions) ||
    !isRecord(state.timeline) ||
    (state.repoNotes != null && !isRecord(state.repoNotes))
  ) {
    return false;
  }
  const sessionsValid = Object.entries(state.sessions).every(
    ([paneId, session]) => isPersistedSession(session) && session.paneId === paneId,
  );
  const timelineValid = Object.entries(state.timeline).every(
    ([paneId, events]) =>
      Array.isArray(events) &&
      events.every((event) => isPersistedTimelineEvent(event) && event.paneId === paneId),
  );
  const repoNotesValid = Object.entries(state.repoNotes ?? {}).every(
    ([repoRoot, notes]) =>
      Array.isArray(notes) &&
      notes.every((note) => isPersistedRepoNote(note) && note.repoRoot === repoRoot),
  );
  return sessionsValid && timelineValid && repoNotesValid;
};

export const saveState = (
  sessions: SessionDetail[],
  options: SaveStateOptions,
): SaveStateResult => {
  const retainedSessions = Object.fromEntries(
    [...(options.retainedSessions ?? [])].map(([paneId, session]) => [
      paneId,
      {
        ...session,
        lastRunStartedAt:
          session.lastRunStartedAtVerified === true && session.lastRunStartedRunId != null
            ? (session.lastRunStartedAt ?? null)
            : null,
        lastRunStartedAtVerified:
          session.lastRunStartedAtVerified === true &&
          session.lastRunStartedAt != null &&
          session.lastRunStartedRunId != null,
        lastRunStartedRunId:
          session.lastRunStartedAtVerified === true && session.lastRunStartedAt != null
            ? (session.lastRunStartedRunId ?? null)
            : null,
        manualSortAt: session.manualSortAt ?? null,
      },
    ]),
  );
  const committedSessions = Object.fromEntries(
    sessions.map((session) => {
      const runtimeState = options.runtimeStateByPaneId.get(session.paneId);
      if (runtimeState == null) {
        throw new Error(`missing persisted runtime state for pane ${session.paneId}`);
      }
      return [
        session.paneId,
        {
          paneId: session.paneId,
          lastOutputAt: session.lastOutputAt,
          lastEventAt: session.lastEventAt,
          lastMessage: session.lastMessage,
          lastInputAt: session.lastInputAt,
          lastRunStartedAt:
            runtimeState.lastRunStartedRunId != null ? session.lastRunStartedAt : null,
          lastRunStartedAtVerified:
            session.lastRunStartedAt != null && runtimeState.lastRunStartedRunId != null,
          lastRunStartedRunId: runtimeState.lastRunStartedRunId,
          manualSortAt: session.manualSortAt,
          agentSessionId: session.agentSessionId ?? null,
          agentSessionSource: session.agentSessionSource ?? null,
          agentSessionConfidence: session.agentSessionConfidence ?? null,
          agentSessionObservedAt: session.agentSessionObservedAt ?? null,
          customTitle: session.customTitle ?? null,
          lifecycle: runtimeState.lifecycle,
          completionCursor: runtimeState.completionCursor,
          lastAgent: runtimeState.lastAgent,
          stateReason: session.stateReason,
          repoRoot: session.repoRoot ?? null,
        },
      ];
    }),
  );
  // Timestamps that change on every serialization are excluded from the
  // content key so unchanged state can be detected and skipped by callers
  // that persist on a fixed cadence. The written file still carries them.
  const content = {
    version: 3 as const,
    sessions: {
      ...retainedSessions,
      ...committedSessions,
    },
    timeline: options.timeline ?? {},
    repoNotes: options.repoNotes ?? {},
    repositoryActivity: options.repositoryActivity,
  };
  // repositoryActivity.serialize() stamps a fresh savedAt on every call, so
  // the key must ignore it or unchanged state would never match.
  const stableRepositoryActivity =
    isRecord(content.repositoryActivity) && "savedAt" in content.repositoryActivity
      ? { ...content.repositoryActivity, savedAt: null }
      : content.repositoryActivity;
  const contentKey = JSON.stringify({
    ...content,
    repositoryActivity: stableRepositoryActivity,
  });
  if (options.skipIfContentKey != null && options.skipIfContentKey === contentKey) {
    return { written: false, contentKey };
  }
  const data: PersistedState = {
    version: content.version,
    savedAt: new Date().toISOString(),
    sessions: content.sessions,
    timeline: content.timeline,
    repoNotes: content.repoNotes,
    repositoryActivity: content.repositoryActivity,
  };
  if (!isPersistedState(data)) {
    throw new Error("refusing to persist invalid state");
  }
  const dir = path.dirname(getStatePath());
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const statePath = getStatePath();
  const temporaryPath = path.join(dir, `.state.json.${process.pid}.${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    const temporaryFd = fs.openSync(temporaryPath, "r+");
    try {
      fs.fsyncSync(temporaryFd);
    } finally {
      fs.closeSync(temporaryFd);
    }
    fs.renameSync(temporaryPath, statePath);
  } catch (error) {
    try {
      fs.unlinkSync(temporaryPath);
    } catch {
      // The temporary file may not have been created or may already have been renamed.
    }
    throw error;
  }
  return { written: true, contentKey };
};

export type PersistedSessionMap = Map<string, PersistedSession>;
export type PersistedTimelineMap = Map<string, PersistedTimelineEvent[]>;
export type PersistedRepoNotesMap = Map<string, RepoNote[]>;

export type RestoredPersistedState = {
  sessions: PersistedSessionMap;
  timeline: PersistedTimelineMap;
  repoNotes: PersistedRepoNotesMap;
  repositoryActivity: unknown;
};

const restorePersistedSessionMap = (state: PersistedState | null): PersistedSessionMap => {
  if (!state) {
    return new Map();
  }
  const entries = Object.entries(state.sessions).filter(
    (entry): entry is [string, PersistedSession] =>
      isPersistedSession(entry[1]) && entry[0] === entry[1].paneId,
  );
  return new Map(
    entries.map(([paneId, session]) => [
      paneId,
      {
        ...session,
        lastRunStartedAt:
          session.lastRunStartedAtVerified === true && session.lastRunStartedRunId != null
            ? (session.lastRunStartedAt ?? null)
            : null,
        lastRunStartedAtVerified:
          session.lastRunStartedAtVerified === true &&
          session.lastRunStartedAt != null &&
          session.lastRunStartedRunId != null,
        lastRunStartedRunId:
          session.lastRunStartedAtVerified === true && session.lastRunStartedAt != null
            ? (session.lastRunStartedRunId ?? null)
            : null,
      },
    ]),
  );
};

const restorePersistedTimelineMap = (state: PersistedState | null): PersistedTimelineMap => {
  if (!state) {
    return new Map();
  }
  const entries = Object.entries(state.timeline ?? {})
    .map(([paneId, events]) => {
      if (!Array.isArray(events)) {
        return [paneId, [] as PersistedTimelineEvent[]] as const;
      }
      return [paneId, events.filter(isPersistedTimelineEvent)] as const;
    })
    .filter(([, events]) => events.length > 0);
  return new Map(entries);
};

const restorePersistedRepoNotesMap = (state: PersistedState | null): PersistedRepoNotesMap => {
  if (!state) {
    return new Map();
  }
  const entries = Object.entries(state.repoNotes ?? {})
    .map(([repoRoot, notes]) => {
      if (!Array.isArray(notes)) {
        return [repoRoot, [] as RepoNote[]] as const;
      }
      return [repoRoot, notes.filter(isPersistedRepoNote)] as const;
    })
    .filter(([, notes]) => notes.length > 0);
  return new Map(entries);
};

export const restorePersistedState = (): RestoredPersistedState => {
  const state = loadState();
  return {
    sessions: restorePersistedSessionMap(state),
    timeline: restorePersistedTimelineMap(state),
    repoNotes: restorePersistedRepoNotesMap(state),
    repositoryActivity: state?.repositoryActivity,
  };
};

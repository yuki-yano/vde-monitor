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

type PersistedSession = {
  paneId: string;
  lastOutputAt: string | null;
  lastEventAt: string | null;
  lastMessage: string | null;
  lastInputAt: string | null;
  customTitle: string | null;
  state: SessionStateValue;
  stateReason: string;
};

export type PersistedTimelineEvent = {
  id: string;
  paneId: string;
  state: SessionStateValue;
  reason: string;
  startedAt: string;
  endedAt: string | null;
  source: SessionStateTimelineSource;
};

type PersistedTimelineRecord = Record<string, PersistedTimelineEvent[]>;

type PersistedState = {
  version: 2;
  savedAt: string;
  sessions: Record<string, PersistedSession>;
  timeline: PersistedTimelineRecord;
  repoNotes?: PersistedRepoNotesRecord;
};

const getStatePath = () => {
  return path.join(os.homedir(), ".vde-monitor", "state.json");
};

const loadState = (): PersistedState | null => {
  try {
    const raw = fs.readFileSync(getStatePath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return isPersistedState(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

type SaveStateOptions = {
  timeline?: PersistedTimelineRecord;
  repoNotes?: PersistedRepoNotesRecord;
};

const isStateValue = (value: unknown): value is SessionStateValue =>
  value === "RUNNING" ||
  value === "WAITING_INPUT" ||
  value === "WAITING_PERMISSION" ||
  value === "SHELL" ||
  value === "UNKNOWN";

const isTimelineSource = (value: unknown): value is SessionStateTimelineSource =>
  value === "poll" || value === "hook" || value === "restore";

const isPersistedTimelineEvent = (value: unknown): value is PersistedTimelineEvent => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const event = value as Partial<PersistedTimelineEvent>;
  return (
    typeof event.id === "string" &&
    typeof event.paneId === "string" &&
    isStateValue(event.state) &&
    typeof event.reason === "string" &&
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
  return (
    state.version === 2 &&
    typeof state.savedAt === "string" &&
    Boolean(state.sessions) &&
    typeof state.sessions === "object" &&
    Boolean(state.timeline) &&
    typeof state.timeline === "object"
  );
};

export const saveState = (sessions: SessionDetail[], options: SaveStateOptions = {}) => {
  const data: PersistedState = {
    version: 2,
    savedAt: new Date().toISOString(),
    sessions: Object.fromEntries(
      sessions.map((session) => [
        session.paneId,
        {
          paneId: session.paneId,
          lastOutputAt: session.lastOutputAt,
          lastEventAt: session.lastEventAt,
          lastMessage: session.lastMessage,
          lastInputAt: session.lastInputAt,
          customTitle: session.customTitle ?? null,
          state: session.state,
          stateReason: session.stateReason,
        },
      ]),
    ),
    timeline: options.timeline ?? {},
    repoNotes: options.repoNotes ?? {},
  };
  const dir = path.dirname(getStatePath());
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(getStatePath(), `${JSON.stringify(data, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
};

export type PersistedSessionMap = Map<string, PersistedSession>;
export type PersistedTimelineMap = Map<string, PersistedTimelineEvent[]>;
export type PersistedRepoNotesMap = Map<string, RepoNote[]>;

export type RestoredPersistedState = {
  sessions: PersistedSessionMap;
  timeline: PersistedTimelineMap;
  repoNotes: PersistedRepoNotesMap;
};

const restorePersistedSessionMap = (state: PersistedState | null): PersistedSessionMap => {
  if (!state) {
    return new Map();
  }
  return new Map(Object.entries(state.sessions)) as PersistedSessionMap;
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
  };
};

export const restoreSessions = () => {
  return restorePersistedState().sessions;
};

export const restoreTimeline = (): PersistedTimelineMap => {
  return restorePersistedState().timeline;
};

export const restoreRepoNotes = (): PersistedRepoNotesMap => {
  return restorePersistedState().repoNotes;
};

import type {
  AllowedKey,
  ClientFileNavigatorConfig,
  CommandResponse,
  CommitDetail,
  CommitFileDiff,
  CommitLog,
  DiffFile,
  DiffSummary,
  HighlightCorrectionConfig,
  ImageAttachment,
  LaunchCommandResponse,
  LaunchConfig,
  RawItem,
  RepoFileContent,
  RepoFileSearchPage,
  RepoFileTreePage,
  RepoNote,
  ScreenResponse,
  SessionStateTimeline,
  SessionStateTimelineRange,
  SessionStateTimelineScope,
  WorkspaceTabsDisplayMode,
  WorktreeList,
} from "@vde-monitor/shared";
import { atom } from "jotai";

import { defaultLaunchConfig, type LaunchAgentRequestOptions } from "./launch-agent-options";

export type SessionConnectionStatus = "healthy" | "degraded" | "disconnected";

type SessionApi = {
  reconnect: () => void;
  refreshSessions: () => Promise<void>;
  requestWorktrees: (paneId: string) => Promise<WorktreeList>;
  requestDiffSummary: (
    paneId: string,
    options?: { force?: boolean; worktreePath?: string },
  ) => Promise<DiffSummary>;
  requestDiffFile: (
    paneId: string,
    path: string,
    rev?: string | null,
    options?: { force?: boolean; worktreePath?: string },
  ) => Promise<DiffFile>;
  requestCommitLog: (
    paneId: string,
    options?: { limit?: number; skip?: number; force?: boolean; worktreePath?: string },
  ) => Promise<CommitLog>;
  requestCommitDetail: (
    paneId: string,
    hash: string,
    options?: { force?: boolean; worktreePath?: string },
  ) => Promise<CommitDetail>;
  requestCommitFile: (
    paneId: string,
    hash: string,
    path: string,
    options?: { force?: boolean; worktreePath?: string },
  ) => Promise<CommitFileDiff>;
  requestStateTimeline: (
    paneId: string,
    options?: {
      scope?: SessionStateTimelineScope;
      range?: SessionStateTimelineRange;
      limit?: number;
    },
  ) => Promise<SessionStateTimeline>;
  requestRepoNotes: (paneId: string) => Promise<RepoNote[]>;
  requestRepoFileTree: (
    paneId: string,
    options?: { path?: string; cursor?: string; limit?: number; worktreePath?: string },
  ) => Promise<RepoFileTreePage>;
  requestRepoFileSearch: (
    paneId: string,
    query: string,
    options?: { cursor?: string; limit?: number; worktreePath?: string },
  ) => Promise<RepoFileSearchPage>;
  requestRepoFileContent: (
    paneId: string,
    path: string,
    options?: { maxBytes?: number; worktreePath?: string },
  ) => Promise<RepoFileContent>;
  requestScreen: (
    paneId: string,
    options: { lines?: number; mode?: "text" | "image"; cursor?: string },
  ) => Promise<ScreenResponse>;
  focusPane: (paneId: string) => Promise<CommandResponse>;
  killPane: (paneId: string) => Promise<CommandResponse>;
  killWindow: (paneId: string) => Promise<CommandResponse>;
  launchAgentInSession: (
    sessionName: string,
    agent: "codex" | "claude",
    requestId: string,
    options?: LaunchAgentRequestOptions,
  ) => Promise<LaunchCommandResponse>;
  uploadImageAttachment: (paneId: string, file: File) => Promise<ImageAttachment>;
  sendText: (
    paneId: string,
    text: string,
    enter?: boolean,
    requestId?: string,
  ) => Promise<CommandResponse>;
  sendKeys: (paneId: string, keys: AllowedKey[]) => Promise<CommandResponse>;
  sendRaw: (paneId: string, items: RawItem[], unsafe?: boolean) => Promise<CommandResponse>;
  touchSession: (paneId: string) => Promise<void>;
  updateSessionTitle: (paneId: string, title: string | null) => Promise<void>;
  createRepoNote: (
    paneId: string,
    input: { title?: string | null; body: string },
  ) => Promise<RepoNote>;
  updateRepoNote: (
    paneId: string,
    noteId: string,
    input: { title?: string | null; body: string },
  ) => Promise<RepoNote>;
  deleteRepoNote: (paneId: string, noteId: string) => Promise<string>;
};

const missingSessionProviderError = () => new Error("SessionProvider is required");

const throwMissingSessionProvider = (): never => {
  throw missingSessionProviderError();
};

const rejectMissingSessionProvider = async <T>(): Promise<T> => {
  throw missingSessionProviderError();
};

export const sessionConnectedAtom = atom(false);
export const sessionHighlightCorrectionsAtom = atom<HighlightCorrectionConfig>({
  codex: true,
  claude: true,
});
export const sessionFileNavigatorConfigAtom = atom<ClientFileNavigatorConfig>({
  autoExpandMatchLimit: 100,
});
export const sessionWorkspaceTabsDisplayModeAtom = atom<WorkspaceTabsDisplayMode>("all");
export const sessionLaunchConfigAtom = atom<LaunchConfig>(defaultLaunchConfig);
export const sessionApiAtom = atom<SessionApi>({
  reconnect: throwMissingSessionProvider,
  refreshSessions: () => rejectMissingSessionProvider<void>(),
  requestWorktrees: () => rejectMissingSessionProvider<WorktreeList>(),
  requestDiffSummary: () => rejectMissingSessionProvider<DiffSummary>(),
  requestDiffFile: () => rejectMissingSessionProvider<DiffFile>(),
  requestCommitLog: () => rejectMissingSessionProvider<CommitLog>(),
  requestCommitDetail: () => rejectMissingSessionProvider<CommitDetail>(),
  requestCommitFile: () => rejectMissingSessionProvider<CommitFileDiff>(),
  requestStateTimeline: () => rejectMissingSessionProvider<SessionStateTimeline>(),
  requestRepoNotes: () => rejectMissingSessionProvider<RepoNote[]>(),
  requestRepoFileTree: () => rejectMissingSessionProvider<RepoFileTreePage>(),
  requestRepoFileSearch: () => rejectMissingSessionProvider<RepoFileSearchPage>(),
  requestRepoFileContent: () => rejectMissingSessionProvider<RepoFileContent>(),
  requestScreen: () => rejectMissingSessionProvider<ScreenResponse>(),
  focusPane: () => rejectMissingSessionProvider<CommandResponse>(),
  killPane: () => rejectMissingSessionProvider<CommandResponse>(),
  killWindow: () => rejectMissingSessionProvider<CommandResponse>(),
  launchAgentInSession: () => rejectMissingSessionProvider<LaunchCommandResponse>(),
  uploadImageAttachment: () => rejectMissingSessionProvider<ImageAttachment>(),
  sendText: () => rejectMissingSessionProvider<CommandResponse>(),
  sendKeys: () => rejectMissingSessionProvider<CommandResponse>(),
  sendRaw: () => rejectMissingSessionProvider<CommandResponse>(),
  touchSession: () => rejectMissingSessionProvider<void>(),
  updateSessionTitle: () => rejectMissingSessionProvider<void>(),
  createRepoNote: () => rejectMissingSessionProvider<RepoNote>(),
  updateRepoNote: () => rejectMissingSessionProvider<RepoNote>(),
  deleteRepoNote: () => rejectMissingSessionProvider<string>(),
});

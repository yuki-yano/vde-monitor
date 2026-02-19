import type {
  AllowedKey,
  RawItem,
  SessionStateTimelineRange,
  SessionStateTimelineScope,
} from "./types";

export type ApiClientRequestOptions<TRequestInit = unknown> = {
  init?: TRequestInit;
};

export type PaneParam = {
  paneId: string;
};

export type PaneHashParam = PaneParam & {
  hash: string;
};

export type NoteIdParam = PaneParam & {
  noteId: string;
};

export type ForceQuery = {
  force?: string;
  worktreePath?: string;
};

export type DiffFileQuery = ForceQuery & {
  path: string;
  rev?: string;
};

export type CommitLogQuery = ForceQuery & {
  limit?: string;
  skip?: string;
};

export type CommitFileQuery = ForceQuery & {
  path: string;
};

export type ScreenRequestJson = {
  mode?: "text" | "image";
  lines?: number;
  cursor?: string;
};

export type SendTextJson = {
  text: string;
  enter: boolean;
  requestId?: string;
};

export type SendKeysJson = {
  keys: AllowedKey[];
};

export type SendRawJson = {
  items: RawItem[];
  unsafe?: boolean;
};

export type LaunchAgentJson = {
  sessionName: string;
  agent: "codex" | "claude";
  requestId: string;
  windowName?: string;
  cwd?: string;
  agentOptions?: string[];
  worktreePath?: string;
  worktreeBranch?: string;
  worktreeCreateIfMissing?: boolean;
};

export type SessionTitleJson = {
  title: string | null;
};

export type UploadImageForm<TFile = unknown> = {
  image: TFile;
};

export type TimelineQuery = {
  scope?: SessionStateTimelineScope;
  range?: SessionStateTimelineRange;
  limit?: string;
};

export type RepoNotePayloadJson = {
  title: string | null;
  body: string;
};

export type RepoFileTreeQuery = {
  path?: string;
  cursor?: string;
  limit?: string;
  worktreePath?: string;
};

export type RepoFileSearchQuery = {
  q: string;
  cursor?: string;
  limit?: string;
  worktreePath?: string;
};

export type RepoFileContentQuery = {
  path: string;
  maxBytes?: string;
  worktreePath?: string;
};

type ApiRequest<TArgs, TRequestInit, TResponse> = (
  args: TArgs,
  options?: ApiClientRequestOptions<TRequestInit>,
) => Promise<TResponse>;

type ApiRootGetRequest<TRequestInit, TResponse> = (
  options?: ApiClientRequestOptions<TRequestInit>,
) => Promise<TResponse>;

type SessionApiClient<TRequestInit, TResponse, TFile> = {
  focus: { $post: ApiRequest<{ param: PaneParam }, TRequestInit, TResponse> };
  kill: {
    pane: { $post: ApiRequest<{ param: PaneParam }, TRequestInit, TResponse> };
    window: { $post: ApiRequest<{ param: PaneParam }, TRequestInit, TResponse> };
  };
  send: {
    text: { $post: ApiRequest<{ param: PaneParam; json: SendTextJson }, TRequestInit, TResponse> };
    keys: { $post: ApiRequest<{ param: PaneParam; json: SendKeysJson }, TRequestInit, TResponse> };
    raw: { $post: ApiRequest<{ param: PaneParam; json: SendRawJson }, TRequestInit, TResponse> };
  };
  title: {
    $put: ApiRequest<{ param: PaneParam; json: SessionTitleJson }, TRequestInit, TResponse>;
  };
  touch: { $post: ApiRequest<{ param: PaneParam }, TRequestInit, TResponse> };
  attachments: {
    image: {
      $post: ApiRequest<
        { param: PaneParam; form: UploadImageForm<TFile> },
        TRequestInit,
        TResponse
      >;
    };
  };
  screen: {
    $post: ApiRequest<{ param: PaneParam; json: ScreenRequestJson }, TRequestInit, TResponse>;
  };
  diff: {
    $get: ApiRequest<{ param: PaneParam; query: ForceQuery }, TRequestInit, TResponse>;
    file: { $get: ApiRequest<{ param: PaneParam; query: DiffFileQuery }, TRequestInit, TResponse> };
  };
  commits: {
    $get: ApiRequest<{ param: PaneParam; query: CommitLogQuery }, TRequestInit, TResponse>;
    ":hash": {
      $get: ApiRequest<{ param: PaneHashParam; query: ForceQuery }, TRequestInit, TResponse>;
      file: {
        $get: ApiRequest<{ param: PaneHashParam; query: CommitFileQuery }, TRequestInit, TResponse>;
      };
    };
  };
  timeline: {
    $get: ApiRequest<{ param: PaneParam; query: TimelineQuery }, TRequestInit, TResponse>;
  };
  notes: {
    $get: ApiRequest<{ param: PaneParam }, TRequestInit, TResponse>;
    $post: ApiRequest<{ param: PaneParam; json: RepoNotePayloadJson }, TRequestInit, TResponse>;
    ":noteId": {
      $put: ApiRequest<{ param: NoteIdParam; json: RepoNotePayloadJson }, TRequestInit, TResponse>;
      $delete: ApiRequest<{ param: NoteIdParam }, TRequestInit, TResponse>;
    };
  };
  files: {
    tree: {
      $get: ApiRequest<{ param: PaneParam; query: RepoFileTreeQuery }, TRequestInit, TResponse>;
    };
    search: {
      $get: ApiRequest<{ param: PaneParam; query: RepoFileSearchQuery }, TRequestInit, TResponse>;
    };
    content: {
      $get: ApiRequest<{ param: PaneParam; query: RepoFileContentQuery }, TRequestInit, TResponse>;
    };
  };
  worktrees: { $get: ApiRequest<{ param: PaneParam }, TRequestInit, TResponse> };
};

export type ApiClientContract<TRequestInit = unknown, TResponse = unknown, TFile = unknown> = {
  sessions: {
    $get: ApiRootGetRequest<TRequestInit, TResponse>;
    launch: { $post: ApiRequest<{ json: LaunchAgentJson }, TRequestInit, TResponse> };
    ":paneId": SessionApiClient<TRequestInit, TResponse, TFile>;
  };
};

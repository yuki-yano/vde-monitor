import type {
  ApiClientContract as SharedApiClientContract,
  CommitFileQuery,
  CommitLogQuery,
  DiffFileQuery,
  ForceQuery,
  LaunchAgentJson,
  NoteIdParam,
  PaneHashParam,
  PaneParam,
  RepoFileContentQuery,
  RepoFileSearchQuery,
  RepoFileTreeQuery,
  RepoNotePayloadJson,
  ScreenRequestJson,
  SendKeysJson,
  SendRawJson,
  SendTextJson,
  SessionTitleJson,
  TimelineQuery,
  UploadImageForm as SharedUploadImageForm,
} from "@vde-monitor/shared";
import { hc } from "hono/client";

export type ApiClientContract = SharedApiClientContract<RequestInit, Response, File>;
export type UploadImageForm = SharedUploadImageForm<File>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  (typeof value === "object" || typeof value === "function") && value != null;

const hasMethod = (value: unknown, method: "$get" | "$post" | "$put") =>
  isRecord(value) && typeof value[method] === "function";

const assertApiClientContract: (value: unknown) => asserts value is ApiClientContract = (value) => {
  if (!isRecord(value) || !isRecord(value.sessions)) {
    throw new Error("Invalid API client: missing sessions root.");
  }
  const sessionsRoot = value.sessions;
  if (!hasMethod(sessionsRoot, "$get") || !isRecord(sessionsRoot.launch)) {
    throw new Error("Invalid API client: missing sessions routes.");
  }
  if (!hasMethod(sessionsRoot.launch, "$post")) {
    throw new Error("Invalid API client: missing sessions launch route.");
  }
  const paneRoutes = isRecord(sessionsRoot[":paneId"]) ? sessionsRoot[":paneId"] : null;
  if (!paneRoutes || !isRecord(paneRoutes.screen) || !hasMethod(paneRoutes.screen, "$post")) {
    throw new Error("Invalid API client: missing pane screen route.");
  }
};

export const createApiClient = (
  apiBasePath: string,
  authHeaders: Record<string, string>,
): ApiClientContract => {
  const client: unknown = hc(apiBasePath, {
    headers: authHeaders,
  });
  assertApiClientContract(client);
  return client;
};

export type {
  CommitFileQuery,
  CommitLogQuery,
  DiffFileQuery,
  ForceQuery,
  LaunchAgentJson,
  NoteIdParam,
  PaneHashParam,
  PaneParam,
  RepoFileContentQuery,
  RepoFileSearchQuery,
  RepoFileTreeQuery,
  RepoNotePayloadJson,
  ScreenRequestJson,
  SendKeysJson,
  SendRawJson,
  SendTextJson,
  SessionTitleJson,
  TimelineQuery,
};

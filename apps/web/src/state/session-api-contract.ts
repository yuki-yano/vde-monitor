import type { InferRequestType } from "hono/client";
import { hc } from "hono/client";

import type { ApiAppType } from "../../../server/src/http/api-router";

export const createApiClient = (apiBasePath: string, authHeaders: Record<string, string>) =>
  hc<ApiAppType>(apiBasePath, {
    headers: authHeaders,
  });

type ApiClientContract = ReturnType<typeof createApiClient>;
type SessionsClient = ApiClientContract["sessions"];
type SessionClient = ApiClientContract["sessions"][":paneId"];
type NotesClient = SessionClient["notes"];

export type PaneParam = NonNullable<InferRequestType<SessionClient["focus"]["$post"]>["param"]>;
export type PaneHashParam = NonNullable<
  InferRequestType<SessionClient["commits"][":hash"]["$get"]>["param"]
>;
export type ForceQuery = NonNullable<InferRequestType<SessionClient["diff"]["$get"]>["query"]>;
export type DiffFileQuery = NonNullable<
  InferRequestType<SessionClient["diff"]["file"]["$get"]>["query"]
>;
export type CommitLogQuery = NonNullable<
  InferRequestType<SessionClient["commits"]["$get"]>["query"]
>;
export type CommitFileQuery = NonNullable<
  InferRequestType<SessionClient["commits"][":hash"]["file"]["$get"]>["query"]
>;
export type ScreenRequestJson = NonNullable<
  InferRequestType<SessionClient["screen"]["$post"]>["json"]
>;
export type SendTextJson = NonNullable<
  InferRequestType<SessionClient["send"]["text"]["$post"]>["json"]
>;
export type SendKeysJson = NonNullable<
  InferRequestType<SessionClient["send"]["keys"]["$post"]>["json"]
>;
export type SendRawJson = NonNullable<
  InferRequestType<SessionClient["send"]["raw"]["$post"]>["json"]
>;
export type LaunchAgentJson = NonNullable<
  InferRequestType<SessionsClient["launch"]["$post"]>["json"]
>;
export type SessionTitleJson = NonNullable<
  InferRequestType<SessionClient["title"]["$put"]>["json"]
>;
export type UploadImageForm = NonNullable<
  InferRequestType<SessionClient["attachments"]["image"]["$post"]>["form"]
>;
export type TimelineQuery = NonNullable<
  InferRequestType<SessionClient["timeline"]["$get"]>["query"]
>;
export type RepoNotePayloadJson = NonNullable<InferRequestType<NotesClient["$post"]>["json"]>;
export type RepoFileTreeQuery = NonNullable<
  InferRequestType<SessionClient["files"]["tree"]["$get"]>["query"]
>;
export type RepoFileSearchQuery = NonNullable<
  InferRequestType<SessionClient["files"]["search"]["$get"]>["query"]
>;
export type RepoFileContentQuery = NonNullable<
  InferRequestType<SessionClient["files"]["content"]["$get"]>["query"]
>;
export type NoteIdParam = NonNullable<InferRequestType<NotesClient[":noteId"]["$put"]>["param"]>;

export type { ApiClientContract };

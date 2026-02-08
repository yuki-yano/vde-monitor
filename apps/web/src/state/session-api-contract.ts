import type { AllowedKey, RawItem, SessionStateTimelineRange } from "@vde-monitor/shared";
import { hc } from "hono/client";

export type PaneParam = { paneId: string };
export type PaneHashParam = { paneId: string; hash: string };
export type ForceQuery = { force?: string };
export type DiffFileQuery = { path: string; rev?: string; force?: string };
export type CommitLogQuery = { limit?: string; skip?: string; force?: string };
export type CommitFileQuery = { path: string; force?: string };
export type TimelineQuery = { range?: SessionStateTimelineRange; limit?: string };
export type ScreenRequestJson = { mode?: "text" | "image"; lines?: number; cursor?: string };
export type SendTextJson = { text: string; enter: boolean };
export type SendKeysJson = { keys: AllowedKey[] };
export type SendRawJson = { items: RawItem[]; unsafe: boolean };
export type UpdateTitleJson = { title: string | null };
export type UploadImageForm = { image: File | Blob };

export type ApiClientContract = {
  sessions: {
    $get: () => Promise<Response>;
    ":paneId": {
      diff: {
        $get: (args: { param: PaneParam; query: ForceQuery }) => Promise<Response>;
        file: {
          $get: (args: { param: PaneParam; query: DiffFileQuery }) => Promise<Response>;
        };
      };
      commits: {
        $get: (args: { param: PaneParam; query: CommitLogQuery }) => Promise<Response>;
        ":hash": {
          $get: (args: { param: PaneHashParam; query: ForceQuery }) => Promise<Response>;
          file: {
            $get: (args: { param: PaneHashParam; query: CommitFileQuery }) => Promise<Response>;
          };
        };
      };
      timeline: {
        $get: (args: { param: PaneParam; query: TimelineQuery }) => Promise<Response>;
      };
      screen: {
        $post: (args: { param: PaneParam; json: ScreenRequestJson }) => Promise<Response>;
      };
      focus: {
        $post: (args: { param: PaneParam }) => Promise<Response>;
      };
      attachments: {
        image: {
          $post: (args: { param: PaneParam; form: UploadImageForm }) => Promise<Response>;
        };
      };
      send: {
        text: {
          $post: (args: { param: PaneParam; json: SendTextJson }) => Promise<Response>;
        };
        keys: {
          $post: (args: { param: PaneParam; json: SendKeysJson }) => Promise<Response>;
        };
        raw: {
          $post: (args: { param: PaneParam; json: SendRawJson }) => Promise<Response>;
        };
      };
      title: {
        $put: (args: { param: PaneParam; json: UpdateTitleJson }) => Promise<Response>;
      };
      touch: {
        $post: (args: { param: PaneParam }) => Promise<Response>;
      };
    };
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  (typeof value === "object" && value != null) || typeof value === "function";

const hasFunction = (value: unknown, key: string): boolean =>
  isRecord(value) && typeof value[key] === "function";

const hasPathRecord = (value: unknown, key: string): value is Record<string, unknown> =>
  isRecord(value) && isRecord(value[key]);

const hasPaneRoutes = (value: unknown): value is Record<string, unknown> => {
  if (!isRecord(value)) {
    return false;
  }
  if (!hasPathRecord(value, "diff")) {
    return false;
  }
  if (!hasPathRecord(value, "commits")) {
    return false;
  }
  if (!hasPathRecord(value, "timeline")) {
    return false;
  }
  if (!hasPathRecord(value, "screen")) {
    return false;
  }
  if (!hasPathRecord(value, "focus")) {
    return false;
  }
  if (!hasPathRecord(value, "attachments")) {
    return false;
  }
  if (!hasPathRecord(value, "send")) {
    return false;
  }
  if (!hasPathRecord(value, "title")) {
    return false;
  }
  if (!hasPathRecord(value, "touch")) {
    return false;
  }
  if (!hasFunction(value.diff, "$get")) {
    return false;
  }
  if (!hasPathRecord(value.diff, "file") || !hasFunction(value.diff.file, "$get")) {
    return false;
  }
  if (!hasFunction(value.commits, "$get")) {
    return false;
  }
  if (!hasPathRecord(value.commits, ":hash")) {
    return false;
  }
  if (!hasFunction(value.commits[":hash"], "$get")) {
    return false;
  }
  if (
    !hasPathRecord(value.commits[":hash"], "file") ||
    !hasFunction(value.commits[":hash"].file, "$get")
  ) {
    return false;
  }
  if (!hasFunction(value.timeline, "$get")) {
    return false;
  }
  if (!hasFunction(value.screen, "$post")) {
    return false;
  }
  if (!hasFunction(value.focus, "$post")) {
    return false;
  }
  if (
    !hasPathRecord(value.attachments, "image") ||
    !hasFunction(value.attachments.image, "$post")
  ) {
    return false;
  }
  if (
    !hasPathRecord(value.send, "text") ||
    !hasPathRecord(value.send, "keys") ||
    !hasPathRecord(value.send, "raw")
  ) {
    return false;
  }
  if (
    !hasFunction(value.send.text, "$post") ||
    !hasFunction(value.send.keys, "$post") ||
    !hasFunction(value.send.raw, "$post")
  ) {
    return false;
  }
  if (!hasFunction(value.title, "$put")) {
    return false;
  }
  if (!hasFunction(value.touch, "$post")) {
    return false;
  }
  return true;
};

export const isApiClientContract = (value: unknown): value is ApiClientContract => {
  if (!isRecord(value)) {
    return false;
  }
  if (!hasPathRecord(value, "sessions")) {
    return false;
  }
  if (!hasFunction(value.sessions, "$get")) {
    return false;
  }
  if (!hasPathRecord(value.sessions, ":paneId")) {
    return false;
  }
  return hasPaneRoutes(value.sessions[":paneId"]);
};

export const createApiClient = (
  apiBasePath: string,
  authHeaders: Record<string, string>,
): ApiClientContract => {
  const client = hc(apiBasePath, {
    headers: authHeaders,
  });
  if (!isApiClientContract(client)) {
    throw new Error("invalid api client contract");
  }
  return client;
};

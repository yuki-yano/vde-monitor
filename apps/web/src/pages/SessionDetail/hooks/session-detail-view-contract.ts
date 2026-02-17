import type { SessionDetailVM } from "../useSessionDetailVM";

export type SessionDetailViewShellSectionsInput = Pick<
  SessionDetailVM,
  "meta" | "sidebar" | "controls" | "logs" | "title" | "actions"
>;

export type SessionDetailViewExplorerSectionsInput = Pick<
  SessionDetailVM,
  "meta" | "sidebar" | "screen" | "controls" | "files" | "diffs"
>;

export type SessionDetailViewDataSectionsInput = Pick<
  SessionDetailVM,
  "meta" | "timeline" | "screen" | "diffs" | "files" | "commits" | "notes"
>;

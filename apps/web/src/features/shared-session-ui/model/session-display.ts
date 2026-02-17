import type { SessionSummary } from "@vde-monitor/shared";

import { formatStateLabel, isEditorCommand, stateTone } from "@/lib/session-format";

type SessionTitleFields = Pick<SessionSummary, "customTitle" | "title" | "sessionName">;
type SessionStateFields = Pick<SessionSummary, "state" | "currentCommand">;

export const resolveSessionDisplayTitle = (session: SessionTitleFields) =>
  session.customTitle ?? session.title ?? session.sessionName;

export const isSessionEditorState = (session: SessionStateFields) =>
  session.state === "UNKNOWN" && isEditorCommand(session.currentCommand);

export const resolveSessionStateLabel = (session: SessionStateFields) =>
  isSessionEditorState(session) ? "EDITOR" : formatStateLabel(session.state);

export const resolveSessionStateTone = (session: SessionStateFields) =>
  isSessionEditorState(session) ? "editor" : stateTone(session.state);

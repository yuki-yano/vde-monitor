import type { HookStateSignal } from "@vde-monitor/multiplexer";
import { claudeHookEventSchema, codexHookEventSchema } from "@vde-monitor/shared";

import { deriveCodexHookState, deriveHookState, mapHookToPane } from "./monitor-utils";

export type HookEventContext = {
  paneId: string;
  hookState: HookStateSignal;
  sessionId: string;
};

type HookPaneSnapshot = {
  paneId: string;
  paneTty: string | null;
  currentPath: string | null;
};

type ParsedHookEvent = {
  ts: string;
  session_id: string;
  cwd?: string;
  tty?: string;
  tmux_pane?: string | null;
};

const dispatchHookEvent = (
  event: ParsedHookEvent,
  hookState: { state: HookStateSignal["state"]; reason: string } | null,
  panes: HookPaneSnapshot[],
  onHook: (context: HookEventContext) => void,
) => {
  if (!hookState) {
    return false;
  }
  const paneId = mapHookToPane(panes, {
    tmux_pane: event.tmux_pane ?? null,
    tty: event.tty,
    cwd: event.cwd,
  });
  if (!paneId) {
    return false;
  }
  onHook({
    paneId,
    hookState: { ...hookState, at: event.ts },
    sessionId: event.session_id,
  });
  return true;
};

const parseLine = (line: string): unknown | null => {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
};

export const handleHookLine = (
  line: string,
  panes: HookPaneSnapshot[],
  onHook: (context: HookEventContext) => void,
) => {
  const parsed = parseLine(line);
  if (parsed == null) {
    return false;
  }
  const result = claudeHookEventSchema.safeParse(parsed);
  if (!result.success) {
    return false;
  }
  const event = result.data;
  const hookState = deriveHookState(event.hook_event_name, event.notification_type);
  return dispatchHookEvent(event, hookState, panes, onHook);
};

export const handleCodexHookLine = (
  line: string,
  panes: HookPaneSnapshot[],
  onHook: (context: HookEventContext) => void,
) => {
  const parsed = parseLine(line);
  if (parsed == null) {
    return false;
  }
  const result = codexHookEventSchema.safeParse(parsed);
  if (!result.success) {
    return false;
  }
  const event = result.data;
  const hookState = deriveCodexHookState(event.hook_event_name);
  return dispatchHookEvent(event, hookState, panes, onHook);
};

import { atom } from "jotai";

import type { Theme } from "@/lib/theme";
import {
  type SessionApi,
  sessionApiAtom as sharedSessionApiAtom,
  sessionConnectedAtom as sharedConnectedAtom,
  sessionConnectionIssueAtom as sharedConnectionIssueAtom,
  sessionConnectionStatusAtom as sharedConnectionStatusAtom,
  sessionFileNavigatorConfigAtom as sharedFileNavigatorConfigAtom,
  sessionHighlightCorrectionsAtom as sharedHighlightCorrectionsAtom,
  sessionLaunchConfigAtom as sharedLaunchConfigAtom,
} from "@/state/session-state-atoms";
import { sessionsAtom as sharedSessionsAtom } from "@/state/use-session-store";

export type { SessionApi };

export const paneIdAtom = atom<string | null>(null);
export const sessionsAtom = sharedSessionsAtom;
export const connectedAtom = sharedConnectedAtom;
export const connectionStatusAtom = sharedConnectionStatusAtom;
export const connectionIssueAtom = sharedConnectionIssueAtom;
export const highlightCorrectionsAtom = sharedHighlightCorrectionsAtom;
export const fileNavigatorConfigAtom = sharedFileNavigatorConfigAtom;
export const launchConfigAtom = sharedLaunchConfigAtom;
export const resolvedThemeAtom = atom<Theme>("latte");
export const sessionApiAtom = sharedSessionApiAtom;

export const currentSessionAtom = atom((get) => {
  const paneId = get(paneIdAtom);
  if (!paneId) return null;
  return get(sessionsAtom).find((session) => session.paneId === paneId) ?? null;
});

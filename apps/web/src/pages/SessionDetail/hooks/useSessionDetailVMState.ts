import { useAtomValue } from "jotai";

import { useNowMs } from "@/lib/use-now-ms";

import { screenTextAtom } from "../atoms/screenAtoms";
import {
  connectedAtom,
  connectionIssueAtom,
  connectionStatusAtom,
  currentSessionAtom,
  fileNavigatorConfigAtom,
  highlightCorrectionsAtom,
  launchConfigAtom,
  resolvedThemeAtom,
  sessionApiAtom,
  sessionsAtom,
} from "../atoms/sessionDetailAtoms";

export const useSessionDetailVMState = () => {
  const sessions = useAtomValue(sessionsAtom);
  const connected = useAtomValue(connectedAtom);
  const connectionStatus = useAtomValue(connectionStatusAtom);
  const connectionIssue = useAtomValue(connectionIssueAtom);
  const highlightCorrections = useAtomValue(highlightCorrectionsAtom);
  const fileNavigatorConfig = useAtomValue(fileNavigatorConfigAtom);
  const launchConfig = useAtomValue(launchConfigAtom);
  const resolvedTheme = useAtomValue(resolvedThemeAtom);
  const session = useAtomValue(currentSessionAtom);
  const screenText = useAtomValue(screenTextAtom);
  const sessionApi = useAtomValue(sessionApiAtom);
  if (!sessionApi) {
    throw new Error("SessionDetailProvider is required");
  }
  const nowMs = useNowMs();

  return {
    sessions,
    connected,
    connectionStatus,
    connectionIssue,
    highlightCorrections,
    fileNavigatorConfig,
    launchConfig,
    resolvedTheme,
    session,
    screenText,
    nowMs,
    ...sessionApi,
  };
};

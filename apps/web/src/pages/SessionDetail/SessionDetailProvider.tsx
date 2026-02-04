import { Provider as JotaiProvider, useSetAtom } from "jotai";
import { useHydrateAtoms } from "jotai/utils";
import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";

import { useSessions } from "@/state/session-context";
import { useTheme } from "@/state/theme-context";

import {
  connectedAtom,
  connectionIssueAtom,
  highlightCorrectionsAtom,
  paneIdAtom,
  readOnlyAtom,
  resolvedThemeAtom,
  type SessionApi,
  sessionApiAtom,
  sessionsAtom,
} from "./atoms/sessionDetailAtoms";

type SessionDetailProviderProps = {
  paneId: string;
  children: ReactNode;
};

const SessionDetailHydrator = ({ paneId }: { paneId: string }) => {
  const {
    sessions,
    connected,
    connectionIssue,
    readOnly,
    highlightCorrections,
    reconnect,
    requestDiffSummary,
    requestDiffFile,
    requestCommitLog,
    requestCommitDetail,
    requestCommitFile,
    requestScreen,
    sendText,
    sendKeys,
    sendRaw,
    touchSession,
    updateSessionTitle,
  } = useSessions();
  const { resolvedTheme } = useTheme();

  const setPaneId = useSetAtom(paneIdAtom);
  const setSessions = useSetAtom(sessionsAtom);
  const setConnected = useSetAtom(connectedAtom);
  const setConnectionIssue = useSetAtom(connectionIssueAtom);
  const setReadOnly = useSetAtom(readOnlyAtom);
  const setHighlightCorrections = useSetAtom(highlightCorrectionsAtom);
  const setResolvedTheme = useSetAtom(resolvedThemeAtom);
  const setSessionApi = useSetAtom(sessionApiAtom);

  const sessionApi = useMemo<SessionApi>(
    () => ({
      reconnect,
      requestDiffSummary,
      requestDiffFile,
      requestCommitLog,
      requestCommitDetail,
      requestCommitFile,
      requestScreen,
      sendText,
      sendKeys,
      sendRaw,
      touchSession,
      updateSessionTitle,
    }),
    [
      reconnect,
      requestDiffSummary,
      requestDiffFile,
      requestCommitLog,
      requestCommitDetail,
      requestCommitFile,
      requestScreen,
      sendText,
      sendKeys,
      sendRaw,
      touchSession,
      updateSessionTitle,
    ],
  );

  useHydrateAtoms([
    [paneIdAtom, paneId],
    [sessionsAtom, sessions],
    [connectedAtom, connected],
    [connectionIssueAtom, connectionIssue],
    [readOnlyAtom, readOnly],
    [highlightCorrectionsAtom, highlightCorrections],
    [resolvedThemeAtom, resolvedTheme],
    [sessionApiAtom, sessionApi],
  ]);

  useEffect(() => {
    setPaneId(paneId);
  }, [paneId, setPaneId]);

  useEffect(() => {
    setSessions(sessions);
  }, [sessions, setSessions]);

  useEffect(() => {
    setConnected(connected);
  }, [connected, setConnected]);

  useEffect(() => {
    setConnectionIssue(connectionIssue);
  }, [connectionIssue, setConnectionIssue]);

  useEffect(() => {
    setReadOnly(readOnly);
  }, [readOnly, setReadOnly]);

  useEffect(() => {
    setHighlightCorrections(highlightCorrections);
  }, [highlightCorrections, setHighlightCorrections]);

  useEffect(() => {
    setResolvedTheme(resolvedTheme);
  }, [resolvedTheme, setResolvedTheme]);

  useEffect(() => {
    setSessionApi(sessionApi);
  }, [sessionApi, setSessionApi]);

  return null;
};

export const SessionDetailProvider = ({ paneId, children }: SessionDetailProviderProps) => {
  return (
    <JotaiProvider>
      <SessionDetailHydrator paneId={paneId} />
      {children}
    </JotaiProvider>
  );
};

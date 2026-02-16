import { useSetAtom } from "jotai";
import { useHydrateAtoms } from "jotai/utils";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

import {
  connectedAtom,
  connectionIssueAtom,
  connectionStatusAtom,
  fileNavigatorConfigAtom,
  highlightCorrectionsAtom,
  launchConfigAtom,
  paneIdAtom,
  resolvedThemeAtom,
  sessionApiAtom,
  sessionsAtom,
} from "./atoms/sessionDetailAtoms";
import {
  type SessionDetailAtomSnapshot,
  useSessionDetailAtomSnapshot,
} from "./hooks/useSessionDetailAtomSnapshot";

type SessionDetailProviderProps = {
  paneId: string;
  children: ReactNode;
};

const useSyncAtomValue = <T,>(value: T, setValue: (nextValue: T) => void) => {
  useEffect(() => {
    setValue(value);
  }, [setValue, value]);
};

const SessionDetailInitialHydrator = ({ snapshot }: { snapshot: SessionDetailAtomSnapshot }) => {
  useHydrateAtoms([
    [paneIdAtom, snapshot.paneId],
    [sessionsAtom, snapshot.sessions],
    [connectedAtom, snapshot.connected],
    [connectionStatusAtom, snapshot.connectionStatus],
    [connectionIssueAtom, snapshot.connectionIssue],
    [highlightCorrectionsAtom, snapshot.highlightCorrections],
    [fileNavigatorConfigAtom, snapshot.fileNavigatorConfig],
    [launchConfigAtom, snapshot.launchConfig],
    [resolvedThemeAtom, snapshot.resolvedTheme],
    [sessionApiAtom, snapshot.sessionApi],
  ]);

  return null;
};

const SessionDetailAtomSynchronizer = ({ snapshot }: { snapshot: SessionDetailAtomSnapshot }) => {
  const setPaneId = useSetAtom(paneIdAtom);
  const setSessions = useSetAtom(sessionsAtom);
  const setConnected = useSetAtom(connectedAtom);
  const setConnectionStatus = useSetAtom(connectionStatusAtom);
  const setConnectionIssue = useSetAtom(connectionIssueAtom);
  const setHighlightCorrections = useSetAtom(highlightCorrectionsAtom);
  const setFileNavigatorConfig = useSetAtom(fileNavigatorConfigAtom);
  const setLaunchConfig = useSetAtom(launchConfigAtom);
  const setResolvedTheme = useSetAtom(resolvedThemeAtom);
  const setSessionApi = useSetAtom(sessionApiAtom);

  useSyncAtomValue(snapshot.paneId, setPaneId);
  useSyncAtomValue(snapshot.sessions, setSessions);
  useSyncAtomValue(snapshot.connected, setConnected);
  useSyncAtomValue(snapshot.connectionStatus, setConnectionStatus);
  useSyncAtomValue(snapshot.connectionIssue, setConnectionIssue);
  useSyncAtomValue(snapshot.highlightCorrections, setHighlightCorrections);
  useSyncAtomValue(snapshot.fileNavigatorConfig, setFileNavigatorConfig);
  useSyncAtomValue(snapshot.launchConfig, setLaunchConfig);
  useSyncAtomValue(snapshot.resolvedTheme, setResolvedTheme);
  useSyncAtomValue(snapshot.sessionApi, setSessionApi);

  return null;
};

const SessionDetailHydrator = ({ paneId }: { paneId: string }) => {
  const snapshot = useSessionDetailAtomSnapshot(paneId);
  const initialSnapshotRef = useRef<null | SessionDetailAtomSnapshot>(null);
  if (initialSnapshotRef.current == null) {
    initialSnapshotRef.current = snapshot;
  }

  return (
    <>
      <SessionDetailInitialHydrator snapshot={initialSnapshotRef.current} />
      <SessionDetailAtomSynchronizer snapshot={snapshot} />
    </>
  );
};

export const SessionDetailProvider = ({ paneId, children }: SessionDetailProviderProps) => {
  return (
    <>
      <SessionDetailHydrator paneId={paneId} />
      {children}
    </>
  );
};

import { useSetAtom } from "jotai";
import { useHydrateAtoms } from "jotai/utils";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

import { useTheme } from "@/state/theme-context";

import { paneIdAtom, resolvedThemeAtom } from "./atoms/sessionDetailAtoms";

type SessionDetailProviderProps = {
  paneId: string;
  children: ReactNode;
};

const SessionDetailHydrator = ({ paneId }: { paneId: string }) => {
  const { resolvedTheme } = useTheme();
  const setPaneId = useSetAtom(paneIdAtom);
  const setResolvedTheme = useSetAtom(resolvedThemeAtom);
  const initialSnapshotRef = useRef<null | { paneId: string; resolvedTheme: "latte" | "mocha" }>(
    null,
  );

  if (initialSnapshotRef.current == null) {
    initialSnapshotRef.current = { paneId, resolvedTheme };
  }

  useHydrateAtoms([
    [paneIdAtom, initialSnapshotRef.current.paneId],
    [resolvedThemeAtom, initialSnapshotRef.current.resolvedTheme],
  ]);

  useEffect(() => {
    setPaneId(paneId);
  }, [paneId, setPaneId]);

  useEffect(() => {
    setResolvedTheme(resolvedTheme);
  }, [resolvedTheme, setResolvedTheme]);

  return null;
};

export const SessionDetailProvider = ({ paneId, children }: SessionDetailProviderProps) => {
  return (
    <>
      <SessionDetailHydrator paneId={paneId} />
      {children}
    </>
  );
};

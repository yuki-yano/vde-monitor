import { useCallback, useEffect, useState } from "react";

import {
  createRepoPinKey,
  readStoredSessionListPins,
  storeSessionListPins,
  touchSessionListPin,
} from "@/features/shared-session-ui/model/session-list-pins";

type UseSessionListPinsArgs = {
  onTouchPane?: (paneId: string) => Promise<void> | void;
};

export const useSessionListPins = ({ onTouchPane }: UseSessionListPinsArgs) => {
  const [pins, setPins] = useState(() => readStoredSessionListPins());
  const repoPinValues = pins.repos;

  useEffect(() => {
    storeSessionListPins(pins);
  }, [pins]);

  const getRepoSortAnchorAt = useCallback(
    (repoRoot: string | null) => repoPinValues[createRepoPinKey(repoRoot)] ?? null,
    [repoPinValues],
  );

  const touchRepoPin = useCallback((repoRoot: string | null) => {
    setPins((prev) => touchSessionListPin(prev, "repos", createRepoPinKey(repoRoot)));
  }, []);

  const touchPanePin = useCallback(
    (paneId: string) => {
      if (!onTouchPane) {
        return;
      }
      try {
        const result = onTouchPane(paneId);
        void Promise.resolve(result).catch(() => null);
      } catch {
        // Best-effort UI action: ignore unexpected callback failures.
      }
    },
    [onTouchPane],
  );

  return {
    pins,
    getRepoSortAnchorAt,
    touchRepoPin,
    touchPanePin,
  };
};

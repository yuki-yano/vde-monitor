import { useClickOutside, useInterval } from "@mantine/hooks";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

const WORKTREE_SELECTOR_OPEN_BODY_DATASET_KEY = "vdeWorktreeSelectorOpen";
const WORKTREE_SELECTOR_REFRESH_INTERVAL_MS = 10_000;

type UseScreenPanelWorktreeSelectorArgs = {
  enabled: boolean;
  onRefreshScreen: () => void;
  onRefreshWorktrees?: () => void;
  containerRef: RefObject<HTMLDivElement | null>;
};

export const useScreenPanelWorktreeSelector = ({
  enabled,
  onRefreshScreen,
  onRefreshWorktrees,
  containerRef,
}: UseScreenPanelWorktreeSelectorArgs) => {
  const [isOpen, setIsOpen] = useState(false);
  const lastClosedAtRef = useRef(Date.now());

  const refreshWorktrees = useCallback(() => {
    if (onRefreshWorktrees) {
      onRefreshWorktrees();
      return;
    }
    onRefreshScreen();
  }, [onRefreshScreen, onRefreshWorktrees]);
  const { start: startRefreshInterval, stop: stopRefreshInterval } = useInterval(() => {
    refreshWorktrees();
  }, WORKTREE_SELECTOR_REFRESH_INTERVAL_MS);

  useEffect(() => {
    if (!enabled && isOpen) {
      setIsOpen(false);
    }
  }, [enabled, isOpen]);

  useEffect(() => {
    if (!enabled) {
      stopRefreshInterval();
      return;
    }
    if (!isOpen) {
      stopRefreshInterval();
      lastClosedAtRef.current = Date.now();
      return;
    }
    const elapsedSinceCloseMs = Date.now() - lastClosedAtRef.current;
    if (elapsedSinceCloseMs >= WORKTREE_SELECTOR_REFRESH_INTERVAL_MS) {
      refreshWorktrees();
    }
    startRefreshInterval();
    return stopRefreshInterval;
  }, [enabled, isOpen, refreshWorktrees, startRefreshInterval, stopRefreshInterval]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const { body } = document;
    if (isOpen) {
      body.dataset[WORKTREE_SELECTOR_OPEN_BODY_DATASET_KEY] = "true";
    } else {
      delete body.dataset[WORKTREE_SELECTOR_OPEN_BODY_DATASET_KEY];
    }
    return () => {
      delete body.dataset[WORKTREE_SELECTOR_OPEN_BODY_DATASET_KEY];
    };
  }, [isOpen]);

  useClickOutside(
    () => {
      if (!isOpen) {
        return;
      }
      setIsOpen(false);
    },
    ["pointerdown"],
    [containerRef.current],
  );

  return {
    isOpen,
    setIsOpen,
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((previous) => !previous),
  };
};

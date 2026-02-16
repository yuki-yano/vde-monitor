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

  useEffect(() => {
    if (!enabled && isOpen) {
      setIsOpen(false);
    }
  }, [enabled, isOpen]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (!isOpen) {
      lastClosedAtRef.current = Date.now();
      return;
    }
    const elapsedSinceCloseMs = Date.now() - lastClosedAtRef.current;
    if (elapsedSinceCloseMs >= WORKTREE_SELECTOR_REFRESH_INTERVAL_MS) {
      refreshWorktrees();
    }
    const timerId = window.setInterval(() => {
      refreshWorktrees();
    }, WORKTREE_SELECTOR_REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(timerId);
    };
  }, [enabled, isOpen, refreshWorktrees]);

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

  useEffect(() => {
    if (!isOpen || typeof document === "undefined") {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const containerNode = containerRef.current;
      if (!containerNode) {
        return;
      }
      if (event.target instanceof Node && !containerNode.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [containerRef, isOpen]);

  return {
    isOpen,
    setIsOpen,
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((previous) => !previous),
  };
};

import { type RefObject, type SetStateAction, useCallback, useEffect, useReducer } from "react";

import { useLazyRef } from "@/lib/use-lazy-ref";

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
  const [, forceRender] = useReducer((version: number) => version + 1, 0);
  const lastClosedAtRef = useLazyRef(() => Date.now());
  const requestedOpenRef = useLazyRef(() => false);
  if (!enabled && requestedOpenRef.current) {
    requestedOpenRef.current = false;
  }
  const isOpen = enabled && requestedOpenRef.current;

  const setRequestedOpen = useCallback(
    (next: SetStateAction<boolean>) => {
      const nextOpen =
        typeof next === "function"
          ? (next as (previous: boolean) => boolean)(requestedOpenRef.current)
          : next;
      const normalizedOpen = enabled && nextOpen;
      if (requestedOpenRef.current === normalizedOpen) {
        return;
      }
      requestedOpenRef.current = normalizedOpen;
      forceRender();
    },
    [enabled, requestedOpenRef],
  );

  const refreshWorktrees = useCallback(() => {
    if (onRefreshWorktrees) {
      onRefreshWorktrees();
      return;
    }
    onRefreshScreen();
  }, [onRefreshScreen, onRefreshWorktrees]);

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
  }, [enabled, isOpen, lastClosedAtRef, refreshWorktrees]);

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
        setRequestedOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [containerRef, isOpen, setRequestedOpen]);

  return {
    isOpen,
    setIsOpen: setRequestedOpen,
    close: () => setRequestedOpen(false),
    toggle: () => setRequestedOpen((previous) => !previous),
  };
};

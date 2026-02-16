import { useCallback, useRef, useState } from "react";

import {
  DEFAULT_SESSION_LIST_FILTER,
  isSessionListFilter,
  type SessionListFilter,
} from "@/pages/SessionList/sessionListFilters";
import type { LaunchAgentRequestOptions } from "@/state/launch-agent-options";

type UseSessionSidebarActionsArgs = {
  onSelectSession?: (paneId: string) => void;
  onFocusPane?: (paneId: string) => Promise<void> | void;
  onLaunchAgentInSession?: (
    sessionName: string,
    agent: "codex" | "claude",
    options?: LaunchAgentRequestOptions,
  ) => Promise<void> | void;
  onTouchSession?: (paneId: string) => void;
  onTouchRepoPin?: (repoRoot: string | null) => void;
};

export const useSessionSidebarActions = ({
  onSelectSession,
  onFocusPane,
  onLaunchAgentInSession,
  onTouchSession,
  onTouchRepoPin,
}: UseSessionSidebarActionsArgs) => {
  const [filter, setFilter] = useState<SessionListFilter>(DEFAULT_SESSION_LIST_FILTER);
  const [focusPendingPaneIds, setFocusPendingPaneIds] = useState<Set<string>>(() => new Set());
  const [launchPendingSessions, setLaunchPendingSessions] = useState<Set<string>>(() => new Set());
  const launchPendingRef = useRef<Set<string>>(new Set());

  const handleSelectSession = useCallback(
    (paneId: string) => {
      onSelectSession?.(paneId);
    },
    [onSelectSession],
  );

  const handleFocusPane = useCallback(
    async (paneId: string) => {
      if (!onFocusPane) {
        return;
      }
      setFocusPendingPaneIds((prev) => {
        if (prev.has(paneId)) {
          return prev;
        }
        const next = new Set(prev);
        next.add(paneId);
        return next;
      });
      try {
        await onFocusPane(paneId);
      } catch {
        // Best-effort UI action: ignore unexpected handler failures.
      } finally {
        setFocusPendingPaneIds((prev) => {
          if (!prev.has(paneId)) {
            return prev;
          }
          const next = new Set(prev);
          next.delete(paneId);
          return next;
        });
      }
    },
    [onFocusPane],
  );

  const handleLaunchAgentInSession = useCallback(
    async (sessionName: string, agent: "codex" | "claude", options?: LaunchAgentRequestOptions) => {
      if (!onLaunchAgentInSession) {
        return;
      }
      const launchKey = sessionName;
      if (launchPendingRef.current.has(launchKey)) {
        return;
      }
      launchPendingRef.current.add(launchKey);
      setLaunchPendingSessions(new Set(launchPendingRef.current));
      try {
        await onLaunchAgentInSession(sessionName, agent, options);
      } catch {
        // Best-effort UI action: ignore unexpected handler failures.
      } finally {
        launchPendingRef.current.delete(launchKey);
        setLaunchPendingSessions(new Set(launchPendingRef.current));
      }
    },
    [onLaunchAgentInSession],
  );

  const handleFilterChange = useCallback((next: string) => {
    if (!isSessionListFilter(next)) {
      setFilter(DEFAULT_SESSION_LIST_FILTER);
      return;
    }
    setFilter(next);
  }, []);

  const handleTouchRepoPin = useCallback(
    (repoRoot: string | null) => {
      onTouchRepoPin?.(repoRoot);
    },
    [onTouchRepoPin],
  );

  const handleTouchPane = useCallback(
    (paneId: string) => {
      onTouchSession?.(paneId);
    },
    [onTouchSession],
  );

  return {
    filter,
    focusPendingPaneIds,
    launchPendingSessions,
    handleSelectSession,
    handleFocusPane,
    handleLaunchAgentInSession,
    handleFilterChange,
    handleTouchRepoPin,
    handleTouchPane,
  };
};

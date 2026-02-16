import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import { buildSessionGroups } from "@/lib/session-group";
import { useNowMs } from "@/lib/use-now-ms";
import { useSidebarWidth } from "@/lib/use-sidebar-width";
import type { LaunchAgentRequestOptions } from "@/state/launch-agent-options";
import { useSessions } from "@/state/session-context";
import { useTheme } from "@/state/theme-context";

import { useSessionLogs } from "../SessionDetail/hooks/useSessionLogs";
import {
  DEFAULT_SESSION_LIST_FILTER,
  isSessionListFilter,
  matchesSessionListFilter,
  SESSION_LIST_FILTER_VALUES,
  storeSessionListFilter,
} from "./sessionListFilters";
import {
  createRepoPinKey,
  readStoredSessionListPins,
  storeSessionListPins,
  touchSessionListPin,
} from "./sessionListPins";
import { matchesSessionListSearch, normalizeSessionListSearchQuery } from "./sessionListSearch";

const FILTER_OPTIONS = SESSION_LIST_FILTER_VALUES.map((value) => ({
  value,
  label: value.replace("_", " "),
}));

const createLaunchRequestId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `launch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const useSessionListVM = () => {
  const {
    sessions,
    connected,
    connectionStatus,
    connectionIssue,
    refreshSessions,
    requestStateTimeline,
    requestScreen,
    requestWorktrees,
    launchAgentInSession,
    touchSession,
    highlightCorrections,
    launchConfig,
  } = useSessions();
  const nowMs = useNowMs();
  const search = useSearch({ from: "/" });
  const filter = isSessionListFilter(search.filter) ? search.filter : DEFAULT_SESSION_LIST_FILTER;
  const searchQuery = normalizeSessionListSearchQuery(search.q);
  const navigate = useNavigate({ from: "/" });
  const { resolvedTheme } = useTheme();
  const { sidebarWidth, handlePointerDown } = useSidebarWidth();
  const [pins, setPins] = useState(() => readStoredSessionListPins());
  const [launchPendingSessions, setLaunchPendingSessions] = useState<Set<string>>(() => new Set());
  const [screenError, setScreenError] = useState<string | null>(null);
  const launchPendingRef = useRef<Set<string>>(new Set());
  const repoPinValues = pins.repos;

  useEffect(() => {
    storeSessionListFilter(filter);
  }, [filter]);

  useEffect(() => {
    storeSessionListPins(pins);
  }, [pins]);

  const getRepoSortAnchorAt = useCallback(
    (repoRoot: string | null) => repoPinValues[createRepoPinKey(repoRoot)] ?? null,
    [repoPinValues],
  );

  const visibleSessions = useMemo(() => {
    return sessions.filter(
      (session) =>
        matchesSessionListFilter(session, filter) && matchesSessionListSearch(session, searchQuery),
    );
  }, [filter, searchQuery, sessions]);
  const paneRepoRootMap = useMemo(
    () => new Map(sessions.map((session) => [session.paneId, session.repoRoot ?? null] as const)),
    [sessions],
  );

  const groups = useMemo(
    () => buildSessionGroups(visibleSessions, { getRepoSortAnchorAt }),
    [getRepoSortAnchorAt, visibleSessions],
  );
  const sidebarSessionGroups = useMemo(
    () => buildSessionGroups(sessions, { getRepoSortAnchorAt }),
    [getRepoSortAnchorAt, sessions],
  );
  const quickPanelGroups = useMemo(
    () => buildSessionGroups(visibleSessions, { getRepoSortAnchorAt }),
    [getRepoSortAnchorAt, visibleSessions],
  );

  const {
    quickPanelOpen,
    logModalOpen,
    selectedPaneId,
    selectedSession,
    selectedLogLines,
    selectedLogLoading,
    selectedLogError,
    openLogModal,
    closeLogModal,
    toggleQuickPanel,
    closeQuickPanel,
  } = useSessionLogs({
    connected,
    connectionIssue,
    sessions,
    requestScreen,
    resolvedTheme,
    highlightCorrections,
  });

  const handleOpenPaneInNewWindow = useCallback(
    (targetPaneId: string) => {
      closeQuickPanel();
      closeLogModal();
      const encoded = encodeURIComponent(targetPaneId);
      window.open(`/sessions/${encoded}`, "_blank", "noopener,noreferrer");
    },
    [closeLogModal, closeQuickPanel],
  );

  const handleOpenInNewTab = useCallback(() => {
    if (!selectedPaneId) return;
    handleOpenPaneInNewWindow(selectedPaneId);
  }, [handleOpenPaneInNewWindow, selectedPaneId]);

  const handleOpenPaneHere = useCallback(
    (targetPaneId: string) => {
      closeQuickPanel();
      navigate({ to: "/sessions/$paneId", params: { paneId: targetPaneId } });
      closeLogModal();
    },
    [closeLogModal, closeQuickPanel, navigate],
  );

  const handleOpenHere = useCallback(() => {
    if (!selectedPaneId) return;
    handleOpenPaneHere(selectedPaneId);
  }, [handleOpenPaneHere, selectedPaneId]);

  const handleFilterChange = useCallback(
    (value: string) => {
      const nextFilter = isSessionListFilter(value) ? value : DEFAULT_SESSION_LIST_FILTER;
      if (nextFilter === filter) return;
      void navigate({
        search: (prev) => ({
          ...prev,
          filter: nextFilter,
        }),
        replace: true,
      });
    },
    [filter, navigate],
  );

  const handleSearchQueryChange = useCallback(
    (value: string) => {
      const nextQuery = normalizeSessionListSearchQuery(value);
      if (nextQuery === searchQuery) return;
      void navigate({
        search: (prev) => ({
          ...prev,
          q: nextQuery.length > 0 ? nextQuery : undefined,
        }),
        replace: true,
      });
    },
    [navigate, searchQuery],
  );

  const handleRefresh = useCallback(() => {
    refreshSessions();
  }, [refreshSessions]);

  const handleTouchRepoPin = useCallback((repoRoot: string | null) => {
    const key = createRepoPinKey(repoRoot);
    setPins((prev) => touchSessionListPin(prev, "repos", key));
  }, []);

  const handleTouchPanePin = useCallback(
    (paneId: string) => {
      if (paneRepoRootMap.has(paneId)) {
        const repoRoot = paneRepoRootMap.get(paneId) ?? null;
        setPins((prev) => touchSessionListPin(prev, "repos", createRepoPinKey(repoRoot)));
      }
      void touchSession(paneId).catch(() => null);
    },
    [paneRepoRootMap, touchSession],
  );

  const handleLaunchAgentInSession = useCallback(
    async (sessionName: string, agent: "codex" | "claude", options?: LaunchAgentRequestOptions) => {
      const key = sessionName;
      if (launchPendingRef.current.has(key)) {
        return;
      }
      launchPendingRef.current.add(key);
      setLaunchPendingSessions(new Set(launchPendingRef.current));

      try {
        const result = await launchAgentInSession(
          sessionName,
          agent,
          createLaunchRequestId(),
          options,
        );
        if (!result.ok) {
          setScreenError(result.error?.message ?? API_ERROR_MESSAGES.launchAgent);
          return;
        }
        await refreshSessions();
        setScreenError(null);
      } catch (error) {
        setScreenError(error instanceof Error ? error.message : API_ERROR_MESSAGES.launchAgent);
      } finally {
        launchPendingRef.current.delete(key);
        setLaunchPendingSessions(new Set(launchPendingRef.current));
      }
    },
    [launchAgentInSession, refreshSessions],
  );

  return {
    sessions,
    groups,
    sidebarSessionGroups,
    visibleSessionCount: visibleSessions.length,
    quickPanelGroups,
    filter,
    searchQuery,
    filterOptions: FILTER_OPTIONS,
    connected,
    connectionStatus,
    connectionIssue,
    requestStateTimeline,
    requestScreen,
    requestWorktrees,
    highlightCorrections,
    launchConfig,
    resolvedTheme,
    nowMs,
    sidebarWidth,
    onFilterChange: handleFilterChange,
    onSearchQueryChange: handleSearchQueryChange,
    onRefresh: handleRefresh,
    onSidebarResizeStart: handlePointerDown,
    quickPanelOpen,
    logModalOpen,
    selectedSession,
    selectedLogLines,
    selectedLogLoading,
    selectedLogError,
    onOpenLogModal: openLogModal,
    onCloseLogModal: closeLogModal,
    onToggleQuickPanel: toggleQuickPanel,
    onCloseQuickPanel: closeQuickPanel,
    onOpenPaneHere: handleOpenPaneHere,
    onOpenPaneInNewWindow: handleOpenPaneInNewWindow,
    onOpenHere: handleOpenHere,
    onOpenNewTab: handleOpenInNewTab,
    screenError,
    launchPendingSessions,
    onLaunchAgentInSession: handleLaunchAgentInSession,
    onTouchRepoPin: handleTouchRepoPin,
    onTouchPanePin: handleTouchPanePin,
  };
};

export type SessionListVM = ReturnType<typeof useSessionListVM>;

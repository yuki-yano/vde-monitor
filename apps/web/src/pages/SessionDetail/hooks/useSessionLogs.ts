import type {
  HighlightCorrectionConfig,
  ScreenResponse,
  SessionSummary,
} from "@vde-monitor/shared";
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo } from "react";

import { renderAnsiLines } from "@/lib/ansi";
import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import type { Theme } from "@/lib/theme";

import { logModalOpenAtom, quickPanelOpenAtom, selectedPaneIdAtom } from "../atoms/logAtoms";
import { useScreenCache } from "./useScreenCache";

type UseSessionLogsParams = {
  connected: boolean;
  connectionIssue: string | null;
  sessions: SessionSummary[];
  requestScreen: (
    paneId: string,
    options: { lines?: number; mode?: "text" | "image"; cursor?: string },
  ) => Promise<ScreenResponse>;
  resolvedTheme: Theme;
  highlightCorrections?: HighlightCorrectionConfig;
};

export const useSessionLogs = ({
  connected,
  connectionIssue,
  sessions,
  requestScreen,
  resolvedTheme,
  highlightCorrections,
}: UseSessionLogsParams) => {
  const [quickPanelOpen, setQuickPanelOpen] = useAtom(quickPanelOpenAtom);
  const [logModalOpen, setLogModalOpen] = useAtom(logModalOpenAtom);
  const [selectedPaneId, setSelectedPaneId] = useAtom(selectedPaneIdAtom);
  const {
    cache: logCache,
    loading: logLoading,
    error: logError,
    fetchScreen,
  } = useScreenCache({
    connected,
    connectionIssue,
    requestScreen,
    cacheKey: "logs",
    errorMessages: {
      load: API_ERROR_MESSAGES.logLoad,
      requestFailed: API_ERROR_MESSAGES.logRequestFailed,
    },
  });

  const selectedSession = useMemo(
    () =>
      selectedPaneId ? (sessions.find((item) => item.paneId === selectedPaneId) ?? null) : null,
    [selectedPaneId, sessions],
  );

  const selectedLogEntry = selectedPaneId ? (logCache[selectedPaneId] ?? null) : null;

  const selectedLogLines = useMemo(() => {
    if (!selectedLogEntry) return [];
    const text = selectedLogEntry.screen.length > 0 ? selectedLogEntry.screen : "No log data";
    const agent =
      selectedSession?.agent === "codex" || selectedSession?.agent === "claude"
        ? selectedSession.agent
        : "unknown";
    return renderAnsiLines(text, resolvedTheme, { agent, highlightCorrections });
  }, [selectedLogEntry, resolvedTheme, selectedSession?.agent, highlightCorrections]);

  const selectedLogLoading = Boolean(selectedPaneId && logLoading[selectedPaneId]);
  const selectedLogError = selectedPaneId ? (logError[selectedPaneId] ?? null) : null;

  const fetchLog = useCallback(
    async (paneId: string) => {
      await fetchScreen(paneId, { loading: "if-empty" });
    },
    [fetchScreen],
  );

  useEffect(() => {
    if (!logModalOpen || !selectedPaneId) {
      return;
    }
    void fetchLog(selectedPaneId);
    const intervalMs = 2000;
    const intervalId = window.setInterval(() => {
      if (document.hidden) return;
      void fetchLog(selectedPaneId);
    }, intervalMs);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchLog, logModalOpen, selectedPaneId]);

  const openLogModal = useCallback(
    (paneId: string) => {
      setSelectedPaneId(paneId);
      setLogModalOpen(true);
    },
    [setLogModalOpen, setSelectedPaneId],
  );

  const closeLogModal = useCallback(() => {
    setLogModalOpen(false);
    setSelectedPaneId(null);
  }, [setLogModalOpen, setSelectedPaneId]);

  const toggleQuickPanel = useCallback(() => {
    setQuickPanelOpen((prev) => {
      const next = !prev;
      if (!next) {
        setLogModalOpen(false);
        setSelectedPaneId(null);
      }
      return next;
    });
  }, [setLogModalOpen, setQuickPanelOpen, setSelectedPaneId]);

  const closeQuickPanel = useCallback(() => {
    setQuickPanelOpen(false);
    setLogModalOpen(false);
    setSelectedPaneId(null);
  }, [setLogModalOpen, setQuickPanelOpen, setSelectedPaneId]);

  useEffect(() => {
    if (!quickPanelOpen && !logModalOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (logModalOpen) {
        closeLogModal();
        return;
      }
      closeQuickPanel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeLogModal, closeQuickPanel, logModalOpen, quickPanelOpen]);

  return {
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
  };
};

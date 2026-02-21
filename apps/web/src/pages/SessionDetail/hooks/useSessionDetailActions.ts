import { useNavigate } from "@tanstack/react-router";
import type { CommandResponse } from "@vde-monitor/shared";
import { useCallback } from "react";

import { useWorkspaceTabs } from "@/features/pwa-tabs/context/workspace-tabs-context";
import { API_ERROR_MESSAGES } from "@/lib/api-messages";

type UseSessionDetailActionsParams = {
  paneId: string;
  selectedPaneId: string | null;
  closeQuickPanel: () => void;
  closeLogModal: () => void;
  touchSession: (paneId: string) => Promise<void>;
  focusPane: (paneId: string) => Promise<CommandResponse>;
  setScreenError: (message: string | null) => void;
};

export const useSessionDetailActions = ({
  paneId,
  selectedPaneId,
  closeQuickPanel,
  closeLogModal,
  touchSession,
  focusPane,
  setScreenError,
}: UseSessionDetailActionsParams) => {
  const navigate = useNavigate();
  const { enabled: pwaTabsEnabled, openSessionTab } = useWorkspaceTabs();

  const handleOpenPaneInNewWindow = useCallback(
    (targetPaneId: string) => {
      closeQuickPanel();
      closeLogModal();
      if (pwaTabsEnabled) {
        openSessionTab(targetPaneId);
        return;
      }
      const encoded = encodeURIComponent(targetPaneId);
      window.open(`/sessions/${encoded}`, "_blank", "noopener,noreferrer");
    },
    [closeLogModal, closeQuickPanel, openSessionTab, pwaTabsEnabled],
  );

  const handleOpenInNewTab = useCallback(() => {
    if (!selectedPaneId) return;
    handleOpenPaneInNewWindow(selectedPaneId);
  }, [handleOpenPaneInNewWindow, selectedPaneId]);

  const handleTouchSession = useCallback(() => {
    void touchSession(paneId).catch(() => null);
  }, [paneId, touchSession]);

  const handleTouchPane = useCallback(
    (targetPaneId: string) => {
      void touchSession(targetPaneId).catch(() => null);
    },
    [touchSession],
  );

  const handleFocusPane = useCallback(
    async (targetPaneId: string) => {
      const result = await focusPane(targetPaneId);
      if (!result.ok) {
        setScreenError(result.error?.message ?? API_ERROR_MESSAGES.focusPane);
      }
    },
    [focusPane, setScreenError],
  );

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

  return {
    handleOpenPaneInNewWindow,
    handleOpenInNewTab,
    handleTouchSession,
    handleTouchPane,
    handleFocusPane,
    handleOpenPaneHere,
    handleOpenHere,
  };
};

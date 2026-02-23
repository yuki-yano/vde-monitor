import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { WorkspaceTabsDisplayMode } from "@vde-monitor/shared";
import { useAtomValue } from "jotai";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { isPwaDisplayMode, PWA_DISPLAY_MODE_QUERIES } from "@/lib/pwa-display-mode";
import { sessionWorkspaceTabsDisplayModeAtom } from "@/state/session-state-atoms";

import {
  activateWorkspaceTab,
  closeWorkspaceTab,
  createInitialWorkspaceTabsState,
  deserializeWorkspaceTabsState,
  dismissWorkspaceSessionTabByPaneId,
  reorderWorkspaceTabs,
  reorderWorkspaceTabsByClosableOrder,
  resolveWorkspaceTabPath,
  serializeWorkspaceTabsState,
  syncWorkspaceTabsWithPathname,
  SYSTEM_CHAT_GRID_TAB_ID,
  SYSTEM_USAGE_TAB_ID,
  WORKSPACE_TABS_STORAGE_KEY,
  type WorkspaceTab,
  type WorkspaceTabsState,
} from "../model/workspace-tabs";
import {
  isWorkspaceTabsMobileViewport,
  resolveWorkspaceTabsEnabled,
  WORKSPACE_TABS_MOBILE_MEDIA_QUERY,
} from "../model/workspace-tabs-visibility";

type WorkspaceTabsContextValue = {
  enabled: boolean;
  activeTabId: string;
  tabs: WorkspaceTab[];
  openSessionTab: (paneId: string) => void;
  activateTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  dismissSessionTab: (paneId: string) => void;
  reorderTabs: (activeTabId: string, overTabId: string) => void;
  reorderTabsByClosableOrder: (orderedClosableTabIds: string[]) => void;
};

const WorkspaceTabsContext = createContext<WorkspaceTabsContextValue | null>(null);
const WORKSPACE_TABS_FALLBACK: WorkspaceTabsContextValue = {
  enabled: false,
  activeTabId: "system:sessions",
  tabs: [],
  openSessionTab: () => undefined,
  activateTab: () => undefined,
  closeTab: () => undefined,
  dismissSessionTab: () => undefined,
  reorderTabs: () => undefined,
  reorderTabsByClosableOrder: () => undefined,
};

const buildInitialState = (displayMode: WorkspaceTabsDisplayMode): WorkspaceTabsState => {
  const now = Date.now();
  if (typeof window === "undefined") {
    return createInitialWorkspaceTabsState(now);
  }
  if (
    !resolveWorkspaceTabsEnabled({
      displayMode,
      pwaDisplayMode: isPwaDisplayMode(),
      mobileViewport: isWorkspaceTabsMobileViewport(),
    })
  ) {
    return createInitialWorkspaceTabsState(now);
  }
  return (
    deserializeWorkspaceTabsState(window.localStorage.getItem(WORKSPACE_TABS_STORAGE_KEY), now) ??
    createInitialWorkspaceTabsState(now)
  );
};

export const WorkspaceTabsProvider = ({ children }: PropsWithChildren) => {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const workspaceTabsDisplayMode = useAtomValue(sessionWorkspaceTabsDisplayModeAtom);
  const [enabled, setEnabled] = useState(() =>
    resolveWorkspaceTabsEnabled({
      displayMode: workspaceTabsDisplayMode,
      pwaDisplayMode: isPwaDisplayMode(),
      mobileViewport: isWorkspaceTabsMobileViewport(),
    }),
  );
  const [tabsState, setTabsState] = useState<WorkspaceTabsState>(() =>
    buildInitialState(workspaceTabsDisplayMode),
  );

  const navigateToWorkspaceTab = useCallback(
    (tab: WorkspaceTab) => {
      if (tab.kind === "session" && tab.paneId != null) {
        void navigate({
          to: "/sessions/$paneId",
          params: { paneId: tab.paneId },
        });
        return;
      }
      if (tab.id === SYSTEM_CHAT_GRID_TAB_ID) {
        void navigate({ to: "/chat-grid" });
        return;
      }
      if (tab.id === SYSTEM_USAGE_TAB_ID) {
        void navigate({ to: "/usage" });
        return;
      }
      void navigate({ href: "/" });
    },
    [navigate],
  );

  useEffect(() => {
    const update = () => {
      setEnabled(
        resolveWorkspaceTabsEnabled({
          displayMode: workspaceTabsDisplayMode,
          pwaDisplayMode: isPwaDisplayMode(),
          mobileViewport: isWorkspaceTabsMobileViewport(),
        }),
      );
    };
    update();
    const mediaList = [...PWA_DISPLAY_MODE_QUERIES, WORKSPACE_TABS_MOBILE_MEDIA_QUERY]
      .map((query) => window.matchMedia?.(query))
      .filter((candidate): candidate is MediaQueryList => candidate != null);
    mediaList.forEach((media) => {
      media.addEventListener?.("change", update);
    });
    window.addEventListener("pageshow", update);
    window.addEventListener("focus", update);
    return () => {
      mediaList.forEach((media) => {
        media.removeEventListener?.("change", update);
      });
      window.removeEventListener("pageshow", update);
      window.removeEventListener("focus", update);
    };
  }, [workspaceTabsDisplayMode]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    setTabsState((previous) => syncWorkspaceTabsWithPathname(previous, pathname, Date.now()));
  }, [enabled, pathname]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    window.localStorage.setItem(WORKSPACE_TABS_STORAGE_KEY, serializeWorkspaceTabsState(tabsState));
  }, [enabled, tabsState]);

  const openSessionTab = useCallback(
    (paneId: string) => {
      if (!enabled) {
        return;
      }
      const normalizedPaneId = paneId.trim();
      if (normalizedPaneId.length === 0) {
        return;
      }
      void navigate({
        to: "/sessions/$paneId",
        params: { paneId: normalizedPaneId },
      });
    },
    [enabled, navigate],
  );

  const activateTab = useCallback(
    (tabId: string) => {
      if (!enabled) {
        return;
      }
      let targetTab: WorkspaceTab | null = null;
      setTabsState((previous) => {
        targetTab = previous.tabs.find((tab) => tab.id === tabId) ?? null;
        if (!targetTab) {
          return previous;
        }
        return activateWorkspaceTab(previous, tabId, Date.now());
      });
      if (targetTab) {
        navigateToWorkspaceTab(targetTab);
      }
    },
    [enabled, navigateToWorkspaceTab],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      if (!enabled) {
        return;
      }
      let shouldNavigate = false;
      let nextActiveTab: WorkspaceTab | null = null;
      setTabsState((previous) => {
        const closed = closeWorkspaceTab(previous, tabId, Date.now());
        if (!closed.changed) {
          return previous;
        }
        shouldNavigate = previous.activeTabId === tabId;
        nextActiveTab =
          closed.state.tabs.find((tab) => tab.id === closed.state.activeTabId) ??
          closed.state.tabs.find((tab) => resolveWorkspaceTabPath(tab) === pathname) ??
          null;
        return closed.state;
      });
      if (shouldNavigate && nextActiveTab) {
        navigateToWorkspaceTab(nextActiveTab);
      }
    },
    [enabled, navigateToWorkspaceTab, pathname],
  );

  const dismissSessionTab = useCallback(
    (paneId: string) => {
      if (!enabled) {
        return;
      }
      const normalizedPaneId = paneId.trim();
      if (normalizedPaneId.length === 0) {
        return;
      }
      setTabsState((previous) => {
        const dismissed = dismissWorkspaceSessionTabByPaneId(
          previous,
          normalizedPaneId,
          Date.now(),
        );
        if (!dismissed.changed) {
          return previous;
        }
        return dismissed.state;
      });
    },
    [enabled],
  );

  const reorderTabs = useCallback(
    (activeTabId: string, overTabId: string) => {
      if (!enabled) {
        return;
      }
      setTabsState((previous) => reorderWorkspaceTabs(previous, activeTabId, overTabId));
    },
    [enabled],
  );

  const reorderTabsByClosableOrder = useCallback(
    (orderedClosableTabIds: string[]) => {
      if (!enabled) {
        return;
      }
      setTabsState((previous) =>
        reorderWorkspaceTabsByClosableOrder(previous, orderedClosableTabIds),
      );
    },
    [enabled],
  );

  const value = useMemo<WorkspaceTabsContextValue>(
    () => ({
      enabled,
      activeTabId: tabsState.activeTabId,
      tabs: tabsState.tabs,
      openSessionTab,
      activateTab,
      closeTab,
      dismissSessionTab,
      reorderTabs,
      reorderTabsByClosableOrder,
    }),
    [
      activateTab,
      closeTab,
      dismissSessionTab,
      enabled,
      openSessionTab,
      reorderTabs,
      reorderTabsByClosableOrder,
      tabsState,
    ],
  );

  return <WorkspaceTabsContext.Provider value={value}>{children}</WorkspaceTabsContext.Provider>;
};

export const useWorkspaceTabs = () => {
  const context = useContext(WorkspaceTabsContext);
  return context ?? WORKSPACE_TABS_FALLBACK;
};

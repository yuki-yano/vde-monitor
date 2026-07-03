import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { WorkspaceTabsDisplayMode } from "@vde-monitor/shared";
import { useAtomValue } from "jotai";
import {
  type PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { PWA_DISPLAY_MODE_QUERIES, isPwaDisplayMode } from "@/lib/pwa-display-mode";
import { useSessionData } from "@/state/session-context";
import { sessionWorkspaceTabsDisplayModeAtom } from "@/state/session-state-atoms";

import {
  SYSTEM_CHAT_GRID_TAB_ID,
  SYSTEM_USAGE_TAB_ID,
  WORKSPACE_TABS_STORAGE_KEY,
  type WorkspaceTab,
  type WorkspaceTabsState,
  activateWorkspaceTab,
  closeWorkspaceTab,
  createInitialWorkspaceTabsState,
  deserializeWorkspaceTabsState,
  dismissWorkspaceSessionTabByPaneId,
  dismissWorkspaceSessionTabsByPaneIds,
  reorderWorkspaceTabs,
  reorderWorkspaceTabsByClosableOrder,
  resolveWorkspaceTabPath,
  serializeWorkspaceTabsState,
  syncWorkspaceTabsWithPathname,
} from "../model/workspace-tabs";
import {
  WORKSPACE_TABS_MOBILE_MEDIA_QUERY,
  isWorkspaceTabsMobileViewport,
  resolveWorkspaceTabsEnabled,
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

// Grace period before auto-closing a tab whose pane is missing from the live
// session list: a freshly launched pane can take a moment to show up there.
const MISSING_PANE_TAB_DISMISS_GRACE_MS = 5000;

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
  const { sessions, connected } = useSessionData();
  const [missingPaneCheckTick, setMissingPaneCheckTick] = useState(0);
  const missingPaneSinceRef = useRef(new Map<string, number>());
  const livePaneIds = useMemo(() => new Set(sessions.map((session) => session.paneId)), [sessions]);

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

  const dismissSessionTabsByPaneIds = useCallback(
    (paneIds: string[]) => {
      let shouldNavigate = false;
      let nextActiveTab: WorkspaceTab | null = null;
      setTabsState((previous) => {
        const dismissed = dismissWorkspaceSessionTabsByPaneIds(previous, paneIds, Date.now());
        if (!dismissed.changed) {
          return previous;
        }
        shouldNavigate = dismissed.state.activeTabId !== previous.activeTabId;
        nextActiveTab =
          dismissed.state.tabs.find((tab) => tab.id === dismissed.state.activeTabId) ?? null;
        return dismissed.state;
      });
      if (shouldNavigate && nextActiveTab) {
        navigateToWorkspaceTab(nextActiveTab);
      }
    },
    [navigateToWorkspaceTab],
  );

  // Auto-close session tabs whose pane no longer exists (e.g. the pane was
  // killed while the PWA was closed). Panes must stay missing for the grace
  // period before their tabs are dismissed.
  useEffect(() => {
    const missingSince = missingPaneSinceRef.current;
    if (!enabled || !connected) {
      missingSince.clear();
      return;
    }
    const missingPaneIds = tabsState.tabs
      .filter(
        (tab): tab is WorkspaceTab & { paneId: string } =>
          tab.kind === "session" &&
          tab.closable &&
          tab.paneId != null &&
          !livePaneIds.has(tab.paneId),
      )
      .map((tab) => tab.paneId);
    const missingPaneIdSet = new Set(missingPaneIds);
    [...missingSince.keys()].forEach((paneId) => {
      if (!missingPaneIdSet.has(paneId)) {
        missingSince.delete(paneId);
      }
    });
    if (missingPaneIds.length === 0) {
      return;
    }
    const now = Date.now();
    missingPaneIds.forEach((paneId) => {
      if (!missingSince.has(paneId)) {
        missingSince.set(paneId, now);
      }
    });
    const expiredPaneIds = missingPaneIds.filter(
      (paneId) => now - (missingSince.get(paneId) ?? now) >= MISSING_PANE_TAB_DISMISS_GRACE_MS,
    );
    if (expiredPaneIds.length > 0) {
      expiredPaneIds.forEach((paneId) => {
        missingSince.delete(paneId);
      });
      dismissSessionTabsByPaneIds(expiredPaneIds);
      return;
    }
    const earliestMissingAt = Math.min(
      ...missingPaneIds.map((paneId) => missingSince.get(paneId) ?? now),
    );
    const timer = window.setTimeout(
      () => {
        setMissingPaneCheckTick((tick) => tick + 1);
      },
      Math.max(earliestMissingAt + MISSING_PANE_TAB_DISMISS_GRACE_MS - now, 0) + 50,
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [
    connected,
    dismissSessionTabsByPaneIds,
    enabled,
    livePaneIds,
    missingPaneCheckTick,
    tabsState.tabs,
  ]);

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

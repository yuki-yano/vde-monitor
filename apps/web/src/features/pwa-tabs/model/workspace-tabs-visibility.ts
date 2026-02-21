import type { WorkspaceTabsDisplayMode } from "@vde-monitor/shared";

export const WORKSPACE_TABS_MOBILE_MEDIA_QUERY = "(max-width: 767px)";

export const isWorkspaceTabsMobileViewport = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  if (typeof window.matchMedia === "function") {
    return window.matchMedia(WORKSPACE_TABS_MOBILE_MEDIA_QUERY).matches;
  }
  return window.innerWidth <= 767;
};

export const resolveWorkspaceTabsEnabled = ({
  displayMode,
  pwaDisplayMode,
  mobileViewport,
}: {
  displayMode: WorkspaceTabsDisplayMode;
  pwaDisplayMode: boolean;
  mobileViewport: boolean;
}): boolean => {
  if (!mobileViewport) {
    return false;
  }
  if (displayMode === "none") {
    return false;
  }
  if (displayMode === "all") {
    return true;
  }
  return pwaDisplayMode;
};

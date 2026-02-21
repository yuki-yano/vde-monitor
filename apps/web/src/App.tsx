import { Outlet } from "@tanstack/react-router";
import PullToRefresh from "react-simple-pull-to-refresh";

import { Spinner } from "@/components/ui";
import { AuthGate } from "@/features/auth/AuthGate";
import { PwaWorkspaceTabs } from "@/features/pwa-tabs/components/PwaWorkspaceTabs";
import {
  useWorkspaceTabs,
  WorkspaceTabsProvider,
} from "@/features/pwa-tabs/context/workspace-tabs-context";
import {
  isIosPwaPullToRefreshEnabled,
  resolvePullToRefreshEnvironment,
} from "@/lib/pull-to-refresh-env";
import { SessionProvider } from "@/state/session-context";
import { ThemeProvider } from "@/state/theme-context";

const PULL_TO_REFRESH_LOADING_MS = 360;
const PWA_TABS_OFFSET_STYLE = "var(--vde-pwa-tabs-offset, calc(env(safe-area-inset-top) + 3.8rem))";

const AppShell = () => {
  const { enabled: workspaceTabsEnabled } = useWorkspaceTabs();
  const enablePullToRefresh = isIosPwaPullToRefreshEnabled(resolvePullToRefreshEnvironment());
  const outlet = (
    <div style={workspaceTabsEnabled ? { paddingTop: PWA_TABS_OFFSET_STYLE } : undefined}>
      <Outlet />
    </div>
  );

  const content = enablePullToRefresh ? (
    <PullToRefresh
      onRefresh={async () => {
        await new Promise<void>((resolve) => {
          window.setTimeout(() => {
            resolve();
          }, PULL_TO_REFRESH_LOADING_MS);
        });
        window.location.reload();
      }}
      pullDownThreshold={72}
      maxPullDownDistance={108}
      resistance={1.2}
      backgroundColor="transparent"
      pullingContent={<></>}
      refreshingContent={
        <div className="bg-latte-base/45 pointer-events-none fixed inset-0 z-[120] flex items-center justify-center backdrop-blur-md">
          <Spinner size="md" className="h-10 w-10" />
        </div>
      }
    >
      {outlet}
    </PullToRefresh>
  ) : (
    outlet
  );

  return (
    <>
      <PwaWorkspaceTabs />
      {content}
    </>
  );
};

const App = () => {
  return (
    <ThemeProvider>
      <SessionProvider>
        <WorkspaceTabsProvider>
          <AuthGate>
            <AppShell />
          </AuthGate>
        </WorkspaceTabsProvider>
      </SessionProvider>
    </ThemeProvider>
  );
};

export default App;

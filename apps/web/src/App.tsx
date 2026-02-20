import { Outlet } from "@tanstack/react-router";
import PullToRefresh from "react-simple-pull-to-refresh";

import { Spinner } from "@/components/ui";
import { AuthGate } from "@/features/auth/AuthGate";
import {
  isIosPwaPullToRefreshEnabled,
  resolvePullToRefreshEnvironment,
} from "@/lib/pull-to-refresh-env";
import { SessionProvider } from "@/state/session-context";
import { ThemeProvider } from "@/state/theme-context";

const PULL_TO_REFRESH_LOADING_MS = 360;

const App = () => {
  const enablePullToRefresh = isIosPwaPullToRefreshEnabled(resolvePullToRefreshEnvironment());
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
      <Outlet />
    </PullToRefresh>
  ) : (
    <Outlet />
  );

  return (
    <ThemeProvider>
      <SessionProvider>
        <AuthGate>{content}</AuthGate>
      </SessionProvider>
    </ThemeProvider>
  );
};

export default App;

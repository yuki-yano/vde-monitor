import { type ReactNode, useMemo } from "react";

import { useSessionConfigData, useSessionCoreApi } from "@/state/session-context";

import { TokenInputBanner } from "./TokenInputBanner";

export const AuthGate = ({ children }: { children: ReactNode }) => {
  const { authError } = useSessionConfigData();
  const { setToken, reconnect } = useSessionCoreApi();
  const shouldBlock = useMemo(() => authError != null, [authError]);

  if (!shouldBlock) {
    return <>{children}</>;
  }

  return (
    <div className="bg-latte-base flex min-h-screen items-start justify-center px-3 pb-8 pt-8 sm:px-6 sm:pt-14">
      <TokenInputBanner
        authError={authError}
        onSubmit={(nextToken) => {
          setToken(nextToken);
          reconnect();
        }}
      />
    </div>
  );
};

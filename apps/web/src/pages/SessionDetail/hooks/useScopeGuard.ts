import type { MutableRefObject } from "react";
import { useCallback, useEffect, useRef } from "react";

import { useVisibilityPolling } from "@/lib/use-visibility-polling";

type UseScopeGuardParams = {
  paneId: string;
  worktreePath?: string | null;
  branch?: string | null;
  connected: boolean;
  /**
   * Ref to the callback invoked when the connection transitions from
   * disconnected → connected. Update this ref after defining your load
   * callbacks so the latest version is always called.
   */
  onReconnectRef: MutableRefObject<() => void>;
  /**
   * Ref to the callback invoked on each visibility-polling tick. Update this
   * ref after defining your poll callbacks so the latest version is always called.
   */
  pollTickRef: MutableRefObject<() => void>;
  pollIntervalMs: number;
};

type UseScopeGuardResult = {
  /** `${paneId}:${worktreePath ?? "__default__"}:${branch ?? "__no_branch__"}` */
  scopeKey: string;
  /** Ref whose `.current` is always the latest scopeKey. */
  activeScopeRef: MutableRefObject<string>;
};

/**
 * Thin hook that centralises the scope-key computation, activeScopeRef
 * maintenance, reconnection effect, and visibility polling shared across
 * useSessionCommits and useSessionDiffs.
 *
 * Business logic (state machines, module-level caches, etc.) is intentionally
 * kept out of this hook.
 */
export const useScopeGuard = ({
  paneId,
  worktreePath = null,
  branch = null,
  connected,
  onReconnectRef,
  pollTickRef,
  pollIntervalMs,
}: UseScopeGuardParams): UseScopeGuardResult => {
  const scopeKey = `${paneId}:${worktreePath ?? "__default__"}:${branch ?? "__no_branch__"}`;
  const activeScopeRef = useRef(scopeKey);
  const prevConnectedRef = useRef<boolean | null>(null);

  // Keep activeScopeRef in sync on every render so guards in async callbacks
  // always see the latest scope.
  activeScopeRef.current = scopeKey;

  // Re-fetch when the connection is restored after a disconnect.
  useEffect(() => {
    if (prevConnectedRef.current === false && connected) {
      onReconnectRef.current();
    }
    prevConnectedRef.current = connected;
  }, [connected, onReconnectRef]);

  // Stable wrapper so useVisibilityPolling receives a referentially-stable
  // onTick even though pollTickRef.current is updated each render.
  const pollTickWrapper = useCallback(() => {
    pollTickRef.current();
  }, [pollTickRef]);

  useVisibilityPolling({
    enabled: Boolean(paneId) && connected,
    intervalMs: pollIntervalMs,
    onTick: pollTickWrapper,
  });

  return { scopeKey, activeScopeRef };
};

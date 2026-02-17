import type { MutableRefObject } from "react";

export const createNextRequestId = (requestIdRef: MutableRefObject<number>) => {
  const requestId = requestIdRef.current + 1;
  requestIdRef.current = requestId;
  return requestId;
};

export const isCurrentRequest = (requestIdRef: MutableRefObject<number>, requestId: number) =>
  requestIdRef.current === requestId;

export const isCurrentScopedRequest = ({
  requestIdRef,
  requestId,
  activeScopeRef,
  scopeKey,
}: {
  requestIdRef: MutableRefObject<number>;
  requestId: number;
  activeScopeRef: MutableRefObject<string>;
  scopeKey: string;
}) => isCurrentRequest(requestIdRef, requestId) && activeScopeRef.current === scopeKey;

export const isCurrentPaneRequest = ({
  requestIdRef,
  requestId,
  activePaneIdRef,
  paneId,
}: {
  requestIdRef: MutableRefObject<number>;
  requestId: number;
  activePaneIdRef: MutableRefObject<string>;
  paneId: string;
}) => isCurrentRequest(requestIdRef, requestId) && activePaneIdRef.current === paneId;

type GuardedRequestLifecycle = {
  requestId: number;
  isCurrent: () => boolean;
};

type GuardedRequestParams<T> = {
  requestIdRef: MutableRefObject<number>;
  isCurrentRequest: (requestId: number) => boolean;
  run: () => Promise<T>;
  onSuccess?: (value: T, lifecycle: GuardedRequestLifecycle) => void | Promise<void>;
  onError?: (error: unknown, lifecycle: GuardedRequestLifecycle) => void | Promise<void>;
  onSettled?: (lifecycle: GuardedRequestLifecycle) => void | Promise<void>;
};

const runGuardedRequest = async <T>({
  requestIdRef,
  isCurrentRequest,
  run,
  onSuccess,
  onError,
  onSettled,
}: GuardedRequestParams<T>) => {
  const requestId = createNextRequestId(requestIdRef);
  const lifecycle: GuardedRequestLifecycle = {
    requestId,
    isCurrent: () => isCurrentRequest(requestId),
  };

  try {
    const value = await run();
    if (!lifecycle.isCurrent()) {
      return;
    }
    await onSuccess?.(value, lifecycle);
  } catch (error) {
    if (!lifecycle.isCurrent()) {
      return;
    }
    await onError?.(error, lifecycle);
  } finally {
    await onSettled?.(lifecycle);
  }
};

type RunScopedRequestParams<T> = {
  requestIdRef: MutableRefObject<number>;
  activeScopeRef: MutableRefObject<string>;
  scopeKey: string;
  run: () => Promise<T>;
  onSuccess?: (value: T, lifecycle: GuardedRequestLifecycle) => void | Promise<void>;
  onError?: (error: unknown, lifecycle: GuardedRequestLifecycle) => void | Promise<void>;
  onSettled?: (lifecycle: GuardedRequestLifecycle) => void | Promise<void>;
};

export const runScopedRequest = async <T>({
  requestIdRef,
  activeScopeRef,
  scopeKey,
  run,
  onSuccess,
  onError,
  onSettled,
}: RunScopedRequestParams<T>) =>
  runGuardedRequest({
    requestIdRef,
    isCurrentRequest: (requestId) =>
      isCurrentScopedRequest({
        requestIdRef,
        requestId,
        activeScopeRef,
        scopeKey,
      }),
    run,
    onSuccess,
    onError,
    onSettled,
  });

type RunPaneRequestParams<T> = {
  requestIdRef: MutableRefObject<number>;
  activePaneIdRef: MutableRefObject<string>;
  paneId: string;
  run: () => Promise<T>;
  onSuccess?: (value: T, lifecycle: GuardedRequestLifecycle) => void | Promise<void>;
  onError?: (error: unknown, lifecycle: GuardedRequestLifecycle) => void | Promise<void>;
  onSettled?: (lifecycle: GuardedRequestLifecycle) => void | Promise<void>;
};

export const runPaneRequest = async <T>({
  requestIdRef,
  activePaneIdRef,
  paneId,
  run,
  onSuccess,
  onError,
  onSettled,
}: RunPaneRequestParams<T>) =>
  runGuardedRequest({
    requestIdRef,
    isCurrentRequest: (requestId) =>
      isCurrentPaneRequest({
        requestIdRef,
        requestId,
        activePaneIdRef,
        paneId,
      }),
    run,
    onSuccess,
    onError,
    onSettled,
  });

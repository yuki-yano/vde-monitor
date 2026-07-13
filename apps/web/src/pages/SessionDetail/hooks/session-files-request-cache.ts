import type { MutableRefObject } from "react";

type FetchWithRequestMapInput<T> = {
  requestMapRef: MutableRefObject<Map<string, Promise<T>>>;
  requestKey: string;
  requestFactory: () => Promise<T>;
};

export const fetchWithRequestMap = async <T>({
  requestMapRef,
  requestKey,
  requestFactory,
}: FetchWithRequestMapInput<T>) => {
  const inFlight = requestMapRef.current.get(requestKey);
  if (inFlight) {
    return inFlight;
  }
  const request = requestFactory();
  requestMapRef.current.set(requestKey, request);
  try {
    return await request;
  } finally {
    requestMapRef.current.delete(requestKey);
  }
};

export const buildTreePageRequestKey = (
  requestScopeId: string,
  targetPath: string,
  cursor?: string,
) => `${requestScopeId}:${targetPath}:${cursor ?? ""}`;

export const buildSearchRequestKey = (requestScopeId: string, query: string, cursor?: string) =>
  `${requestScopeId}:${query}:${cursor ?? ""}`;

export const buildFileContentRequestKey = (
  requestScopeId: string,
  path: string,
  maxBytes: number,
) => `${requestScopeId}:${path}:${maxBytes}`;

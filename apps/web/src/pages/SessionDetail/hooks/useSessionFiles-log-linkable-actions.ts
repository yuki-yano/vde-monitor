import { type MutableRefObject, useCallback } from "react";

import { normalizeLogReference } from "../log-file-reference";
import {
  buildLogReferenceLinkableCacheKey,
  resolveLogReferenceLinkableWithCache,
} from "./useSessionFiles-log-linkable-cache";
import type { LogFileCandidateItem } from "./useSessionFiles-log-resolve-state";

type UseSessionFilesLogLinkableActionsArgs = {
  hasExactPathMatch: (args: {
    paneId: string;
    path: string;
    limitPerPage: number;
    requestId?: number;
  }) => Promise<boolean | null>;
  findExactNameMatches: (args: {
    paneId: string;
    filename: string;
    maxMatches: number;
    limitPerPage: number;
    requestId?: number;
  }) => Promise<LogFileCandidateItem[] | null>;
  logReferenceLinkableCacheRef: MutableRefObject<Map<string, boolean>>;
  logReferenceLinkableRequestMapRef: MutableRefObject<Map<string, Promise<boolean>>>;
  logReferenceLinkableCacheMax: number;
  logFileResolvePageLimit: number;
};

export const useSessionFilesLogLinkableActions = ({
  hasExactPathMatch,
  findExactNameMatches,
  logReferenceLinkableCacheRef,
  logReferenceLinkableRequestMapRef,
  logReferenceLinkableCacheMax,
  logFileResolvePageLimit,
}: UseSessionFilesLogLinkableActionsArgs) => {
  const isLogFileReferenceLinkable = useCallback(
    async ({
      rawToken,
      sourcePaneId,
      sourceRepoRoot,
    }: {
      rawToken: string;
      sourcePaneId: string;
      sourceRepoRoot: string | null;
    }): Promise<boolean> => {
      if (sourcePaneId.trim().length === 0) {
        return false;
      }
      const reference = normalizeLogReference(rawToken, {
        sourceRepoRoot,
      });
      if (reference.kind === "unknown") {
        return false;
      }
      const cacheKey = buildLogReferenceLinkableCacheKey({
        sourcePaneId,
        sourceRepoRoot,
        kind: reference.kind,
        normalizedPath: reference.normalizedPath,
        filename: reference.filename,
        display: reference.display,
      });
      return resolveLogReferenceLinkableWithCache({
        cacheRef: logReferenceLinkableCacheRef,
        requestMapRef: logReferenceLinkableRequestMapRef,
        cacheKey,
        cacheMaxSize: logReferenceLinkableCacheMax,
        resolve: async () => {
          if (reference.normalizedPath) {
            try {
              const pathMatched = await hasExactPathMatch({
                paneId: sourcePaneId,
                path: reference.normalizedPath,
                limitPerPage: logFileResolvePageLimit,
              });
              if (pathMatched === true) {
                return true;
              }
            } catch {
              // path resolve failed; continue to filename fallback
            }
          }

          if (!reference.filename) {
            return false;
          }

          try {
            const matches = await findExactNameMatches({
              paneId: sourcePaneId,
              filename: reference.filename,
              maxMatches: 1,
              limitPerPage: logFileResolvePageLimit,
            });
            return (matches?.length ?? 0) > 0;
          } catch {
            return false;
          }
        },
      });
    },
    [
      findExactNameMatches,
      hasExactPathMatch,
      logFileResolvePageLimit,
      logReferenceLinkableCacheMax,
      logReferenceLinkableCacheRef,
      logReferenceLinkableRequestMapRef,
    ],
  );

  const onResolveLogFileReferenceCandidates = useCallback(
    async ({
      rawTokens,
      sourcePaneId,
      sourceRepoRoot,
    }: {
      rawTokens: string[];
      sourcePaneId: string;
      sourceRepoRoot: string | null;
    }) => {
      const uniqueTokens = Array.from(
        new Set(rawTokens.filter((token) => token.trim().length > 0)),
      );
      if (uniqueTokens.length === 0 || sourcePaneId.trim().length === 0) {
        return [] as string[];
      }

      const linkableRawTokenSet = new Set<string>();
      const pendingRawTokens: string[] = [];

      uniqueTokens.forEach((rawToken) => {
        const reference = normalizeLogReference(rawToken, {
          sourceRepoRoot,
        });
        if (reference.kind === "unknown") {
          return;
        }
        const cacheKey = buildLogReferenceLinkableCacheKey({
          sourcePaneId,
          sourceRepoRoot,
          kind: reference.kind,
          normalizedPath: reference.normalizedPath,
          filename: reference.filename,
          display: reference.display,
        });
        const cached = logReferenceLinkableCacheRef.current.get(cacheKey);
        if (cached != null) {
          if (cached) {
            linkableRawTokenSet.add(rawToken);
          }
          return;
        }
        pendingRawTokens.push(rawToken);
      });

      if (pendingRawTokens.length > 0) {
        const resolvedTokens = await Promise.all(
          pendingRawTokens.map(async (rawToken) => {
            try {
              const linkable = await isLogFileReferenceLinkable({
                rawToken,
                sourcePaneId,
                sourceRepoRoot,
              });
              return linkable ? rawToken : null;
            } catch {
              return null;
            }
          }),
        );
        resolvedTokens.forEach((rawToken) => {
          if (rawToken) {
            linkableRawTokenSet.add(rawToken);
          }
        });
      }

      return uniqueTokens.filter((token) => linkableRawTokenSet.has(token));
    },
    [isLogFileReferenceLinkable, logReferenceLinkableCacheRef],
  );

  return {
    isLogFileReferenceLinkable,
    onResolveLogFileReferenceCandidates,
  };
};

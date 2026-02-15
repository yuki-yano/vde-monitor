import type { RepoFileSearchPage } from "@vde-monitor/shared";
import { type MutableRefObject, useCallback } from "react";

import type { LogFileCandidateItem } from "./useSessionFiles-log-resolve-state";

type UseSessionFilesLogResolveSearchArgs = {
  resolveWorktreePathForPane: (targetPaneId: string) => string | undefined;
  requestRepoFileSearch: (
    paneId: string,
    query: string,
    options?: { cursor?: string; limit?: number; worktreePath?: string },
  ) => Promise<RepoFileSearchPage>;
  activeLogResolveRequestIdRef: MutableRefObject<number>;
  logFileResolveMaxSearchPages: number;
  logFileResolvePageLimit: number;
  openFileModalByPath: (
    targetPath: string,
    options: {
      paneId: string;
      origin: "navigator" | "log";
      highlightLine?: number | null;
    },
  ) => void;
};

export const useSessionFilesLogResolveSearch = ({
  resolveWorktreePathForPane,
  requestRepoFileSearch,
  activeLogResolveRequestIdRef,
  logFileResolveMaxSearchPages,
  logFileResolvePageLimit,
  openFileModalByPath,
}: UseSessionFilesLogResolveSearchArgs) => {
  const hasExactPathMatch = useCallback(
    async ({
      paneId: targetPaneId,
      path,
      limitPerPage,
      requestId,
    }: {
      paneId: string;
      path: string;
      limitPerPage: number;
      requestId?: number;
    }): Promise<boolean | null> => {
      let cursor: string | undefined = undefined;
      let pageCount = 0;
      const visitedCursors = new Set<string>();

      while (pageCount < logFileResolveMaxSearchPages) {
        if (requestId != null && activeLogResolveRequestIdRef.current !== requestId) {
          return null;
        }
        const page = await requestRepoFileSearch(targetPaneId, path, {
          cursor,
          limit: limitPerPage,
          ...(resolveWorktreePathForPane(targetPaneId)
            ? { worktreePath: resolveWorktreePathForPane(targetPaneId) }
            : {}),
        });
        pageCount += 1;
        if (requestId != null && activeLogResolveRequestIdRef.current !== requestId) {
          return null;
        }

        const hasMatch = page.items.some((item) => item.kind === "file" && item.path === path);
        if (hasMatch) {
          return true;
        }

        if (!page.nextCursor) {
          return false;
        }
        if (visitedCursors.has(page.nextCursor)) {
          return false;
        }
        visitedCursors.add(page.nextCursor);
        cursor = page.nextCursor;
      }

      return false;
    },
    [
      activeLogResolveRequestIdRef,
      logFileResolveMaxSearchPages,
      requestRepoFileSearch,
      resolveWorktreePathForPane,
    ],
  );

  const findExactNameMatches = useCallback(
    async ({
      paneId: targetPaneId,
      filename,
      maxMatches,
      limitPerPage,
      requestId,
    }: {
      paneId: string;
      filename: string;
      maxMatches: number;
      limitPerPage: number;
      requestId?: number;
    }): Promise<LogFileCandidateItem[] | null> => {
      const matches: LogFileCandidateItem[] = [];
      const knownPaths = new Set<string>();
      let cursor: string | undefined = undefined;

      while (matches.length < maxMatches) {
        if (requestId != null && activeLogResolveRequestIdRef.current !== requestId) {
          return null;
        }
        const page = await requestRepoFileSearch(targetPaneId, filename, {
          cursor,
          limit: limitPerPage,
          ...(resolveWorktreePathForPane(targetPaneId)
            ? { worktreePath: resolveWorktreePathForPane(targetPaneId) }
            : {}),
        });
        if (requestId != null && activeLogResolveRequestIdRef.current !== requestId) {
          return null;
        }
        page.items.forEach((item) => {
          if (item.kind !== "file" || item.name !== filename || knownPaths.has(item.path)) {
            return;
          }
          knownPaths.add(item.path);
          matches.push({
            path: item.path,
            name: item.name,
            isIgnored: item.isIgnored,
          });
        });
        if (!page.nextCursor) {
          break;
        }
        cursor = page.nextCursor;
      }

      return matches.slice(0, maxMatches);
    },
    [activeLogResolveRequestIdRef, requestRepoFileSearch, resolveWorktreePathForPane],
  );

  const tryOpenExistingPath = useCallback(
    async ({
      paneId: targetPaneId,
      path,
      requestId,
      highlightLine,
    }: {
      paneId: string;
      path: string;
      requestId: number;
      highlightLine?: number | null;
    }) => {
      try {
        const exists = await hasExactPathMatch({
          paneId: targetPaneId,
          path,
          requestId,
          limitPerPage: logFileResolvePageLimit,
        });
        if (!exists) {
          return false;
        }
      } catch {
        return false;
      }
      if (activeLogResolveRequestIdRef.current !== requestId) {
        return false;
      }
      openFileModalByPath(path, {
        paneId: targetPaneId,
        origin: "log",
        highlightLine,
      });
      return true;
    },
    [activeLogResolveRequestIdRef, hasExactPathMatch, logFileResolvePageLimit, openFileModalByPath],
  );

  return {
    hasExactPathMatch,
    findExactNameMatches,
    tryOpenExistingPath,
  };
};

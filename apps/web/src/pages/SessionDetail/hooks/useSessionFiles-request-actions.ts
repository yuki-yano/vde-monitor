import type { RepoFileContent, RepoFileSearchPage } from "@vde-monitor/shared";
import { type MutableRefObject, useCallback } from "react";

import {
  buildFileContentRequestKey,
  buildSearchRequestKey,
  fetchWithRequestMap,
} from "./useSessionFiles-request-cache";

type UseSessionFilesRequestActionsArgs = {
  paneId: string;
  requestScopeId: string;
  worktreePath: string | null;
  searchPageLimit: number;
  fileContentMaxBytes: number;
  resolveWorktreePathForPane: (targetPaneId: string) => string | undefined;
  requestRepoFileSearch: (
    paneId: string,
    query: string,
    options?: { cursor?: string; limit?: number; worktreePath?: string },
  ) => Promise<RepoFileSearchPage>;
  requestRepoFileContent: (
    paneId: string,
    path: string,
    options?: { maxBytes?: number; worktreePath?: string },
  ) => Promise<RepoFileContent>;
  searchRequestMapRef: MutableRefObject<Map<string, Promise<RepoFileSearchPage>>>;
  fileContentRequestMapRef: MutableRefObject<Map<string, Promise<RepoFileContent>>>;
};

export const useSessionFilesRequestActions = ({
  paneId,
  requestScopeId,
  worktreePath,
  searchPageLimit,
  fileContentMaxBytes,
  resolveWorktreePathForPane,
  requestRepoFileSearch,
  requestRepoFileContent,
  searchRequestMapRef,
  fileContentRequestMapRef,
}: UseSessionFilesRequestActionsArgs) => {
  const fetchSearchPage = useCallback(
    async (query: string, cursor?: string) => {
      return fetchWithRequestMap({
        requestMapRef: searchRequestMapRef,
        requestKey: buildSearchRequestKey(requestScopeId, query, cursor),
        requestFactory: () =>
          requestRepoFileSearch(paneId, query, {
            cursor,
            limit: searchPageLimit,
            ...(worktreePath ? { worktreePath } : {}),
          }),
      });
    },
    [
      paneId,
      requestRepoFileSearch,
      requestScopeId,
      searchPageLimit,
      searchRequestMapRef,
      worktreePath,
    ],
  );

  const fetchFileContent = useCallback(
    async (targetPaneId: string, targetPath: string) => {
      const scopedWorktreePath = resolveWorktreePathForPane(targetPaneId);
      const targetScopeId =
        targetPaneId === paneId ? requestScopeId : `${targetPaneId}:__default__`;
      return fetchWithRequestMap({
        requestMapRef: fileContentRequestMapRef,
        requestKey: buildFileContentRequestKey(targetScopeId, targetPath, fileContentMaxBytes),
        requestFactory: () =>
          requestRepoFileContent(targetPaneId, targetPath, {
            maxBytes: fileContentMaxBytes,
            ...(scopedWorktreePath ? { worktreePath: scopedWorktreePath } : {}),
          }),
      });
    },
    [
      fileContentMaxBytes,
      fileContentRequestMapRef,
      paneId,
      requestRepoFileContent,
      requestScopeId,
      resolveWorktreePathForPane,
    ],
  );

  return {
    fetchSearchPage,
    fetchFileContent,
  };
};

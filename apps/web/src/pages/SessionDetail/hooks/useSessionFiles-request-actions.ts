import type { RepoFileContent, RepoFileSearchPage } from "@vde-monitor/shared";
import { type MutableRefObject, useCallback } from "react";

import {
  buildFileContentRequestKey,
  buildSearchRequestKey,
  fetchWithRequestMap,
} from "./useSessionFiles-request-cache";

type UseSessionFilesRequestActionsArgs = {
  paneId: string;
  searchPageLimit: number;
  fileContentMaxBytes: number;
  requestRepoFileSearch: (
    paneId: string,
    query: string,
    options?: { cursor?: string; limit?: number },
  ) => Promise<RepoFileSearchPage>;
  requestRepoFileContent: (
    paneId: string,
    path: string,
    options?: { maxBytes?: number },
  ) => Promise<RepoFileContent>;
  searchRequestMapRef: MutableRefObject<Map<string, Promise<RepoFileSearchPage>>>;
  fileContentRequestMapRef: MutableRefObject<Map<string, Promise<RepoFileContent>>>;
};

export const useSessionFilesRequestActions = ({
  paneId,
  searchPageLimit,
  fileContentMaxBytes,
  requestRepoFileSearch,
  requestRepoFileContent,
  searchRequestMapRef,
  fileContentRequestMapRef,
}: UseSessionFilesRequestActionsArgs) => {
  const fetchSearchPage = useCallback(
    async (query: string, cursor?: string) => {
      return fetchWithRequestMap({
        requestMapRef: searchRequestMapRef,
        requestKey: buildSearchRequestKey(paneId, query, cursor),
        requestFactory: () =>
          requestRepoFileSearch(paneId, query, { cursor, limit: searchPageLimit }),
      });
    },
    [paneId, requestRepoFileSearch, searchPageLimit, searchRequestMapRef],
  );

  const fetchFileContent = useCallback(
    async (targetPaneId: string, targetPath: string) => {
      return fetchWithRequestMap({
        requestMapRef: fileContentRequestMapRef,
        requestKey: buildFileContentRequestKey(targetPaneId, targetPath, fileContentMaxBytes),
        requestFactory: () =>
          requestRepoFileContent(targetPaneId, targetPath, {
            maxBytes: fileContentMaxBytes,
          }),
      });
    },
    [fileContentMaxBytes, fileContentRequestMapRef, requestRepoFileContent],
  );

  return {
    fetchSearchPage,
    fetchFileContent,
  };
};

import type { RepoFileTreePage } from "@vde-monitor/shared";
import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";

import { buildTreePageRequestKey, fetchWithRequestMap } from "./useSessionFiles-request-cache";
import { mergeTreeEntries } from "./useSessionFiles-tree-utils";

type UseSessionFilesTreeLoaderArgs = {
  paneId: string;
  requestScopeId: string;
  repoRoot: string | null;
  worktreePath: string | null;
  treePageLimit: number;
  requestRepoFileTree: (
    paneId: string,
    options?: { path?: string; cursor?: string; limit?: number; worktreePath?: string },
  ) => Promise<RepoFileTreePage>;
  treePageRequestMapRef: MutableRefObject<Map<string, Promise<RepoFileTreePage>>>;
  contextVersionRef: MutableRefObject<number>;
  setTreeLoadingByPath: Dispatch<SetStateAction<Record<string, boolean>>>;
  setTreePages: Dispatch<SetStateAction<Record<string, RepoFileTreePage>>>;
  setTreeError: Dispatch<SetStateAction<string | null>>;
  resolveUnknownErrorMessage: (error: unknown, fallbackMessage: string) => string;
};

export const useSessionFilesTreeLoader = ({
  paneId,
  requestScopeId,
  repoRoot,
  worktreePath,
  treePageLimit,
  requestRepoFileTree,
  treePageRequestMapRef,
  contextVersionRef,
  setTreeLoadingByPath,
  setTreePages,
  setTreeError,
  resolveUnknownErrorMessage,
}: UseSessionFilesTreeLoaderArgs) => {
  const fetchTreePage = useCallback(
    async (targetPath: string, cursor?: string) => {
      return fetchWithRequestMap({
        requestMapRef: treePageRequestMapRef,
        requestKey: buildTreePageRequestKey(requestScopeId, targetPath, cursor),
        requestFactory: () =>
          requestRepoFileTree(paneId, {
            path: targetPath === "." ? undefined : targetPath,
            cursor,
            limit: treePageLimit,
            ...(worktreePath ? { worktreePath } : {}),
          }),
      });
    },
    [
      paneId,
      requestRepoFileTree,
      requestScopeId,
      treePageLimit,
      treePageRequestMapRef,
      worktreePath,
    ],
  );

  const loadTree = useCallback(
    async (targetPath: string, cursor?: string) => {
      if (!repoRoot) {
        return null;
      }
      const contextVersion = contextVersionRef.current;
      setTreeLoadingByPath((prev) => ({ ...prev, [targetPath]: true }));
      try {
        const page = await fetchTreePage(targetPath, cursor);
        if (contextVersion !== contextVersionRef.current) {
          return null;
        }
        setTreePages((prev) => {
          if (!cursor) {
            return { ...prev, [targetPath]: page };
          }
          const previous = prev[targetPath];
          if (!previous) {
            return { ...prev, [targetPath]: page };
          }
          const merged: RepoFileTreePage = {
            ...page,
            entries: mergeTreeEntries(previous.entries, page.entries),
          };
          return { ...prev, [targetPath]: merged };
        });
        setTreeError(null);
        return page;
      } catch (error) {
        if (contextVersion !== contextVersionRef.current) {
          return null;
        }
        setTreeError(resolveUnknownErrorMessage(error, API_ERROR_MESSAGES.fileTree));
        return null;
      } finally {
        if (contextVersion === contextVersionRef.current) {
          setTreeLoadingByPath((prev) => ({ ...prev, [targetPath]: false }));
        }
      }
    },
    [
      contextVersionRef,
      fetchTreePage,
      repoRoot,
      resolveUnknownErrorMessage,
      setTreeError,
      setTreeLoadingByPath,
      setTreePages,
    ],
  );

  return {
    loadTree,
  };
};

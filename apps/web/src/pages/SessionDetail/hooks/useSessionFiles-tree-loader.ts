import type { RepoFileTreePage } from "@vde-monitor/shared";
import { type MutableRefObject, useCallback } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";

import { buildTreePageRequestKey, fetchWithRequestMap } from "./session-files-request-cache";
import { mergeTreeEntries } from "./session-files-tree-utils";
import { type SessionFilesUiDispatch, setUiState } from "./useSessionFiles-ui-state-machine";

type UseSessionFilesTreeLoaderDeps = {
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
  resolveUnknownErrorMessage: (error: unknown, fallbackMessage: string) => string;
};

// Write-only w.r.t. reducer state (loads and records tree pages), so it only
// needs `dispatch`, not the full state.
export const useSessionFilesTreeLoader = (
  dispatch: SessionFilesUiDispatch,
  {
    paneId,
    requestScopeId,
    repoRoot,
    worktreePath,
    treePageLimit,
    requestRepoFileTree,
    treePageRequestMapRef,
    contextVersionRef,
    resolveUnknownErrorMessage,
  }: UseSessionFilesTreeLoaderDeps,
) => {
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
      setUiState(dispatch, "treeLoadingByPath", (prev) => ({ ...prev, [targetPath]: true }));
      try {
        const page = await fetchTreePage(targetPath, cursor);
        if (contextVersion !== contextVersionRef.current) {
          return null;
        }
        setUiState(dispatch, "treePages", (prev) => {
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
        setUiState(dispatch, "treeError", null);
        return page;
      } catch (error) {
        if (contextVersion !== contextVersionRef.current) {
          return null;
        }
        setUiState(
          dispatch,
          "treeError",
          resolveUnknownErrorMessage(error, API_ERROR_MESSAGES.fileTree),
        );
        return null;
      } finally {
        if (contextVersion === contextVersionRef.current) {
          setUiState(dispatch, "treeLoadingByPath", (prev) => ({ ...prev, [targetPath]: false }));
        }
      }
    },
    [contextVersionRef, dispatch, fetchTreePage, repoRoot, resolveUnknownErrorMessage],
  );

  return {
    loadTree,
  };
};

import type { RepoFileSearchPage } from "@vde-monitor/shared";
import { type MutableRefObject, useCallback } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";

import { mergeSearchItems } from "./session-files-tree-utils";
import {
  type SessionFilesUiDispatch,
  type SessionFilesUiState,
  setUiState,
} from "./useSessionFiles-ui-state-machine";

type UseSessionFilesSearchActionsState = Pick<
  SessionFilesUiState,
  "searchResult" | "searchActiveIndex" | "searchLoading"
>;

type UseSessionFilesSearchActionsDeps = {
  fetchSearchPage: (query: string, cursor?: string) => Promise<RepoFileSearchPage>;
  resolveUnknownErrorMessage: (error: unknown, fallbackMessage: string) => string;
  activeSearchRequestIdRef: MutableRefObject<number>;
  onToggleDirectory: (targetPath: string) => void;
  onSelectFile: (targetPath: string) => void;
  onOpenFileModal: (targetPath: string) => void;
};

export const useSessionFilesSearchActions = (
  { searchResult, searchActiveIndex, searchLoading }: UseSessionFilesSearchActionsState,
  dispatch: SessionFilesUiDispatch,
  {
    fetchSearchPage,
    resolveUnknownErrorMessage,
    activeSearchRequestIdRef,
    onToggleDirectory,
    onSelectFile,
    onOpenFileModal,
  }: UseSessionFilesSearchActionsDeps,
) => {
  const onSearchMove = useCallback(
    (delta: number) => {
      setUiState(dispatch, "searchActiveIndex", (prev) => {
        const items = searchResult?.items ?? [];
        if (items.length === 0) {
          return 0;
        }
        const next = prev + delta;
        if (next < 0) {
          return 0;
        }
        if (next >= items.length) {
          return items.length - 1;
        }
        return next;
      });
    },
    [dispatch, searchResult?.items],
  );

  const onSearchConfirm = useCallback(() => {
    const item = searchResult?.items[searchActiveIndex];
    if (!item) {
      return;
    }
    if (item.kind === "directory") {
      onToggleDirectory(item.path);
      return;
    }
    onSelectFile(item.path);
    onOpenFileModal(item.path);
  }, [onOpenFileModal, onSelectFile, onToggleDirectory, searchActiveIndex, searchResult?.items]);

  const onLoadMoreSearch = useCallback(() => {
    if (searchLoading) {
      return;
    }
    if (!searchResult?.nextCursor || !searchResult.query) {
      return;
    }
    const currentRequestId = activeSearchRequestIdRef.current;
    setUiState(dispatch, "searchLoading", true);
    void fetchSearchPage(searchResult.query, searchResult.nextCursor)
      .then((nextPage) => {
        if (activeSearchRequestIdRef.current !== currentRequestId) {
          return;
        }
        setUiState(dispatch, "searchResult", (prev) => {
          if (!prev) {
            return nextPage;
          }
          return {
            ...nextPage,
            items: mergeSearchItems(prev.items, nextPage.items),
          };
        });
      })
      .catch((error) => {
        if (activeSearchRequestIdRef.current !== currentRequestId) {
          return;
        }
        setUiState(
          dispatch,
          "searchError",
          resolveUnknownErrorMessage(error, API_ERROR_MESSAGES.fileSearch),
        );
      })
      .finally(() => {
        if (activeSearchRequestIdRef.current !== currentRequestId) {
          return;
        }
        setUiState(dispatch, "searchLoading", false);
      });
  }, [
    activeSearchRequestIdRef,
    dispatch,
    fetchSearchPage,
    resolveUnknownErrorMessage,
    searchLoading,
    searchResult,
  ]);

  return {
    onSearchMove,
    onSearchConfirm,
    onLoadMoreSearch,
  };
};

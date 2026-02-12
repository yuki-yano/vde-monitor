import type { RepoFileSearchPage } from "@vde-monitor/shared";
import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";

import { mergeSearchItems } from "./useSessionFiles-tree-utils";

type UseSessionFilesSearchActionsArgs = {
  searchResult: RepoFileSearchPage | null;
  searchActiveIndex: number;
  searchLoading: boolean;
  fetchSearchPage: (query: string, cursor?: string) => Promise<RepoFileSearchPage>;
  resolveUnknownErrorMessage: (error: unknown, fallbackMessage: string) => string;
  activeSearchRequestIdRef: MutableRefObject<number>;
  setSearchActiveIndex: Dispatch<SetStateAction<number>>;
  setSearchResult: Dispatch<SetStateAction<RepoFileSearchPage | null>>;
  setSearchLoading: Dispatch<SetStateAction<boolean>>;
  setSearchError: Dispatch<SetStateAction<string | null>>;
  onToggleDirectory: (targetPath: string) => void;
  onSelectFile: (targetPath: string) => void;
  onOpenFileModal: (targetPath: string) => void;
};

export const useSessionFilesSearchActions = ({
  searchResult,
  searchActiveIndex,
  searchLoading,
  fetchSearchPage,
  resolveUnknownErrorMessage,
  activeSearchRequestIdRef,
  setSearchActiveIndex,
  setSearchResult,
  setSearchLoading,
  setSearchError,
  onToggleDirectory,
  onSelectFile,
  onOpenFileModal,
}: UseSessionFilesSearchActionsArgs) => {
  const onSearchMove = useCallback(
    (delta: number) => {
      setSearchActiveIndex((prev) => {
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
    [searchResult?.items, setSearchActiveIndex],
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
    setSearchLoading(true);
    void fetchSearchPage(searchResult.query, searchResult.nextCursor)
      .then((nextPage) => {
        if (activeSearchRequestIdRef.current !== currentRequestId) {
          return;
        }
        setSearchResult((prev) => {
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
        setSearchError(resolveUnknownErrorMessage(error, API_ERROR_MESSAGES.fileSearch));
      })
      .finally(() => {
        if (activeSearchRequestIdRef.current !== currentRequestId) {
          return;
        }
        setSearchLoading(false);
      });
  }, [
    activeSearchRequestIdRef,
    fetchSearchPage,
    resolveUnknownErrorMessage,
    searchLoading,
    searchResult,
    setSearchError,
    setSearchLoading,
    setSearchResult,
  ]);

  return {
    onSearchMove,
    onSearchConfirm,
    onLoadMoreSearch,
  };
};

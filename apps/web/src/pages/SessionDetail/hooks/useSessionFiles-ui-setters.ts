import type { RepoFileContent, RepoFileSearchPage } from "@vde-monitor/shared";
import type { SetStateAction } from "react";
import { useCallback } from "react";

import type { LogFileCandidateItem } from "./useSessionFiles-log-resolve-state";
import { createSessionFilesUiSetter } from "./useSessionFiles-ui-state-machine";

type SessionFilesUiDispatch = Parameters<typeof createSessionFilesUiSetter<unknown>>[0]["dispatch"];

export const useSessionFilesUiSetters = (dispatchUiState: SessionFilesUiDispatch) => {
  const setSelectedFilePath = useCallback(
    (value: SetStateAction<string | null>) =>
      createSessionFilesUiSetter<string | null>({
        dispatch: dispatchUiState,
        key: "selectedFilePath",
      })(value),
    [dispatchUiState],
  );

  const setSearchQuery = useCallback(
    (value: SetStateAction<string>) =>
      createSessionFilesUiSetter<string>({
        dispatch: dispatchUiState,
        key: "searchQuery",
      })(value),
    [dispatchUiState],
  );

  const setSearchResult = useCallback(
    (value: SetStateAction<RepoFileSearchPage | null>) =>
      createSessionFilesUiSetter<RepoFileSearchPage | null>({
        dispatch: dispatchUiState,
        key: "searchResult",
      })(value),
    [dispatchUiState],
  );

  const setSearchLoading = useCallback(
    (value: SetStateAction<boolean>) =>
      createSessionFilesUiSetter<boolean>({
        dispatch: dispatchUiState,
        key: "searchLoading",
      })(value),
    [dispatchUiState],
  );

  const setSearchError = useCallback(
    (value: SetStateAction<string | null>) =>
      createSessionFilesUiSetter<string | null>({
        dispatch: dispatchUiState,
        key: "searchError",
      })(value),
    [dispatchUiState],
  );

  const setSearchActiveIndex = useCallback(
    (value: SetStateAction<number>) =>
      createSessionFilesUiSetter<number>({
        dispatch: dispatchUiState,
        key: "searchActiveIndex",
      })(value),
    [dispatchUiState],
  );

  const setFileModalOpen = useCallback(
    (value: SetStateAction<boolean>) =>
      createSessionFilesUiSetter<boolean>({
        dispatch: dispatchUiState,
        key: "fileModalOpen",
      })(value),
    [dispatchUiState],
  );

  const setFileModalPath = useCallback(
    (value: SetStateAction<string | null>) =>
      createSessionFilesUiSetter<string | null>({
        dispatch: dispatchUiState,
        key: "fileModalPath",
      })(value),
    [dispatchUiState],
  );

  const setFileModalLoading = useCallback(
    (value: SetStateAction<boolean>) =>
      createSessionFilesUiSetter<boolean>({
        dispatch: dispatchUiState,
        key: "fileModalLoading",
      })(value),
    [dispatchUiState],
  );

  const setFileModalError = useCallback(
    (value: SetStateAction<string | null>) =>
      createSessionFilesUiSetter<string | null>({
        dispatch: dispatchUiState,
        key: "fileModalError",
      })(value),
    [dispatchUiState],
  );

  const setFileModalFile = useCallback(
    (value: SetStateAction<RepoFileContent | null>) =>
      createSessionFilesUiSetter<RepoFileContent | null>({
        dispatch: dispatchUiState,
        key: "fileModalFile",
      })(value),
    [dispatchUiState],
  );

  const setFileModalMarkdownViewMode = useCallback(
    (value: SetStateAction<"code" | "preview" | "diff">) =>
      createSessionFilesUiSetter<"code" | "preview" | "diff">({
        dispatch: dispatchUiState,
        key: "fileModalMarkdownViewMode",
      })(value),
    [dispatchUiState],
  );

  const setFileModalShowLineNumbers = useCallback(
    (value: SetStateAction<boolean>) =>
      createSessionFilesUiSetter<boolean>({
        dispatch: dispatchUiState,
        key: "fileModalShowLineNumbers",
      })(value),
    [dispatchUiState],
  );

  const setFileModalCopiedPath = useCallback(
    (value: SetStateAction<boolean>) =>
      createSessionFilesUiSetter<boolean>({
        dispatch: dispatchUiState,
        key: "fileModalCopiedPath",
      })(value),
    [dispatchUiState],
  );

  const setFileModalCopyError = useCallback(
    (value: SetStateAction<string | null>) =>
      createSessionFilesUiSetter<string | null>({
        dispatch: dispatchUiState,
        key: "fileModalCopyError",
      })(value),
    [dispatchUiState],
  );

  const setFileModalHighlightLine = useCallback(
    (value: SetStateAction<number | null>) =>
      createSessionFilesUiSetter<number | null>({
        dispatch: dispatchUiState,
        key: "fileModalHighlightLine",
      })(value),
    [dispatchUiState],
  );

  const setFileResolveError = useCallback(
    (value: SetStateAction<string | null>) =>
      createSessionFilesUiSetter<string | null>({
        dispatch: dispatchUiState,
        key: "fileResolveError",
      })(value),
    [dispatchUiState],
  );

  const setLogFileCandidateModalOpen = useCallback(
    (value: SetStateAction<boolean>) =>
      createSessionFilesUiSetter<boolean>({
        dispatch: dispatchUiState,
        key: "logFileCandidateModalOpen",
      })(value),
    [dispatchUiState],
  );

  const setLogFileCandidateReference = useCallback(
    (value: SetStateAction<string | null>) =>
      createSessionFilesUiSetter<string | null>({
        dispatch: dispatchUiState,
        key: "logFileCandidateReference",
      })(value),
    [dispatchUiState],
  );

  const setLogFileCandidatePaneId = useCallback(
    (value: SetStateAction<string | null>) =>
      createSessionFilesUiSetter<string | null>({
        dispatch: dispatchUiState,
        key: "logFileCandidatePaneId",
      })(value),
    [dispatchUiState],
  );

  const setLogFileCandidateLine = useCallback(
    (value: SetStateAction<number | null>) =>
      createSessionFilesUiSetter<number | null>({
        dispatch: dispatchUiState,
        key: "logFileCandidateLine",
      })(value),
    [dispatchUiState],
  );

  const setLogFileCandidateItems = useCallback(
    (value: SetStateAction<LogFileCandidateItem[]>) =>
      createSessionFilesUiSetter<LogFileCandidateItem[]>({
        dispatch: dispatchUiState,
        key: "logFileCandidateItems",
      })(value),
    [dispatchUiState],
  );

  return {
    setSelectedFilePath,
    setSearchQuery,
    setSearchResult,
    setSearchLoading,
    setSearchError,
    setSearchActiveIndex,
    setFileModalOpen,
    setFileModalPath,
    setFileModalLoading,
    setFileModalError,
    setFileModalFile,
    setFileModalMarkdownViewMode,
    setFileModalShowLineNumbers,
    setFileModalCopiedPath,
    setFileModalCopyError,
    setFileModalHighlightLine,
    setFileResolveError,
    setLogFileCandidateModalOpen,
    setLogFileCandidateReference,
    setLogFileCandidatePaneId,
    setLogFileCandidateLine,
    setLogFileCandidateItems,
  };
};

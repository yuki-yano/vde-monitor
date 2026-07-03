import type { RepoFileContent } from "@vde-monitor/shared";
import { type MutableRefObject, useCallback } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { useTimeout } from "@/lib/use-timeout";

import type {
  SessionFilesUiDispatch,
  SessionFilesUiState,
} from "./useSessionFiles-ui-state-machine";
import { setUiState } from "./useSessionFiles-ui-state-machine";

const markdownPathPattern = /\.(md|markdown)$/i;
const FILE_MODAL_COPY_INDICATOR_MS = 1200;

const isMarkdownFileContent = (file: RepoFileContent) => {
  if (file.languageHint === "markdown") {
    return true;
  }
  return markdownPathPattern.test(file.path);
};

type UseSessionFilesFileModalActionsDeps = {
  paneId: string;
  fetchFileContent: (targetPaneId: string, targetPath: string) => Promise<RepoFileContent>;
  revealFilePath: (targetPath: string) => void;
  resolveUnknownErrorMessage: (error: unknown, fallbackMessage: string) => string;
  contextVersionRef: MutableRefObject<number>;
  activeFileContentRequestIdRef: MutableRefObject<number>;
};

export const useSessionFilesFileModalActions = (
  state: Pick<SessionFilesUiState, "fileModalPath">,
  dispatch: SessionFilesUiDispatch,
  {
    paneId,
    fetchFileContent,
    revealFilePath,
    resolveUnknownErrorMessage,
    contextVersionRef,
    activeFileContentRequestIdRef,
  }: UseSessionFilesFileModalActionsDeps,
) => {
  // Owns the "Copied!" indicator's auto-hide timer. A pending timer must be
  // cancelled on context reset (pane/worktree switch) so a stale timeout from
  // the previous context can't clobber a fresh copy indicator in the new one
  // -- see useSessionFiles.ts wiring of `cancelCopyTimeout` into the
  // context-reset effect.
  const copyIndicatorTimeout = useTimeout();

  const openFileModalByPath = useCallback(
    (
      targetPath: string,
      options: {
        paneId: string;
        origin: "navigator" | "log";
        highlightLine?: number | null;
      },
    ) => {
      const contextVersion = contextVersionRef.current;
      const requestId = activeFileContentRequestIdRef.current + 1;
      activeFileContentRequestIdRef.current = requestId;

      if (options.origin === "navigator") {
        setUiState(dispatch, "selectedFilePath", targetPath);
        revealFilePath(targetPath);
      }

      dispatch({
        type: "openFileModal",
        path: targetPath,
        highlightLine: options.highlightLine ?? null,
      });

      void fetchFileContent(options.paneId, targetPath)
        .then((file) => {
          if (
            contextVersion !== contextVersionRef.current ||
            activeFileContentRequestIdRef.current !== requestId
          ) {
            return;
          }
          dispatch({
            type: "fileModalLoaded",
            file,
            markdownViewMode:
              options.highlightLine != null && options.highlightLine > 0
                ? "code"
                : isMarkdownFileContent(file)
                  ? "preview"
                  : "code",
          });
        })
        .catch((error) => {
          if (
            contextVersion !== contextVersionRef.current ||
            activeFileContentRequestIdRef.current !== requestId
          ) {
            return;
          }
          dispatch({
            type: "fileModalLoadFailed",
            message: resolveUnknownErrorMessage(error, API_ERROR_MESSAGES.fileContent),
          });
        });
    },
    [
      activeFileContentRequestIdRef,
      contextVersionRef,
      dispatch,
      fetchFileContent,
      resolveUnknownErrorMessage,
      revealFilePath,
    ],
  );

  const onOpenFileModal = useCallback(
    (targetPath: string) => {
      openFileModalByPath(targetPath, { paneId, origin: "navigator" });
    },
    [openFileModalByPath, paneId],
  );

  const onCloseFileModal = useCallback(() => {
    activeFileContentRequestIdRef.current += 1;
    dispatch({ type: "closeFileModal" });
    copyIndicatorTimeout.cancel();
  }, [activeFileContentRequestIdRef, copyIndicatorTimeout, dispatch]);

  const onSetFileModalMarkdownViewMode = useCallback(
    (mode: "code" | "preview" | "diff") => {
      setUiState(dispatch, "fileModalMarkdownViewMode", mode);
    },
    [dispatch],
  );

  const onToggleFileModalLineNumbers = useCallback(() => {
    setUiState(dispatch, "fileModalShowLineNumbers", (prev) => !prev);
  }, [dispatch]);

  const onCopyFileModalPath = useCallback(async () => {
    const fileModalPath = state.fileModalPath;
    if (!fileModalPath) {
      return;
    }
    setUiState(dispatch, "fileModalCopyError", null);
    const copied = await copyToClipboard(fileModalPath);
    if (!copied) {
      setUiState(dispatch, "fileModalCopiedPath", false);
      setUiState(dispatch, "fileModalCopyError", "Failed to copy the file path.");
      return;
    }
    setUiState(dispatch, "fileModalCopiedPath", true);
    copyIndicatorTimeout.set(() => {
      setUiState(dispatch, "fileModalCopiedPath", false);
    }, FILE_MODAL_COPY_INDICATOR_MS);
  }, [copyIndicatorTimeout, dispatch, state.fileModalPath]);

  return {
    openFileModalByPath,
    onOpenFileModal,
    onCloseFileModal,
    onSetFileModalMarkdownViewMode,
    onToggleFileModalLineNumbers,
    onCopyFileModalPath,
    cancelCopyTimeout: copyIndicatorTimeout.cancel,
  };
};

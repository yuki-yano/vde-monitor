import type { RepoFileContent } from "@vde-monitor/shared";
import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import { copyToClipboard } from "@/lib/copy-to-clipboard";

const markdownPathPattern = /\.(md|markdown)$/i;

const isMarkdownFileContent = (file: RepoFileContent) => {
  if (file.languageHint === "markdown") {
    return true;
  }
  return markdownPathPattern.test(file.path);
};

type UseSessionFilesFileModalActionsArgs = {
  paneId: string;
  fileModalPath: string | null;
  fetchFileContent: (targetPaneId: string, targetPath: string) => Promise<RepoFileContent>;
  revealFilePath: (targetPath: string) => void;
  resolveUnknownErrorMessage: (error: unknown, fallbackMessage: string) => string;
  contextVersionRef: MutableRefObject<number>;
  activeFileContentRequestIdRef: MutableRefObject<number>;
  fileModalCopyTimeoutRef: MutableRefObject<number | null>;
  setSelectedFilePath: Dispatch<SetStateAction<string | null>>;
  setFileModalOpen: Dispatch<SetStateAction<boolean>>;
  setFileModalPath: Dispatch<SetStateAction<string | null>>;
  setFileModalLoading: Dispatch<SetStateAction<boolean>>;
  setFileModalError: Dispatch<SetStateAction<string | null>>;
  setFileModalShowLineNumbers: Dispatch<SetStateAction<boolean>>;
  setFileModalCopyError: Dispatch<SetStateAction<string | null>>;
  setFileModalCopiedPath: Dispatch<SetStateAction<boolean>>;
  setFileModalFile: Dispatch<SetStateAction<RepoFileContent | null>>;
  setFileModalHighlightLine: Dispatch<SetStateAction<number | null>>;
  setFileModalMarkdownViewMode: Dispatch<SetStateAction<"code" | "preview" | "diff">>;
};

export const useSessionFilesFileModalActions = ({
  paneId,
  fileModalPath,
  fetchFileContent,
  revealFilePath,
  resolveUnknownErrorMessage,
  contextVersionRef,
  activeFileContentRequestIdRef,
  fileModalCopyTimeoutRef,
  setSelectedFilePath,
  setFileModalOpen,
  setFileModalPath,
  setFileModalLoading,
  setFileModalError,
  setFileModalShowLineNumbers,
  setFileModalCopyError,
  setFileModalCopiedPath,
  setFileModalFile,
  setFileModalHighlightLine,
  setFileModalMarkdownViewMode,
}: UseSessionFilesFileModalActionsArgs) => {
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
        setSelectedFilePath(targetPath);
        revealFilePath(targetPath);
      }

      setFileModalOpen(true);
      setFileModalPath(targetPath);
      setFileModalLoading(true);
      setFileModalError(null);
      setFileModalShowLineNumbers(true);
      setFileModalCopyError(null);
      setFileModalCopiedPath(false);
      setFileModalFile(null);
      setFileModalHighlightLine(options.highlightLine ?? null);

      void fetchFileContent(options.paneId, targetPath)
        .then((file) => {
          if (
            contextVersion !== contextVersionRef.current ||
            activeFileContentRequestIdRef.current !== requestId
          ) {
            return;
          }
          setFileModalFile(file);
          setFileModalLoading(false);
          setFileModalError(null);
          setFileModalMarkdownViewMode(
            options.highlightLine != null && options.highlightLine > 0
              ? "code"
              : isMarkdownFileContent(file)
                ? "preview"
                : "code",
          );
        })
        .catch((error) => {
          if (
            contextVersion !== contextVersionRef.current ||
            activeFileContentRequestIdRef.current !== requestId
          ) {
            return;
          }
          setFileModalFile(null);
          setFileModalLoading(false);
          setFileModalError(resolveUnknownErrorMessage(error, API_ERROR_MESSAGES.fileContent));
        });
    },
    [
      activeFileContentRequestIdRef,
      contextVersionRef,
      fetchFileContent,
      revealFilePath,
      resolveUnknownErrorMessage,
      setFileModalCopiedPath,
      setFileModalCopyError,
      setFileModalError,
      setFileModalFile,
      setFileModalHighlightLine,
      setFileModalLoading,
      setFileModalMarkdownViewMode,
      setFileModalOpen,
      setFileModalPath,
      setFileModalShowLineNumbers,
      setSelectedFilePath,
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
    setFileModalOpen(false);
    setFileModalLoading(false);
    setFileModalError(null);
    setFileModalShowLineNumbers(true);
    setFileModalCopyError(null);
    setFileModalCopiedPath(false);
    setFileModalHighlightLine(null);
    if (fileModalCopyTimeoutRef.current != null) {
      window.clearTimeout(fileModalCopyTimeoutRef.current);
      fileModalCopyTimeoutRef.current = null;
    }
  }, [
    activeFileContentRequestIdRef,
    fileModalCopyTimeoutRef,
    setFileModalCopiedPath,
    setFileModalCopyError,
    setFileModalError,
    setFileModalHighlightLine,
    setFileModalLoading,
    setFileModalOpen,
    setFileModalShowLineNumbers,
  ]);

  const onSetFileModalMarkdownViewMode = useCallback(
    (mode: "code" | "preview" | "diff") => {
      setFileModalMarkdownViewMode(mode);
    },
    [setFileModalMarkdownViewMode],
  );

  const onToggleFileModalLineNumbers = useCallback(() => {
    setFileModalShowLineNumbers((prev) => !prev);
  }, [setFileModalShowLineNumbers]);

  const onCopyFileModalPath = useCallback(async () => {
    if (!fileModalPath) {
      return;
    }
    setFileModalCopyError(null);
    const copied = await copyToClipboard(fileModalPath);
    if (!copied) {
      setFileModalCopiedPath(false);
      setFileModalCopyError("Failed to copy the file path.");
      return;
    }
    setFileModalCopiedPath(true);
    if (fileModalCopyTimeoutRef.current != null) {
      window.clearTimeout(fileModalCopyTimeoutRef.current);
    }
    fileModalCopyTimeoutRef.current = window.setTimeout(() => {
      setFileModalCopiedPath(false);
      fileModalCopyTimeoutRef.current = null;
    }, 1200);
  }, [fileModalCopyTimeoutRef, fileModalPath, setFileModalCopiedPath, setFileModalCopyError]);

  return {
    openFileModalByPath,
    onOpenFileModal,
    onCloseFileModal,
    onSetFileModalMarkdownViewMode,
    onToggleFileModalLineNumbers,
    onCopyFileModalPath,
  };
};

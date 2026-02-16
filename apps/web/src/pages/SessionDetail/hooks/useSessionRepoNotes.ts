import type { RepoNote } from "@vde-monitor/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import { resolveUnknownErrorMessage } from "@/lib/api-utils";

type UseSessionRepoNotesParams = {
  paneId: string;
  repoRoot: string | null;
  connected: boolean;
  requestRepoNotes: (paneId: string) => Promise<RepoNote[]>;
  createRepoNote: (
    paneId: string,
    input: { title?: string | null; body: string },
  ) => Promise<RepoNote>;
  updateRepoNote: (
    paneId: string,
    noteId: string,
    input: { title?: string | null; body: string },
  ) => Promise<RepoNote>;
  deleteRepoNote: (paneId: string, noteId: string) => Promise<string>;
};

type RefreshNotesOptions = {
  silent?: boolean;
};

const sortNotesDesc = (notes: RepoNote[]) =>
  [...notes].sort((a, b) => {
    const updatedAtDiff = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    if (updatedAtDiff !== 0) {
      return updatedAtDiff;
    }
    if (a.updatedAt !== b.updatedAt) {
      return b.updatedAt.localeCompare(a.updatedAt);
    }
    return b.id.localeCompare(a.id);
  });

export const useSessionRepoNotes = ({
  paneId,
  repoRoot,
  connected,
  requestRepoNotes,
  createRepoNote,
  updateRepoNote,
  deleteRepoNote,
}: UseSessionRepoNotesParams) => {
  const [notes, setNotes] = useState<RepoNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [creatingNote, setCreatingNote] = useState(false);
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  const activePaneIdRef = useRef(paneId);
  const noteRequestIdRef = useRef(0);
  const previousConnectedRef = useRef<boolean | null>(null);
  const pendingInteractiveLoadsRef = useRef(0);
  activePaneIdRef.current = paneId;

  const loadNotes = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!paneId || !repoRoot) {
        return;
      }
      const targetPaneId = paneId;
      const requestId = noteRequestIdRef.current + 1;
      noteRequestIdRef.current = requestId;
      if (!silent) {
        pendingInteractiveLoadsRef.current += 1;
        setNotesLoading(true);
      }
      try {
        const loaded = await requestRepoNotes(targetPaneId);
        if (activePaneIdRef.current !== targetPaneId || noteRequestIdRef.current !== requestId) {
          return;
        }
        setNotes(sortNotesDesc(loaded));
        setNotesError(null);
      } catch (error) {
        if (activePaneIdRef.current !== targetPaneId || noteRequestIdRef.current !== requestId) {
          return;
        }
        setNotesError(resolveUnknownErrorMessage(error, API_ERROR_MESSAGES.repoNotes));
      } finally {
        if (!silent) {
          pendingInteractiveLoadsRef.current = Math.max(0, pendingInteractiveLoadsRef.current - 1);
          if (
            activePaneIdRef.current === targetPaneId &&
            pendingInteractiveLoadsRef.current === 0
          ) {
            setNotesLoading(false);
          }
        }
      }
    },
    [paneId, repoRoot, requestRepoNotes],
  );

  useEffect(() => {
    pendingInteractiveLoadsRef.current = 0;
    setNotes([]);
    setNotesError(null);
    setNotesLoading(false);
    setCreatingNote(false);
    setSavingNoteId(null);
    setDeletingNoteId(null);
    if (repoRoot) {
      void loadNotes();
    }
  }, [loadNotes, paneId, repoRoot]);

  useEffect(() => {
    if (previousConnectedRef.current === false && connected && repoRoot) {
      void loadNotes({ silent: true });
    }
    previousConnectedRef.current = connected;
  }, [connected, loadNotes, repoRoot]);

  const refreshNotes = useCallback(
    (options?: RefreshNotesOptions) => {
      void loadNotes({ silent: options?.silent ?? false });
    },
    [loadNotes],
  );

  const appendOrReplaceNote = useCallback((incoming: RepoNote) => {
    setNotes((prev) => {
      const next = [...prev.filter((note) => note.id !== incoming.id), incoming];
      return sortNotesDesc(next);
    });
  }, []);

  const createNote = useCallback(
    async (input: { title?: string | null; body: string }) => {
      if (!repoRoot) {
        setNotesError(API_ERROR_MESSAGES.repoUnavailable);
        return false;
      }
      const targetPaneId = paneId;
      setCreatingNote(true);
      try {
        const created = await createRepoNote(targetPaneId, input);
        if (activePaneIdRef.current !== targetPaneId) {
          return false;
        }
        appendOrReplaceNote(created);
        setNotesError(null);
        return true;
      } catch (error) {
        if (activePaneIdRef.current === targetPaneId) {
          setNotesError(resolveUnknownErrorMessage(error, API_ERROR_MESSAGES.createRepoNote));
        }
        return false;
      } finally {
        if (activePaneIdRef.current === targetPaneId) {
          setCreatingNote(false);
        }
      }
    },
    [appendOrReplaceNote, createRepoNote, paneId, repoRoot],
  );

  const saveNote = useCallback(
    async (noteId: string, input: { title?: string | null; body: string }) => {
      if (!repoRoot) {
        setNotesError(API_ERROR_MESSAGES.repoUnavailable);
        return false;
      }
      const targetPaneId = paneId;
      setSavingNoteId(noteId);
      try {
        const updated = await updateRepoNote(targetPaneId, noteId, input);
        if (activePaneIdRef.current !== targetPaneId) {
          return false;
        }
        appendOrReplaceNote(updated);
        setNotesError(null);
        return true;
      } catch (error) {
        if (activePaneIdRef.current === targetPaneId) {
          setNotesError(resolveUnknownErrorMessage(error, API_ERROR_MESSAGES.updateRepoNote));
        }
        return false;
      } finally {
        if (activePaneIdRef.current === targetPaneId) {
          setSavingNoteId((prev) => (prev === noteId ? null : prev));
        }
      }
    },
    [appendOrReplaceNote, paneId, repoRoot, updateRepoNote],
  );

  const removeNote = useCallback(
    async (noteId: string) => {
      if (!repoRoot) {
        setNotesError(API_ERROR_MESSAGES.repoUnavailable);
        return false;
      }
      const targetPaneId = paneId;
      setDeletingNoteId(noteId);
      try {
        const removedNoteId = await deleteRepoNote(targetPaneId, noteId);
        if (activePaneIdRef.current !== targetPaneId) {
          return false;
        }
        setNotes((prev) => prev.filter((note) => note.id !== removedNoteId));
        setNotesError(null);
        return true;
      } catch (error) {
        if (activePaneIdRef.current === targetPaneId) {
          setNotesError(resolveUnknownErrorMessage(error, API_ERROR_MESSAGES.deleteRepoNote));
        }
        return false;
      } finally {
        if (activePaneIdRef.current === targetPaneId) {
          setDeletingNoteId((prev) => (prev === noteId ? null : prev));
        }
      }
    },
    [deleteRepoNote, paneId, repoRoot],
  );

  return {
    notes,
    notesLoading,
    notesError,
    creatingNote,
    savingNoteId,
    deletingNoteId,
    refreshNotes,
    createNote,
    saveNote,
    removeNote,
  };
};

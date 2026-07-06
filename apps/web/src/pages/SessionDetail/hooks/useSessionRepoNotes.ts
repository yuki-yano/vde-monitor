import { type RepoNote, sortNotesDesc } from "@vde-monitor/shared";
import { useCallback, useEffect, useReducer, useRef } from "react";

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

type RepoNotesState = {
  notes: RepoNote[];
  notesLoading: boolean;
  notesError: string | null;
  creatingNote: boolean;
  savingNoteId: string | null;
  deletingNoteId: string | null;
};

type RepoNotesAction =
  | { type: "reset" }
  | { type: "loadStart"; silent: boolean }
  | { type: "loadSuccess"; notes: RepoNote[] }
  | { type: "loadFailure"; error: string }
  | { type: "loadFinish"; silent: boolean; loading: boolean }
  | { type: "setError"; error: string }
  | { type: "createStart" }
  | { type: "createFinish" }
  | { type: "saveStart"; noteId: string }
  | { type: "saveFinish"; noteId: string }
  | { type: "deleteStart"; noteId: string }
  | { type: "deleteFinish"; noteId: string }
  | { type: "appendOrReplace"; note: RepoNote }
  | { type: "remove"; noteId: string };

const initialRepoNotesState: RepoNotesState = {
  notes: [],
  notesLoading: false,
  notesError: null,
  creatingNote: false,
  savingNoteId: null,
  deletingNoteId: null,
};

const repoNotesReducer = (state: RepoNotesState, action: RepoNotesAction): RepoNotesState => {
  switch (action.type) {
    case "reset":
      return initialRepoNotesState;
    case "loadStart":
      return {
        ...state,
        notesLoading: action.silent ? state.notesLoading : true,
      };
    case "loadSuccess":
      return {
        ...state,
        notes: sortNotesDesc(action.notes),
        notesError: null,
      };
    case "loadFailure":
      return { ...state, notesError: action.error };
    case "loadFinish":
      return {
        ...state,
        notesLoading: action.silent ? state.notesLoading : action.loading,
      };
    case "setError":
      return { ...state, notesError: action.error };
    case "createStart":
      return { ...state, creatingNote: true };
    case "createFinish":
      return { ...state, creatingNote: false };
    case "saveStart":
      return { ...state, savingNoteId: action.noteId };
    case "saveFinish":
      return {
        ...state,
        savingNoteId: state.savingNoteId === action.noteId ? null : state.savingNoteId,
      };
    case "deleteStart":
      return { ...state, deletingNoteId: action.noteId };
    case "deleteFinish":
      return {
        ...state,
        deletingNoteId: state.deletingNoteId === action.noteId ? null : state.deletingNoteId,
      };
    case "appendOrReplace":
      return {
        ...state,
        notes: sortNotesDesc([
          ...state.notes.filter((note) => note.id !== action.note.id),
          action.note,
        ]),
        notesError: null,
      };
    case "remove":
      return {
        ...state,
        notes: state.notes.filter((note) => note.id !== action.noteId),
        notesError: null,
      };
  }
};

export const useSessionRepoNotes = ({
  paneId,
  repoRoot,
  connected,
  requestRepoNotes,
  createRepoNote,
  updateRepoNote,
  deleteRepoNote,
}: UseSessionRepoNotesParams) => {
  const [state, dispatch] = useReducer(repoNotesReducer, initialRepoNotesState);
  const { notes, notesLoading, notesError, creatingNote, savingNoteId, deletingNoteId } = state;

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
      }
      dispatch({ type: "loadStart", silent });
      try {
        const loaded = await requestRepoNotes(targetPaneId);
        if (activePaneIdRef.current !== targetPaneId || noteRequestIdRef.current !== requestId) {
          return;
        }
        dispatch({ type: "loadSuccess", notes: loaded });
      } catch (error) {
        if (activePaneIdRef.current !== targetPaneId || noteRequestIdRef.current !== requestId) {
          return;
        }
        dispatch({
          type: "loadFailure",
          error: resolveUnknownErrorMessage(error, API_ERROR_MESSAGES.repoNotes),
        });
      } finally {
        if (!silent) {
          pendingInteractiveLoadsRef.current = Math.max(0, pendingInteractiveLoadsRef.current - 1);
          if (activePaneIdRef.current === targetPaneId) {
            dispatch({
              type: "loadFinish",
              silent,
              loading: pendingInteractiveLoadsRef.current > 0,
            });
          }
        }
      }
    },
    [paneId, repoRoot, requestRepoNotes],
  );

  useEffect(() => {
    pendingInteractiveLoadsRef.current = 0;
    dispatch({ type: "reset" });
    // react-doctor-disable-next-line no-event-handler
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
    dispatch({ type: "appendOrReplace", note: incoming });
  }, []);

  const createNote = useCallback(
    async (input: { title?: string | null; body: string }) => {
      if (!repoRoot) {
        dispatch({ type: "setError", error: API_ERROR_MESSAGES.repoUnavailable });
        return null;
      }
      const targetPaneId = paneId;
      dispatch({ type: "createStart" });
      try {
        const created = await createRepoNote(targetPaneId, input);
        if (activePaneIdRef.current !== targetPaneId) {
          return null;
        }
        appendOrReplaceNote(created);
        return created;
      } catch (error) {
        if (activePaneIdRef.current === targetPaneId) {
          dispatch({
            type: "setError",
            error: resolveUnknownErrorMessage(error, API_ERROR_MESSAGES.createRepoNote),
          });
        }
        return null;
      } finally {
        if (activePaneIdRef.current === targetPaneId) {
          dispatch({ type: "createFinish" });
        }
      }
    },
    [appendOrReplaceNote, createRepoNote, paneId, repoRoot],
  );

  const saveNote = useCallback(
    async (noteId: string, input: { title?: string | null; body: string }) => {
      if (!repoRoot) {
        dispatch({ type: "setError", error: API_ERROR_MESSAGES.repoUnavailable });
        return false;
      }
      const targetPaneId = paneId;
      dispatch({ type: "saveStart", noteId });
      try {
        const updated = await updateRepoNote(targetPaneId, noteId, input);
        if (activePaneIdRef.current !== targetPaneId) {
          return false;
        }
        appendOrReplaceNote(updated);
        return true;
      } catch (error) {
        if (activePaneIdRef.current === targetPaneId) {
          dispatch({
            type: "setError",
            error: resolveUnknownErrorMessage(error, API_ERROR_MESSAGES.updateRepoNote),
          });
        }
        return false;
      } finally {
        if (activePaneIdRef.current === targetPaneId) {
          dispatch({ type: "saveFinish", noteId });
        }
      }
    },
    [appendOrReplaceNote, paneId, repoRoot, updateRepoNote],
  );

  const removeNote = useCallback(
    async (noteId: string) => {
      if (!repoRoot) {
        dispatch({ type: "setError", error: API_ERROR_MESSAGES.repoUnavailable });
        return false;
      }
      const targetPaneId = paneId;
      dispatch({ type: "deleteStart", noteId });
      try {
        const removedNoteId = await deleteRepoNote(targetPaneId, noteId);
        if (activePaneIdRef.current !== targetPaneId) {
          return false;
        }
        dispatch({ type: "remove", noteId: removedNoteId });
        return true;
      } catch (error) {
        if (activePaneIdRef.current === targetPaneId) {
          dispatch({
            type: "setError",
            error: resolveUnknownErrorMessage(error, API_ERROR_MESSAGES.deleteRepoNote),
          });
        }
        return false;
      } finally {
        if (activePaneIdRef.current === targetPaneId) {
          dispatch({ type: "deleteFinish", noteId });
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

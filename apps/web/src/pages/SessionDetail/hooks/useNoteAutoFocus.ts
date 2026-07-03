import type { RepoNote } from "@vde-monitor/shared";
import { useCallback, useEffect, useRef } from "react";

type UseNoteAutoFocusParams = {
  notes: RepoNote[];
  editingNoteId: string | null;
  onAutoEdit: (note: RepoNote) => void;
};

/**
 * Detects a note created while `markPendingAutoEdit` is armed (e.g. from an
 * "Add note" click) and hands it to `onAutoEdit` so the caller can switch
 * into edit mode for it, then restores focus/caret to the end of the
 * textarea whenever the editing target changes.
 */
export const useNoteAutoFocus = ({ notes, editingNoteId, onAutoEdit }: UseNoteAutoFocusParams) => {
  const editingTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingNewNoteAutoEditRef = useRef(false);
  const previousNoteIdSetRef = useRef<Set<string>>(new Set(notes.map((note) => note.id)));

  const markPendingAutoEdit = useCallback(() => {
    pendingNewNoteAutoEditRef.current = true;
  }, []);

  const cancelPendingAutoEdit = useCallback(() => {
    pendingNewNoteAutoEditRef.current = false;
  }, []);

  useEffect(() => {
    const previousIds = previousNoteIdSetRef.current;
    if (pendingNewNoteAutoEditRef.current && notes.length > 0) {
      const createdNote = notes.find((note) => !previousIds.has(note.id));
      if (createdNote) {
        onAutoEdit(createdNote);
        pendingNewNoteAutoEditRef.current = false;
      }
    }
    previousNoteIdSetRef.current = new Set(notes.map((note) => note.id));
  }, [notes, onAutoEdit]);

  useEffect(() => {
    if (!editingNoteId) {
      return;
    }
    const textarea = editingTextareaRef.current;
    if (!textarea) {
      return;
    }
    const rafId = window.requestAnimationFrame(() => {
      const end = textarea.value.length;
      textarea.focus();
      textarea.setSelectionRange(end, end);
    });
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [editingNoteId]);

  return {
    editingTextareaRef,
    markPendingAutoEdit,
    cancelPendingAutoEdit,
  };
};

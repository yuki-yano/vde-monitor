import { useEffect, useRef } from "react";

type UseNoteAutoFocusParams = {
  editingNoteId: string | null;
};

/**
 * Restores focus/caret to the end of the textarea whenever the editing target changes.
 */
export const useNoteAutoFocus = ({ editingNoteId }: UseNoteAutoFocusParams) => {
  const editingTextareaRef = useRef<HTMLTextAreaElement | null>(null);

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
  };
};

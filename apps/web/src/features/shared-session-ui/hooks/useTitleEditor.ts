import { type KeyboardEvent, useCallback, useEffect, useState } from "react";

import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import { resolveUnknownErrorMessage } from "@/lib/api-utils";

export type UseTitleEditorOptions = {
  paneId: string;
  customTitle: string | null;
  updateSessionTitle: (paneId: string, title: string | null) => Promise<void>;
  resetSessionTitle: (paneId: string) => Promise<void>;
  /**
   * When true, saving a title identical to the current customTitle closes the
   * editor without issuing an API call.  ChatGridTile passes true; the default
   * (false) preserves the SessionDetail behaviour of always issuing the save.
   */
  skipSaveIfUnchanged?: boolean;
  /**
   * Called after a successful save.  Receives the paneId and the resolved
   * server-side title (null = cleared back to auto-title).
   */
  onAfterSave?: (paneId: string, nextTitle: string | null) => void | Promise<void>;
  /**
   * Called after a successful reset.
   */
  onAfterReset?: (paneId: string) => void | Promise<void>;
};

/**
 * Shared state machine for the session title inline editor.
 *
 * Manages: draft text, editing/saving/error flags, and a reset-on-context-change
 * effect.  Returns both raw state values and pre-bound event handlers.
 */
export const useTitleEditor = ({
  paneId,
  customTitle,
  updateSessionTitle,
  resetSessionTitle,
  skipSaveIfUnchanged = false,
  onAfterSave,
  onAfterReset,
}: UseTitleEditorOptions) => {
  const [draft, setDraft] = useState(customTitle ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hard reset when paneId changes (navigating to a different session).
  useEffect(() => {
    setDraft(customTitle ?? "");
    setEditing(false);
    setSaving(false);
    setError(null);
    // customTitle is intentionally excluded: paneId change is the authoritative
    // trigger, not the title value arriving in the same render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneId]);

  // Soft sync: keep draft in step with the server value when the editor is closed
  // (e.g. title updated from another client, or pane re-selected).
  useEffect(() => {
    if (editing) return;
    setDraft(customTitle ?? "");
  }, [customTitle, editing]);

  const openTitleEditor = useCallback(() => {
    setDraft(customTitle ?? "");
    setEditing(true);
    setSaving(false);
    setError(null);
  }, [customTitle]);

  const closeTitleEditor = useCallback(() => {
    setDraft(customTitle ?? "");
    setEditing(false);
    setSaving(false);
    setError(null);
  }, [customTitle]);

  const updateTitleDraft = useCallback((value: string) => {
    setDraft(value);
    setError(null);
  }, []);

  const saveTitle = useCallback(async () => {
    if (saving) return;

    const trimmed = draft.trim();
    const nextTitle = trimmed.length > 0 ? trimmed : null;

    // Optional short-circuit: close without an API call when nothing changed.
    if (skipSaveIfUnchanged && nextTitle === customTitle) {
      setDraft(nextTitle ?? "");
      setEditing(false);
      setSaving(false);
      setError(null);
      return;
    }

    if (trimmed.length > 80) {
      setError("Title must be 80 characters or less.");
      return;
    }

    setSaving(true);
    try {
      await updateSessionTitle(paneId, nextTitle);
      if (onAfterSave) {
        await onAfterSave(paneId, nextTitle);
      }
      setEditing(false);
      setError(null);
    } catch (err) {
      setError(resolveUnknownErrorMessage(err, API_ERROR_MESSAGES.updateTitle));
    } finally {
      setSaving(false);
    }
  }, [saving, draft, paneId, customTitle, skipSaveIfUnchanged, updateSessionTitle, onAfterSave]);

  const resetTitle = useCallback(async () => {
    if (saving) return;

    setSaving(true);
    try {
      await resetSessionTitle(paneId);
      if (onAfterReset) {
        await onAfterReset(paneId);
      }
      setEditing(false);
      setDraft("");
      setError(null);
    } catch (err) {
      setError(resolveUnknownErrorMessage(err, API_ERROR_MESSAGES.updateTitle));
    } finally {
      setSaving(false);
    }
  }, [saving, paneId, resetSessionTitle, onAfterReset]);

  const handleTitleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void saveTitle();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeTitleEditor();
      }
    },
    [closeTitleEditor, saveTitle],
  );

  const handleTitleBlur = useCallback(() => {
    if (saving) return;
    closeTitleEditor();
  }, [closeTitleEditor, saving]);

  return {
    titleDraft: draft,
    titleEditing: editing,
    titleSaving: saving,
    titleError: error,
    openTitleEditor,
    closeTitleEditor,
    updateTitleDraft,
    saveTitle,
    resetTitle,
    handleTitleKeyDown,
    handleTitleBlur,
  };
};

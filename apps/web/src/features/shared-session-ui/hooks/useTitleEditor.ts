import { type KeyboardEvent, useCallback, useReducer } from "react";

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

type TitleEditorState = {
  paneId: string;
  draft: string;
  editing: boolean;
  saving: boolean;
  error: string | null;
};

type TitleEditorAction =
  | { type: "open"; paneId: string; draft: string }
  | { type: "close"; paneId: string; draft: string }
  | { type: "updateDraft"; paneId: string; draft: string }
  | { type: "saveStart"; paneId: string }
  | { type: "saveSuccess"; paneId: string; draft: string }
  | { type: "saveFailure"; paneId: string; error: string }
  | { type: "resetSuccess"; paneId: string };

const buildTitleEditorState = (paneId: string, customTitle: string | null): TitleEditorState => ({
  paneId,
  draft: customTitle ?? "",
  editing: false,
  saving: false,
  error: null,
});

const titleEditorReducer = (
  state: TitleEditorState,
  action: TitleEditorAction,
): TitleEditorState => {
  if (state.paneId !== action.paneId) {
    state = buildTitleEditorState(action.paneId, null);
  }
  switch (action.type) {
    case "open":
      return {
        paneId: action.paneId,
        draft: action.draft,
        editing: true,
        saving: false,
        error: null,
      };
    case "close":
      return {
        paneId: action.paneId,
        draft: action.draft,
        editing: false,
        saving: false,
        error: null,
      };
    case "updateDraft":
      return { ...state, draft: action.draft, error: null };
    case "saveStart":
      return { ...state, saving: true };
    case "saveSuccess":
      return { ...state, draft: action.draft, editing: false, saving: false, error: null };
    case "saveFailure":
      return { ...state, saving: false, error: action.error };
    case "resetSuccess":
      return { ...state, draft: "", editing: false, saving: false, error: null };
  }
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
  const [state, dispatch] = useReducer(
    titleEditorReducer,
    { paneId, customTitle },
    ({ paneId: initialPaneId, customTitle: initialCustomTitle }) =>
      buildTitleEditorState(initialPaneId, initialCustomTitle),
  );
  const visibleState = state.paneId === paneId ? state : buildTitleEditorState(paneId, customTitle);
  const { editing, saving, error } = visibleState;
  const draft = visibleState.draft;
  const visibleDraft = editing ? draft : (customTitle ?? "");

  const openTitleEditor = useCallback(() => {
    dispatch({ type: "open", paneId, draft: customTitle ?? "" });
  }, [customTitle, paneId]);

  const closeTitleEditor = useCallback(() => {
    dispatch({ type: "close", paneId, draft: customTitle ?? "" });
  }, [customTitle, paneId]);

  const updateTitleDraft = useCallback(
    (value: string) => {
      dispatch({ type: "updateDraft", paneId, draft: value });
    },
    [paneId],
  );

  const saveTitle = useCallback(async () => {
    if (saving) return;

    const trimmed = draft.trim();
    const nextTitle = trimmed.length > 0 ? trimmed : null;

    // Optional short-circuit: close without an API call when nothing changed.
    if (skipSaveIfUnchanged && nextTitle === customTitle) {
      dispatch({ type: "close", paneId, draft: nextTitle ?? "" });
      return;
    }

    if (trimmed.length > 80) {
      dispatch({ type: "saveFailure", paneId, error: "Title must be 80 characters or less." });
      return;
    }

    dispatch({ type: "saveStart", paneId });
    try {
      await updateSessionTitle(paneId, nextTitle);
      if (onAfterSave) {
        await onAfterSave(paneId, nextTitle);
      }
      dispatch({ type: "saveSuccess", paneId, draft: nextTitle ?? "" });
    } catch (err) {
      dispatch({
        type: "saveFailure",
        paneId,
        error: resolveUnknownErrorMessage(err, API_ERROR_MESSAGES.updateTitle),
      });
    }
  }, [saving, draft, paneId, customTitle, skipSaveIfUnchanged, updateSessionTitle, onAfterSave]);

  const resetTitle = useCallback(async () => {
    if (saving) return;

    dispatch({ type: "saveStart", paneId });
    try {
      await resetSessionTitle(paneId);
      if (onAfterReset) {
        await onAfterReset(paneId);
      }
      dispatch({ type: "resetSuccess", paneId });
    } catch (err) {
      dispatch({
        type: "saveFailure",
        paneId,
        error: resolveUnknownErrorMessage(err, API_ERROR_MESSAGES.updateTitle),
      });
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
    titleDraft: visibleDraft,
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

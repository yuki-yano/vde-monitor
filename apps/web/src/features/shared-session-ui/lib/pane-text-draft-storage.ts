const PANE_TEXT_DRAFT_STORAGE_KEY_PREFIX = "vde-monitor:pane-text-draft";

export const buildPaneTextDraftStorageKey = (paneId: string) =>
  `${PANE_TEXT_DRAFT_STORAGE_KEY_PREFIX}:${paneId}`;

export const readStoredPromptDraft = (draftStorageKey: string | undefined) =>
  draftStorageKey == null ? "" : (window.localStorage.getItem(draftStorageKey) ?? "");

export const syncStoredPromptDraft = (
  draftStorageKey: string | undefined,
  textarea: HTMLTextAreaElement,
) => {
  if (draftStorageKey == null) {
    return;
  }
  if (textarea.value.length === 0) {
    window.localStorage.removeItem(draftStorageKey);
    return;
  }
  window.localStorage.setItem(draftStorageKey, textarea.value);
};

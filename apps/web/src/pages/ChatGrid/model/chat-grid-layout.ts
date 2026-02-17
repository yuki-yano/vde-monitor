export const CHAT_GRID_MIN_PANE_COUNT = 2;
export const CHAT_GRID_MAX_PANE_COUNT = 6;

type ChatGridColumns = 2 | 3;
type ChatGridRows = 1 | 2;

export type ChatGridLayout = {
  columns: ChatGridColumns;
  rows: ChatGridRows;
};

export const clampChatGridPaneCount = (value: number) => {
  const normalized = Number.isFinite(value) ? Math.trunc(value) : CHAT_GRID_MIN_PANE_COUNT;
  return Math.max(CHAT_GRID_MIN_PANE_COUNT, Math.min(CHAT_GRID_MAX_PANE_COUNT, normalized));
};

export const resolveChatGridLayout = (paneCount: number): ChatGridLayout => {
  const count = clampChatGridPaneCount(paneCount);

  if (count <= 3) {
    return { columns: count as ChatGridColumns, rows: 1 };
  }
  if (count === 4) {
    return { columns: 2, rows: 2 };
  }
  return { columns: 3, rows: 2 };
};

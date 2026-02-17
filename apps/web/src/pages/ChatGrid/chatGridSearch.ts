import { CHAT_GRID_MAX_PANE_COUNT } from "./model/chat-grid-layout";

const normalizePaneIds = (paneIds: string[]): string[] =>
  [...new Set(paneIds.map((paneId) => paneId.trim()).filter((paneId) => paneId.length > 0))].slice(
    0,
    CHAT_GRID_MAX_PANE_COUNT,
  );

export const normalizeChatGridPaneParam = (value: unknown): string[] => {
  if (typeof value !== "string") {
    return [];
  }

  return normalizePaneIds(value.split(","));
};

export const serializeChatGridPaneParam = (paneIds: string[]): string | undefined => {
  const normalized = normalizePaneIds(paneIds);
  if (normalized.length === 0) {
    return undefined;
  }
  return normalized.join(",");
};

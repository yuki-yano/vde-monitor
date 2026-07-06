import { CHAT_GRID_MAX_PANE_COUNT } from "./model/chat-grid-layout";

const normalizePaneIds = (paneIds: string[]): string[] =>
  paneIds.reduce<string[]>((normalized, paneId) => {
    const trimmed = paneId.trim();
    if (
      trimmed.length > 0 &&
      !normalized.includes(trimmed) &&
      normalized.length < CHAT_GRID_MAX_PANE_COUNT
    ) {
      normalized.push(trimmed);
    }
    return normalized;
  }, []);

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

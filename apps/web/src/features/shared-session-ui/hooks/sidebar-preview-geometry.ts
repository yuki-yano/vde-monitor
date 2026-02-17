import type { PreviewFrame } from "../atoms/sidebarPreviewAtoms";

const PREVIEW_MIN_WIDTH = 640;
const PREVIEW_MAX_WIDTH = 1200;
const PREVIEW_MIN_HEIGHT = 420;
const PREVIEW_HEIGHT_RATIO = 0.78;
const PREVIEW_VERTICAL_GUTTER = 72;
const PREVIEW_MARGIN = 16;
const PREVIEW_HEADER_OFFSET = 176;
const PREVIEW_LINE_HEIGHT = 16;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const resolvePreviewFrame = ({
  rect,
  viewportWidth,
  viewportHeight,
}: {
  rect: Pick<DOMRect, "width" | "height" | "top" | "right">;
  viewportWidth: number;
  viewportHeight: number;
}): PreviewFrame | null => {
  if (!rect.width || !rect.height) {
    return null;
  }

  const maxWidth = Math.min(PREVIEW_MAX_WIDTH, viewportWidth - 48);
  const maxHeight = Math.max(PREVIEW_MIN_HEIGHT, viewportHeight - PREVIEW_VERTICAL_GUTTER);
  const width = clamp(Math.round(viewportWidth * 0.56), PREVIEW_MIN_WIDTH, maxWidth);
  const height = clamp(
    Math.round(viewportHeight * PREVIEW_HEIGHT_RATIO),
    PREVIEW_MIN_HEIGHT,
    maxHeight,
  );
  const bodyHeight = Math.max(
    height - PREVIEW_HEADER_OFFSET,
    PREVIEW_MIN_HEIGHT - PREVIEW_HEADER_OFFSET,
  );
  const lines = Math.max(20, Math.floor(bodyHeight / PREVIEW_LINE_HEIGHT) - 1);

  let left = rect.right + PREVIEW_MARGIN;
  const maxLeft = viewportWidth - width - 24;
  if (left > maxLeft) {
    left = Math.max(24, maxLeft);
  }
  let top = rect.top + rect.height / 2;
  const minTop = height / 2 + 24;
  const maxTop = viewportHeight - height / 2 - 24;
  top = Math.min(Math.max(top, minTop), maxTop);

  return { left, top, width, height, lines };
};

export const selectVisibleLines = (previewFrame: PreviewFrame | null, lines: string[]) => {
  if (!previewFrame || lines.length === 0) {
    return [];
  }
  return lines.slice(-previewFrame.lines);
};

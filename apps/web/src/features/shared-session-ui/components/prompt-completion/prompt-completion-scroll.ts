type VerticalRect = {
  top: number;
  bottom: number;
};

export const resolvePromptCompletionScrollDelta = ({
  inputRect,
  listRect,
  viewportTop,
  viewportBottom,
  margin = 12,
}: {
  inputRect: VerticalRect;
  listRect: VerticalRect;
  viewportTop: number;
  viewportBottom: number;
  margin?: number;
}) => {
  const targetTop = viewportTop + margin;
  const targetBottom = viewportBottom - margin;
  const contentTop = Math.min(inputRect.top, listRect.top);

  if (contentTop < targetTop) {
    return contentTop - targetTop;
  }
  if (listRect.bottom > targetBottom) {
    const requiredShift = listRect.bottom - targetBottom;
    const availableShift = Math.max(0, contentTop - targetTop);
    return Math.min(requiredShift, availableShift);
  }
  return 0;
};

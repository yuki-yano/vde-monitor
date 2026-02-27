const isNarrowCharacter = (char: string) => {
  const codePoint = char.codePointAt(0);
  return codePoint != null && codePoint <= 0xff;
};

const estimateVisualLength = (value: string): number =>
  Array.from(value).reduce((total, char) => total + (isNarrowCharacter(char) ? 1 : 2), 0);

export const resolveSessionCardTitleTextClass = (title: string): string => {
  const visualLength = estimateVisualLength(title);
  if (visualLength >= 58) {
    return "text-[11px]";
  }
  if (visualLength >= 46) {
    return "text-[12px]";
  }
  if (visualLength >= 36) {
    return "text-[13px]";
  }
  if (visualLength >= 26) {
    return "text-[14px]";
  }
  return "text-[15px]";
};

export const resolveSessionDetailTitleTextClass = (title: string): string => {
  const visualLength = estimateVisualLength(title);
  if (visualLength >= 96) {
    return "!text-xs";
  }
  if (visualLength >= 78) {
    return "!text-sm";
  }
  if (visualLength >= 64) {
    return "!text-base";
  }
  if (visualLength >= 48) {
    return "!text-lg";
  }
  return "!text-xl";
};

export const resolveSessionSidebarTitleTextClass = (title: string): string => {
  const visualLength = estimateVisualLength(title);
  if (visualLength >= 56) {
    return "text-[10px]";
  }
  if (visualLength >= 46) {
    return "text-[11px]";
  }
  if (visualLength >= 38) {
    return "text-xs";
  }
  if (visualLength >= 30) {
    return "text-[13px]";
  }
  return "text-sm";
};

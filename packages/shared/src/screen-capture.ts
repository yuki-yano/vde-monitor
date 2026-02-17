export type TextCaptureOptions = {
  paneId: string;
  lines: number;
  joinLines: boolean;
  includeAnsi: boolean;
  includeTruncated?: boolean;
  altScreen: "auto" | "on" | "off";
  alternateOn: boolean;
  currentCommand?: string | null;
};

export type TextCaptureResult = {
  screen: string;
  truncated: boolean | null;
  alternateOn: boolean;
};

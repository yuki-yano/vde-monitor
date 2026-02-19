export type SmartWrapAgent = "codex" | "claude" | "unknown";

export type SmartWrapLineRule =
  | "default"
  | "statusline-preserve"
  | "claude-tool-block"
  | "codex-diff-block"
  | "table-preserve"
  | "divider-clip"
  | "label-indent"
  | "list-long-word"
  | "generic-indent";

export type SmartWrapLineClassification = {
  rule: SmartWrapLineRule;
  indentCh: number | null;
  listPrefix: string | null;
};

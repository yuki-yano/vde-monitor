export type PromptStartTarget = "codex" | "claude" | "shell" | "any";

const codexPromptStartPattern = /^\s*\u203A(?:\s|$)/;
const shellPromptStartPattern = /^\s*>\s/;
const claudePromptStartPattern = /^\s*\u276F(?:[\s\u00A0]|$)/;

const promptStartPatternsByTarget: Record<PromptStartTarget, readonly RegExp[]> = {
  codex: [codexPromptStartPattern],
  claude: [claudePromptStartPattern],
  shell: [shellPromptStartPattern],
  any: [codexPromptStartPattern, shellPromptStartPattern, claudePromptStartPattern],
};

const promptMarkerReplacePatternByTarget: Record<PromptStartTarget, RegExp> = {
  codex: /^\s*\u203A\s?/,
  claude: /^\s*\u276F(?:[\s\u00A0])?/,
  shell: /^\s*>\s?/,
  any: /^\s*(?:\u203A|>|\u276F)(?:[\s\u00A0])?/,
};

export const getPromptStartPatterns = (target: PromptStartTarget = "any"): readonly RegExp[] =>
  promptStartPatternsByTarget[target];

export const isPromptStartLine = (line: string, target: PromptStartTarget = "any"): boolean =>
  getPromptStartPatterns(target).some((pattern) => pattern.test(line));

export const stripPromptStartMarker = (line: string, target: PromptStartTarget = "any"): string =>
  line.replace(promptMarkerReplacePatternByTarget[target], "");

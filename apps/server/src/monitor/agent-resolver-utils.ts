import path from "node:path";

import { isEditorCommand as isSharedEditorCommand } from "@vde-monitor/shared";

export type AgentType = "codex" | "claude" | "unknown";

const agentHintPattern = /codex|claude/i;
const shellCommandNames = new Set(["bash", "zsh", "fish"]);
const javascriptRuntimeNames = new Set(["node", "nodejs"]);
const agentExecutableNames = new Map<string, Exclude<AgentType, "unknown">>([
  ["codex", "codex"],
  ["codex.js", "codex"],
  ["codex.mjs", "codex"],
  ["codex.cjs", "codex"],
  ["claude", "claude"],
  ["claude.js", "claude"],
  ["claude.mjs", "claude"],
  ["claude.cjs", "claude"],
]);

const normalizeCommandToken = (token: string) =>
  token.replace(/^["']+|["']+$/g, "").replace(/^-+/, "");

const resolveAgentExecutable = (token: string): Exclude<AgentType, "unknown"> | null => {
  const executableName = path.basename(normalizeCommandToken(token)).toLowerCase();
  return agentExecutableNames.get(executableName) ?? null;
};

const findJavascriptEntryPointIndex = (tokens: string[]) => {
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token == null) {
      continue;
    }
    if (token === "--") {
      return index + 1 < tokens.length ? index + 1 : null;
    }
    if (!token.startsWith("-")) {
      return index;
    }
  }
  return null;
};

const isCodexAppServerCommand = (tokens: string[], executableIndex: number) =>
  tokens.slice(executableIndex + 1).some((token) => normalizeCommandToken(token) === "app-server");

export const buildAgent = (hint: string): AgentType => {
  const tokens = hint.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "unknown";

  const firstToken = tokens[0] ?? "";
  const firstExecutableName = path.basename(normalizeCommandToken(firstToken)).toLowerCase();
  const executableIndex = javascriptRuntimeNames.has(firstExecutableName)
    ? findJavascriptEntryPointIndex(tokens)
    : 0;
  if (executableIndex == null) return "unknown";

  const agent = resolveAgentExecutable(tokens[executableIndex] ?? "");
  if (!agent) return "unknown";
  if (agent === "codex" && isCodexAppServerCommand(tokens, executableIndex)) return "unknown";
  return agent;
};

export const isEditorCommand = (command: string | null | undefined) => {
  return isSharedEditorCommand(command);
};

export const editorCommandHasAgentArg = (command: string | null | undefined) => {
  if (!command) return false;
  const trimmed = command.trim();
  if (!trimmed) return false;
  const tokens = trimmed.split(/\s+/);
  const binary = tokens.shift() ?? "";
  if (!isEditorCommand(binary)) {
    return false;
  }
  const rest = tokens.join(" ");
  return rest.length > 0 && agentHintPattern.test(rest);
};

export const isShellCommand = (command: string | null | undefined) => {
  if (!command) return false;
  const trimmed = command.trim();
  if (!trimmed) return false;
  const token = trimmed.split(/\s+/)[0] ?? "";
  if (!token) return false;
  const binary = path.basename(token).replace(/^-+/, "");
  return shellCommandNames.has(binary);
};

export const stripDevPrefix = (tty: string) => tty.replace(/^\/dev\//, "");

import { type SlashCommand, query } from "@anthropic-ai/claude-agent-sdk";
import type { PromptCompletionItem } from "@vde-monitor/shared";

const CLAUDE_BUNDLED_SKILLS = new Set(["batch", "claude-api", "debug", "loop", "simplify"]);
const SCOPE_SUFFIX_PATTERN = /\s+\((enterprise|personal|user|project|plugin|local)\)$/;

const resolveScope = (description: string) => {
  const match = description.match(SCOPE_SUFFIX_PATTERN);
  return match?.[1] ?? null;
};

const stripScope = (description: string) => description.replace(SCOPE_SUFFIX_PATTERN, "");

export const toClaudeCompletionItems = (commands: SlashCommand[]): PromptCompletionItem[] =>
  commands.flatMap((command) => {
    const names = [command.name, ...(command.aliases ?? [])];
    const scope = resolveScope(command.description);
    const kind = scope != null || CLAUDE_BUNDLED_SKILLS.has(command.name) ? "skill" : "command";
    return names.map((name) => ({
      id: `claude-${kind}:${name}`,
      label: `/${name}`,
      insertText: `/${name}`,
      description: stripScope(command.description),
      argumentHint: command.argumentHint,
      kind,
      scope: scope ?? (kind === "skill" ? "bundled" : "built-in"),
    }));
  });

const waitForAbort = (signal: AbortSignal): AsyncIterable<never> => ({
  [Symbol.asyncIterator]: () => ({
    next: () =>
      new Promise<IteratorResult<never>>((resolve) => {
        signal.addEventListener("abort", () => resolve({ done: true, value: undefined }), {
          once: true,
        });
      }),
  }),
});

export const listClaudeCommands = async ({
  cwd,
  timeoutMs = 8_000,
}: {
  cwd: string;
  timeoutMs?: number;
}): Promise<PromptCompletionItem[]> => {
  const abortController = new AbortController();
  const sdkQuery = query({
    prompt: waitForAbort(abortController.signal),
    options: {
      cwd,
      settingSources: ["user", "project", "local"],
      abortController,
    },
  });
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);
  try {
    const commands = await sdkQuery.supportedCommands();
    return toClaudeCompletionItems(commands);
  } catch (error) {
    if (abortController.signal.aborted) {
      throw new Error("Timed out while loading Claude Skills and Commands.", {
        cause: error,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    abortController.abort();
    sdkQuery.close();
  }
};

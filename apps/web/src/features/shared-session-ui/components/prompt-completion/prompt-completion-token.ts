export type PromptCompletionTokenTrigger = "dollar" | "at" | "slash";

export type PromptCompletionToken = {
  trigger: PromptCompletionTokenTrigger;
  query: string;
  start: number;
  end: number;
};

const isTokenBoundary = (value: string) => /\s/.test(value);

export const findPromptCompletionToken = ({
  value,
  caret,
  agent,
}: {
  value: string;
  caret: number;
  agent: "codex" | "claude" | "unknown";
}): PromptCompletionToken | null => {
  if (agent === "unknown" || caret < 0 || caret > value.length) {
    return null;
  }
  let start = caret;
  while (start > 0 && !isTokenBoundary(value[start - 1] ?? "")) {
    start -= 1;
  }
  const token = value.slice(start, caret);
  if (token.startsWith("/")) {
    return { trigger: "slash", query: token.slice(1), start, end: caret };
  }
  if (token.startsWith("@")) {
    return { trigger: "at", query: token.slice(1), start, end: caret };
  }
  if (agent === "codex" && token.startsWith("$")) {
    return { trigger: "dollar", query: token.slice(1), start, end: caret };
  }
  return null;
};

export const quotePromptFilePath = (path: string) => {
  if (!/[\s"]/u.test(path)) {
    return path;
  }
  return `"${path.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
};

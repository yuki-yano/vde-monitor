import { runConfigCheck } from "../../config";

const formatIssue = (issue: { type: string; path?: string; message: string }) => {
  const prefix = issue.path ? `${issue.path}: ` : "";
  return `- [${issue.type}] ${prefix}${issue.message}`;
};

export const runConfigCheckCommand = () => {
  const result = runConfigCheck();
  if (result.configPath == null) {
    throw new Error("global config is missing. Run `vde-monitor config init` first.");
  }

  if (result.ok) {
    console.log(`[vde-monitor] Config check passed: ${result.configPath}`);
    return;
  }

  const lines = result.issues.map((issue) => formatIssue(issue)).join("\n");
  throw new Error(
    [
      `config check failed: ${result.configPath}`,
      lines,
      "Run `vde-monitor config prune` to remove unused keys.",
      "Run `vde-monitor config regenerate` to restore required generated keys.",
    ].join("\n"),
  );
};

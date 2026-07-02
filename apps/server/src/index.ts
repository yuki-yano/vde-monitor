#!/usr/bin/env node
import { parseArgs } from "./app/cli/cli";
import { printCodexHooksSnippet } from "./app/commands/print-codex-hooks-snippet";
import { printHooksSnippet } from "./app/commands/print-hooks-snippet";
import { runConfigCheckCommand } from "./app/commands/run-config-check-command";
import { runConfigInitCommand } from "./app/commands/run-config-init-command";
import { runConfigPruneCommand } from "./app/commands/run-config-prune-command";
import { runConfigRegenerateCommand } from "./app/commands/run-config-regenerate-command";
import { runTokenRotateCommand } from "./app/commands/run-token-rotate-command";
import { runServe } from "./app/serve/serve-command";
import { toErrorMessage } from "./errors";

export const main = async () => {
  const args = parseArgs();
  if (args.command === "token" && args.subcommand === "rotate") {
    runTokenRotateCommand();
    return;
  }
  if (args.command === "claude" && args.subcommand === "hooks" && args.subcommand2 === "print") {
    printHooksSnippet();
    return;
  }
  if (args.command === "codex" && args.subcommand === "hooks" && args.subcommand2 === "print") {
    printCodexHooksSnippet();
    return;
  }
  if (args.command === "config" && args.subcommand === "regenerate") {
    runConfigRegenerateCommand();
    return;
  }
  if (args.command === "config" && args.subcommand === "init") {
    runConfigInitCommand();
    return;
  }
  if (args.command === "config" && args.subcommand === "check") {
    runConfigCheckCommand();
    return;
  }
  if (args.command === "config" && args.subcommand === "prune") {
    runConfigPruneCommand({ dryRun: args.dryRun === true });
    return;
  }

  await runServe(args);
};

if (process.env.NODE_ENV !== "test") {
  main().catch((error) => {
    console.error(toErrorMessage(error));
    process.exit(1);
  });
}

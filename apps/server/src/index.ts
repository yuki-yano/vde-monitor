#!/usr/bin/env node
import { parseArgs } from "./app/cli/cli";
import { printHooksSnippet } from "./app/commands/print-hooks-snippet";
import { runLaunchAgentCommand } from "./app/commands/run-launch-agent-command";
import { runTokenRotateCommand } from "./app/commands/run-token-rotate-command";
import {
  buildAccessUrl,
  buildTailscaleHttpsAccessUrl,
  ensureBackendAvailable,
  runServe,
} from "./app/serve/serve-command";
import { toErrorMessage } from "./errors";

export {
  buildAccessUrl,
  buildTailscaleHttpsAccessUrl,
  ensureBackendAvailable,
  runLaunchAgentCommand,
};

export const main = async () => {
  const args = parseArgs();
  if (args.command === "tmux" && args.subcommand === "launch-agent") {
    const exitCode = await runLaunchAgentCommand(args);
    if (exitCode !== 0) {
      process.exit(exitCode);
    }
    return;
  }
  if (args.command === "token" && args.subcommand === "rotate") {
    runTokenRotateCommand();
    return;
  }
  if (args.command === "claude" && args.subcommand === "hooks" && args.subcommand2 === "print") {
    printHooksSnippet();
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

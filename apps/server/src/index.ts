#!/usr/bin/env node
import { parseArgs, parsePort } from "./app/cli/cli";
import { printCodexHooksSnippet } from "./app/commands/print-codex-hooks-snippet";
import { printHooksSnippet } from "./app/commands/print-hooks-snippet";
import { runConfigCheckCommand } from "./app/commands/run-config-check-command";
import { runConfigInitCommand } from "./app/commands/run-config-init-command";
import { runConfigPruneCommand } from "./app/commands/run-config-prune-command";
import { runConfigRegenerateCommand } from "./app/commands/run-config-regenerate-command";
import { runTokenRotateCommand } from "./app/commands/run-token-rotate-command";
import { runServe } from "./app/serve/serve-command";
import { toErrorMessage } from "./errors";

export const CLI_HELP_TEXT = `Usage: vde-monitor [options]
       vde-monitor config <init|regenerate|check|prune> [--dry-run]
       vde-monitor token rotate
       vde-monitor <claude|codex> hooks print

Options:
  --port <port>           API/UI port (1-65535)
  --public                Bind to 0.0.0.0
  --tailscale             Use Tailscale IP for access URL
  --https                 Enable Tailscale HTTPS guidance
  --bind <ip>             Bind to a specific IPv4 address
  --multiplexer <name>    tmux, wezterm, herdr, or cmux
  --backend <name>        Screen image backend
  --help                  Show this help`;

export const main = async () => {
  const args = parseArgs();
  if (args.help === true) {
    console.log(CLI_HELP_TEXT);
    return;
  }
  if (args.command === "token" && args.subcommand === "rotate" && args.subcommand2 == null) {
    await runTokenRotateCommand({
      host: typeof args.bind === "string" ? args.bind : undefined,
      port: parsePort(args.port) ?? undefined,
    });
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
  if (args.command === "config" && args.subcommand === "regenerate" && args.subcommand2 == null) {
    runConfigRegenerateCommand();
    return;
  }
  if (args.command === "config" && args.subcommand === "init" && args.subcommand2 == null) {
    runConfigInitCommand();
    return;
  }
  if (args.command === "config" && args.subcommand === "check" && args.subcommand2 == null) {
    runConfigCheckCommand();
    return;
  }
  if (args.command === "config" && args.subcommand === "prune" && args.subcommand2 == null) {
    runConfigPruneCommand({ dryRun: args.dryRun === true });
    return;
  }

  if (args.command == null) {
    await runServe(args);
    return;
  }

  const command = [args.command, args.subcommand, args.subcommand2]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
  throw new Error(`Unknown command: ${command}`);
};

if (process.env.NODE_ENV !== "test") {
  main().catch((error) => {
    console.error(toErrorMessage(error));
    process.exit(1);
  });
}

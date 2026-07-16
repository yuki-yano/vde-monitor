#!/usr/bin/env node
import { parseArgs, parsePort, resolvePaneLogDaemonCommandArgs } from "./app/cli/cli";
import { toErrorMessage } from "./errors";
import { runPaneLogDaemon } from "./monitor/pane-log-daemon";

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
  if (
    args.command === "internal" &&
    args.subcommand === "pane-log-daemon" &&
    args.subcommand2 == null
  ) {
    await runPaneLogDaemon(resolvePaneLogDaemonCommandArgs(args));
    return;
  }
  if (args.command === "token" && args.subcommand === "rotate" && args.subcommand2 == null) {
    const { runTokenRotateCommand } = await import("./app/commands/run-token-rotate-command");
    await runTokenRotateCommand({
      host: typeof args.bind === "string" ? args.bind : undefined,
      port: parsePort(args.port) ?? undefined,
    });
    return;
  }
  if (args.command === "claude" && args.subcommand === "hooks" && args.subcommand2 === "print") {
    const { printHooksSnippet } = await import("./app/commands/print-hooks-snippet");
    printHooksSnippet();
    return;
  }
  if (args.command === "codex" && args.subcommand === "hooks" && args.subcommand2 === "print") {
    const { printCodexHooksSnippet } = await import("./app/commands/print-codex-hooks-snippet");
    printCodexHooksSnippet();
    return;
  }
  if (args.command === "config" && args.subcommand === "regenerate" && args.subcommand2 == null) {
    const { runConfigRegenerateCommand } =
      await import("./app/commands/run-config-regenerate-command");
    runConfigRegenerateCommand();
    return;
  }
  if (args.command === "config" && args.subcommand === "init" && args.subcommand2 == null) {
    const { runConfigInitCommand } = await import("./app/commands/run-config-init-command");
    runConfigInitCommand();
    return;
  }
  if (args.command === "config" && args.subcommand === "check" && args.subcommand2 == null) {
    const { runConfigCheckCommand } = await import("./app/commands/run-config-check-command");
    runConfigCheckCommand();
    return;
  }
  if (args.command === "config" && args.subcommand === "prune" && args.subcommand2 == null) {
    const { runConfigPruneCommand } = await import("./app/commands/run-config-prune-command");
    runConfigPruneCommand({ dryRun: args.dryRun === true });
    return;
  }

  if (args.command == null) {
    const { runServe } = await import("./app/serve/serve-command");
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

import { randomUUID } from "node:crypto";

import type { LaunchCommandResponse } from "@vde-monitor/shared";

import { ensureConfig } from "../../config";
import { createMultiplexerRuntime } from "../../multiplexer/runtime";
import type { ParsedArgs } from "../cli/cli";
import { resolveLaunchAgentArgs } from "../cli/cli";

const renderLaunchText = (result: LaunchCommandResponse) => {
  if (result.ok) {
    const { result: launched } = result;
    return [
      "launch-agent: ok",
      `session=${launched.sessionName}`,
      `agent=${launched.agent}`,
      `window=${launched.windowName} (${launched.windowId})`,
      `pane=${launched.paneId}`,
      `verification=${launched.verification.status}`,
      `options=${launched.resolvedOptions.join(" ")}`.trim(),
    ].join("\n");
  }
  return [
    "launch-agent: failed",
    `error=${result.error.code}: ${result.error.message}`,
    `rollback.attempted=${String(result.rollback.attempted)}`,
    `rollback.ok=${String(result.rollback.ok)}`,
    result.rollback.message ? `rollback.message=${result.rollback.message}` : "",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
};

const resolveLaunchExitCode = (result: LaunchCommandResponse) => {
  if (result.ok) {
    return 0;
  }
  if (result.error.code === "INVALID_PAYLOAD") {
    return 2;
  }
  if (result.error.code === "NOT_FOUND") {
    return 3;
  }
  return 4;
};

export const runLaunchAgentCommand = async (args: ParsedArgs): Promise<number> => {
  const config = ensureConfig();
  config.multiplexer.backend = "tmux";
  if (typeof args.socketName === "string") {
    config.tmux.socketName = args.socketName;
  }
  if (typeof args.socketPath === "string") {
    config.tmux.socketPath = args.socketPath;
  }

  const launchArgs = resolveLaunchAgentArgs(args);
  const requestId = launchArgs.requestId ?? randomUUID();
  const runtime = createMultiplexerRuntime(config);
  const result = await runtime.actions.launchAgentInSession({
    sessionName: launchArgs.sessionName,
    agent: launchArgs.agent,
    requestId,
    windowName: launchArgs.windowName,
    cwd: launchArgs.cwd,
    worktreePath: launchArgs.worktreePath,
    worktreeBranch: launchArgs.worktreeBranch,
  });

  if (launchArgs.output === "text") {
    console.log(renderLaunchText(result));
    console.log(`requestId=${requestId}`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }

  return resolveLaunchExitCode(result);
};

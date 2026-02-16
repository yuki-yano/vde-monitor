#!/usr/bin/env node
import { randomUUID } from "node:crypto";

import { serve } from "@hono/node-server";
import type { LaunchCommandResponse } from "@vde-monitor/shared";
import { createTmuxAdapter } from "@vde-monitor/tmux";
import { createWeztermAdapter, normalizeWeztermTarget } from "@vde-monitor/wezterm";
import qrcode from "qrcode-terminal";

import { createApp } from "./app";
import {
  parseArgs,
  type ParsedArgs,
  parsePort,
  resolveHosts,
  resolveLaunchAgentArgs,
  resolveMultiplexerOverrides,
} from "./cli";
import { ensureConfig, rotateToken } from "./config";
import { createSessionMonitor } from "./monitor";
import { createMultiplexerRuntime } from "./multiplexer/runtime";
import { getLocalIP, getTailscaleIP } from "./network";
import { findAvailablePort } from "./ports";

const printHooksSnippet = () => {
  const snippet = {
    hooks: {
      PreToolUse: [
        {
          matcher: "*",
          hooks: [{ type: "command", command: "vde-monitor-hook PreToolUse" }],
        },
      ],
      PostToolUse: [
        {
          matcher: "*",
          hooks: [{ type: "command", command: "vde-monitor-hook PostToolUse" }],
        },
      ],
      Notification: [{ hooks: [{ type: "command", command: "vde-monitor-hook Notification" }] }],
      Stop: [{ hooks: [{ type: "command", command: "vde-monitor-hook Stop" }] }],
      UserPromptSubmit: [
        { hooks: [{ type: "command", command: "vde-monitor-hook UserPromptSubmit" }] },
      ],
    },
  };
  console.log(JSON.stringify(snippet, null, 2));
};

export const ensureTmuxAvailable = async (adapter: ReturnType<typeof createTmuxAdapter>) => {
  const version = await adapter.run(["-V"]);
  if (version.exitCode !== 0) {
    throw new Error("tmux not available");
  }
  const sessions = await adapter.run(["list-sessions"]);
  if (sessions.exitCode !== 0) {
    throw new Error("tmux server not running");
  }
};

export const ensureWeztermAvailable = async (adapter: ReturnType<typeof createWeztermAdapter>) => {
  const result = await adapter.run(["list", "--format", "json"]);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || "wezterm server not running");
  }
};

export const ensureBackendAvailable = async (
  config: ReturnType<typeof ensureConfig>,
): Promise<void> => {
  if (config.multiplexer.backend === "tmux") {
    const tmuxAdapter = createTmuxAdapter({
      socketName: config.tmux.socketName,
      socketPath: config.tmux.socketPath,
    });
    await ensureTmuxAvailable(tmuxAdapter);
    return;
  }
  const weztermAdapter = createWeztermAdapter({
    cliPath: config.multiplexer.wezterm.cliPath,
    target: config.multiplexer.wezterm.target,
  });
  await ensureWeztermAvailable(weztermAdapter);
};

type BuildAccessUrlInput = {
  displayHost: string;
  displayPort: number;
  token: string;
  apiBaseUrl?: string | null;
};

export const buildAccessUrl = ({
  displayHost,
  displayPort,
  token,
  apiBaseUrl,
}: BuildAccessUrlInput) => {
  const hashParams = new URLSearchParams({ token });
  if (apiBaseUrl) {
    hashParams.set("api", apiBaseUrl);
  }
  return `http://${displayHost}:${displayPort}/#${hashParams.toString()}`;
};

export const runServe = async (args: ParsedArgs) => {
  const config = ensureConfig();
  const noAttach = args.attach === false;
  const multiplexerOverrides = resolveMultiplexerOverrides(args);

  const { bindHost, displayHost } = resolveHosts({
    args,
    configBind: config.bind,
    getLocalIP,
    getTailscaleIP,
  });

  config.attachOnServe = !noAttach;
  const parsedPort = parsePort(args.port);
  if (parsedPort) {
    config.port = parsedPort;
  }
  if (typeof args.socketName === "string") {
    config.tmux.socketName = args.socketName;
  }
  if (typeof args.socketPath === "string") {
    config.tmux.socketPath = args.socketPath;
  }
  if (multiplexerOverrides.multiplexerBackend) {
    config.multiplexer.backend = multiplexerOverrides.multiplexerBackend;
  }
  if (multiplexerOverrides.screenImageBackend) {
    config.screen.image.backend = multiplexerOverrides.screenImageBackend;
  }
  if (multiplexerOverrides.weztermCliPath) {
    config.multiplexer.wezterm.cliPath = multiplexerOverrides.weztermCliPath;
  }
  if (multiplexerOverrides.weztermTarget) {
    config.multiplexer.wezterm.target = multiplexerOverrides.weztermTarget;
  }
  config.multiplexer.wezterm.target = normalizeWeztermTarget(config.multiplexer.wezterm.target);

  const host = bindHost;
  const port = await findAvailablePort(config.port, host, 10);

  await ensureBackendAvailable(config);

  const runtime = createMultiplexerRuntime(config);
  const monitor = createSessionMonitor(runtime, config);
  await monitor.start();

  const { app } = createApp({ config, monitor, actions: runtime.actions });

  serve({
    fetch: app.fetch,
    port,
    hostname: host,
  });

  const parsedWebPort = parsePort(args.webPort);
  const displayPort = parsedWebPort ?? port;
  const apiBaseUrl =
    parsedWebPort != null && parsedWebPort !== port ? `http://${displayHost}:${port}/api` : null;
  const url = buildAccessUrl({
    displayHost,
    displayPort,
    token: config.token,
    apiBaseUrl,
  });
  console.log(`vde-monitor: ${url}`);

  qrcode.generate(url, { small: true });

  process.on("SIGINT", () => {
    monitor.stop();
    process.exit(0);
  });
};

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
    const next = rotateToken();
    console.log(next.token);
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
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

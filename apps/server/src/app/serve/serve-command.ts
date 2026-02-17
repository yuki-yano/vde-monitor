import { serve } from "@hono/node-server";
import { createTmuxAdapter } from "@vde-monitor/tmux";
import { createWeztermAdapter, normalizeWeztermTarget } from "@vde-monitor/wezterm";
import qrcode from "qrcode-terminal";

import { createApp } from "../../app";
import { ensureConfig } from "../../config";
import { createSessionMonitor } from "../../monitor";
import { createMultiplexerRuntime } from "../../multiplexer/runtime";
import { getLocalIP, getTailscaleIP } from "../../network";
import { findAvailablePort } from "../../ports";
import { type ParsedArgs, parsePort, resolveHosts, resolveMultiplexerOverrides } from "../cli/cli";

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

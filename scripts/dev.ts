#!/usr/bin/env node
import { execa } from "execa";

import { findAvailablePort, waitForPort } from "./dev-network";

const argv = process.argv.slice(2);
const separatorIndex = argv.indexOf("--");
const scriptArgs = separatorIndex >= 0 ? argv.slice(0, separatorIndex) : argv;
const passthroughArgs = separatorIndex >= 0 ? argv.slice(separatorIndex + 1) : argv;
const allArgs = [...scriptArgs, ...passthroughArgs];
const hasFlag = (flag: string) => allArgs.includes(flag);
const getFlagValue = (flag: string) => {
  const index = allArgs.indexOf(flag);
  if (index === -1) {
    return null;
  }
  const value = allArgs[index + 1];
  if (!value || value.startsWith("--")) {
    return null;
  }
  return value;
};

const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const isPublic = hasFlag("--public");
const isTailscale = hasFlag("--tailscale");
const shouldExposeWeb = isPublic || isTailscale;
const shouldExposeServer = isPublic || isTailscale;
const bindHost = getFlagValue("--bind");
const DEFAULT_SERVER_PORT = 11080;
const DEFAULT_WEB_PORT = 24180;
const DEV_PORT_ATTEMPTS = 100;
const SERVER_READY_TIMEOUT_MS = 30_000;

const parsePort = (value: string | null) => {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const resolvePortProbeHost = () => {
  if (bindHost) {
    return bindHost;
  }
  return shouldExposeServer ? "0.0.0.0" : "127.0.0.1";
};

const resolveProxyHost = () => {
  if (bindHost && bindHost !== "0.0.0.0") {
    return bindHost;
  }
  return "127.0.0.1";
};

const resolveServerPort = async () => {
  const requestedByPassthrough = parsePort(getFlagValue("--port"));
  if (requestedByPassthrough) {
    return requestedByPassthrough;
  }
  const requestedByScript = parsePort(getFlagValue("--server-port"));
  if (requestedByScript) {
    return requestedByScript;
  }
  return findAvailablePort(DEFAULT_SERVER_PORT, resolvePortProbeHost(), DEV_PORT_ATTEMPTS);
};

const resolveWebPort = () =>
  findAvailablePort(DEFAULT_WEB_PORT, shouldExposeWeb ? "0.0.0.0" : "127.0.0.1", DEV_PORT_ATTEMPTS);

const spawnPnpm = (args: string[], env?: NodeJS.ProcessEnv) => {
  return execa(pnpmCmd, args, {
    stdio: ["inherit", "pipe", "pipe"],
    env: env ? { ...process.env, ...env } : process.env,
    reject: false,
  });
};

const main = async () => {
  const [resolvedServerPort, resolvedWebPort] = await Promise.all([
    resolveServerPort(),
    resolveWebPort(),
  ]);

  if (isTailscale && !isPublic) {
    console.warn(
      "[vde-monitor] --tailscale detected. Enabling --public for dev (web/server) to allow Vite WS proxy access.",
    );
  }

  let webProcess: ReturnType<typeof execa> | null = null;
  let shuttingDown = false;

  const serverArgs = ["--filter", "@vde-monitor/server", "dev", "--"];
  const hasForwarded = (flag: string) => passthroughArgs.includes(flag);
  if (shouldExposeServer && !hasForwarded("--public")) {
    serverArgs.push("--public");
  }
  if (isTailscale && !hasForwarded("--tailscale")) {
    serverArgs.push("--tailscale");
  }
  if (bindHost && !hasForwarded("--bind")) {
    serverArgs.push("--bind", bindHost);
  }
  if (!hasForwarded("--port")) {
    serverArgs.push("--port", String(resolvedServerPort));
  }
  serverArgs.push(...passthroughArgs);
  serverArgs.push("--web-port", String(resolvedWebPort));

  const serverProcess = spawnPnpm(serverArgs);
  serverProcess.stdout?.on("data", (data) => process.stdout.write(data));
  serverProcess.stderr?.on("data", (data) => process.stderr.write(data));
  serverProcess.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    webProcess?.kill("SIGTERM");
    process.exit(code ?? (signal ? 1 : 0));
  });

  const stopChildren = (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    webProcess?.kill(signal);
    serverProcess.kill(signal);
  };
  process.once("SIGINT", () => stopChildren("SIGINT"));
  process.once("SIGTERM", () => stopChildren("SIGTERM"));

  try {
    await waitForPort(resolvedServerPort, resolveProxyHost(), SERVER_READY_TIMEOUT_MS);
  } catch (error) {
    stopChildren("SIGTERM");
    throw error;
  }
  if (shuttingDown) {
    return;
  }

  const webArgs = ["--filter", "@vde-monitor/web", shouldExposeWeb ? "dev:public" : "dev"];
  webProcess = spawnPnpm(webArgs, {
    VITE_API_PROXY_TARGET: `http://${resolveProxyHost()}:${resolvedServerPort}`,
    VITE_DEV_PORT: String(resolvedWebPort),
  });
  webProcess.stdout?.on("data", (data) => process.stdout.write(data));
  webProcess.stderr?.on("data", (data) => process.stderr.write(data));
  webProcess.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    serverProcess.kill("SIGTERM");
    process.exit(code ?? (signal ? 1 : 0));
  });
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

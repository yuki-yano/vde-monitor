import { HerdrClient, resolveSocketPath } from "@vde-monitor/herdr";
import { normalizeWeztermTarget } from "@vde-monitor/shared";
import { createTmuxAdapter } from "@vde-monitor/tmux";
import { createWeztermAdapter } from "@vde-monitor/wezterm";
import os from "node:os";
import { serve } from "@hono/node-server";
import qrcode from "qrcode-terminal";

import { createApp } from "../../app";
import { ensureConfig } from "../../config";
import { createSessionMonitor } from "../../monitor";
import { createMultiplexerRuntime } from "../../multiplexer/runtime";
import { getLocalIP, getTailscaleDnsName, getTailscaleIP } from "../../network";
import { createNotificationService } from "../../notifications/service";
import { findAvailablePort } from "../../ports";
import { createScreenCache } from "../../screen/screen-cache";
import { createScreenStreamScheduler } from "../../streams/screen-stream-scheduler";
import { createSessionsStreamSource } from "../../streams/sessions-stream-source";
import { createStreamConnections } from "../../streams/stream-connections";
import { type ParsedArgs, parsePort, resolveHosts, resolveMultiplexerOverrides } from "../cli/cli";
import {
  buildTailscaleHttpsAccessUrl,
  buildTailscaleServeCommand,
  buildTailscaleServeProxyTarget,
  runTailscaleHttpsPreflight,
} from "./tailscale-setup";

export {
  buildTailscaleHttpsAccessUrl,
  collectServeProxyTargets,
  matchesExpectedTailscaleServeTarget,
  buildTailscaleServeProxyTarget,
  buildTailscaleServeCommand,
} from "./tailscale-setup";

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

export const ensureHerdrAvailable = async (client: Pick<HerdrClient, "request" | "close">) => {
  try {
    await client.request("ping", {});
  } finally {
    await client.close();
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
  if (config.multiplexer.backend === "herdr") {
    const client = new HerdrClient(resolveSocketPath(process.env, os.homedir()));
    await ensureHerdrAvailable(client);
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

type CliOverrides = {
  port?: number;
  socketName?: string;
  socketPath?: string;
  multiplexerBackend?: string;
  screenImageBackend?: string;
  weztermCliPath?: string;
  weztermTarget?: string;
};

const MONITOR_STOP_TIMEOUT_MS = 5000;
const SERVER_CLOSE_TIMEOUT_MS = 3000;

export const createGracefulShutdown = ({
  closeStreams,
  stopMonitor,
  closeServer,
  exitProcess = (code) => process.exit(code),
}: {
  closeStreams: () => void;
  stopMonitor: () => void | Promise<void>;
  closeServer: (onClosed: () => void) => void;
  exitProcess?: (code: number) => void;
}): (() => Promise<void>) => {
  let shutdownPromise: Promise<void> | null = null;

  const waitForMonitorStop = async (): Promise<void> => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<void>((resolve) => {
      timeout = setTimeout(resolve, MONITOR_STOP_TIMEOUT_MS);
      timeout.unref();
    });
    try {
      await Promise.race([
        Promise.resolve()
          .then(() => stopMonitor())
          .catch(() => undefined),
        timeoutPromise,
      ]);
    } finally {
      if (timeout !== null) {
        clearTimeout(timeout);
      }
    }
  };

  const waitForServerClose = async (): Promise<void> => {
    await new Promise<void>((resolve) => {
      let completed = false;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      const finish = () => {
        if (completed) return;
        completed = true;
        if (timeout !== null) {
          clearTimeout(timeout);
        }
        resolve();
        exitProcess(0);
      };

      closeServer(finish);
      if (completed) return;

      // This existing 3-second guard begins only after the monitor has stopped
      // or its separate 5-second owned-pipe detach timeout has elapsed.
      timeout = setTimeout(finish, SERVER_CLOSE_TIMEOUT_MS);
      timeout.unref();
    });
  };

  return () => {
    if (shutdownPromise !== null) return shutdownPromise;
    shutdownPromise = (async () => {
      closeStreams();
      await waitForMonitorStop();
      await waitForServerClose();
    })();
    return shutdownPromise;
  };
};

/**
 * Single mutation point for applying CLI argument overrides onto a resolved config object.
 * All direct config property assignments from CLI args are performed here and nowhere else.
 */
const applyCliOverrides = (
  config: ReturnType<typeof ensureConfig>,
  overrides: CliOverrides,
): void => {
  if (overrides.port != null) {
    config.port = overrides.port;
  }
  if (overrides.socketName != null) {
    config.tmux.socketName = overrides.socketName;
  }
  if (overrides.socketPath != null) {
    config.tmux.socketPath = overrides.socketPath;
  }
  if (overrides.multiplexerBackend != null) {
    config.multiplexer.backend = overrides.multiplexerBackend as typeof config.multiplexer.backend;
  }
  if (overrides.screenImageBackend != null) {
    config.screen.image.backend =
      overrides.screenImageBackend as typeof config.screen.image.backend;
  }
  if (overrides.weztermCliPath != null) {
    config.multiplexer.wezterm.cliPath = overrides.weztermCliPath;
  }
  if (overrides.weztermTarget != null) {
    config.multiplexer.wezterm.target = overrides.weztermTarget;
  }
  // Always normalise the wezterm target after all overrides are applied
  config.multiplexer.wezterm.target = normalizeWeztermTarget(config.multiplexer.wezterm.target);
};

export const runServe = async (args: ParsedArgs) => {
  const config = ensureConfig();
  const multiplexerOverrides = resolveMultiplexerOverrides(args);

  const { bindHost, displayHost } = resolveHosts({
    args,
    configBind: config.bind,
    getLocalIP,
    getTailscaleIP,
  });

  // Collect all CLI overrides and apply them through the single mutation point
  applyCliOverrides(config, {
    port: parsePort(args.port) ?? undefined,
    socketName: typeof args.socketName === "string" ? args.socketName : undefined,
    socketPath: typeof args.socketPath === "string" ? args.socketPath : undefined,
    multiplexerBackend: multiplexerOverrides.multiplexerBackend ?? undefined,
    screenImageBackend: multiplexerOverrides.screenImageBackend ?? undefined,
    weztermCliPath: multiplexerOverrides.weztermCliPath ?? undefined,
    weztermTarget: multiplexerOverrides.weztermTarget ?? undefined,
  });

  const host = bindHost;
  const port = await findAvailablePort(config.port, host, 10);

  await ensureBackendAvailable(config);

  const runtime = createMultiplexerRuntime(config);
  const notificationService = createNotificationService({ config });
  const monitor = createSessionMonitor(runtime, config, {
    onSessionTransition: (event) => notificationService.dispatchTransition(event),
  });
  await monitor.start();

  // SSE インフラのインスタンス化
  const schedulerScreenCache = createScreenCache();
  const streamConnections = createStreamConnections();
  const streamSource = createSessionsStreamSource({ registry: monitor.registry });
  const screenScheduler = createScreenStreamScheduler({
    monitor,
    config,
    buildTextResponse: schedulerScreenCache.buildTextResponse,
  });

  const { app } = createApp({
    config,
    monitor,
    actions: runtime.actions,
    launchCapability: runtime.capabilities.launch,
    notificationService,
    streamSource,
    screenScheduler,
    streamConnections,
  });

  const server = serve({
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
  let qrUrl = url;
  const useTailscaleHttps = args.tailscale === true && args.https === true;

  if (useTailscaleHttps) {
    const expectedProxyTarget = buildTailscaleServeProxyTarget({
      proxyHost: host,
      displayPort,
    });
    const manualCommand = buildTailscaleServeCommand(expectedProxyTarget);
    console.log(
      `[vde-monitor] Push notification testing requires HTTPS. Expected tailscale upstream: ${expectedProxyTarget}`,
    );
    console.log(`[vde-monitor] Run (or update) serve: ${manualCommand}`);
    console.log("[vde-monitor] Confirm serve endpoint: tailscale serve status");
    const preflight = await runTailscaleHttpsPreflight(expectedProxyTarget);
    const tailscaleDnsName = preflight.dnsName ?? getTailscaleDnsName();
    if (tailscaleDnsName) {
      const secureUrl = buildTailscaleHttpsAccessUrl({
        dnsName: tailscaleDnsName,
        token: config.token,
      });
      qrUrl = secureUrl;
      console.log(`vde-monitor (tailscale-https): ${secureUrl}`);
      if (apiBaseUrl) {
        console.log(
          "[vde-monitor] Use the tailscale-https URL above for push tests (it intentionally omits #api).",
        );
      }
    } else {
      console.log(
        "[vde-monitor] Could not resolve Tailscale DNSName automatically. Use your <device>.<tailnet>.ts.net host.",
      );
    }
  }

  qrcode.generate(qrUrl, { small: true });

  const shutdown = createGracefulShutdown({
    // 1. SSE 接続を全切断し、クライアントに再接続を促す。
    closeStreams: () => {
      streamConnections.closeAll();
      streamSource.dispose();
      screenScheduler.dispose();
    },
    // 2. owned pipe detachを含むモニター停止を最大5秒待つ。
    stopMonitor: () => monitor.stop(),
    // 3. HTTP サーバーの新規受付を止め、既存 keep-alive を閉じる。
    closeServer: (onClosed) => server.close(onClosed),
  });

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

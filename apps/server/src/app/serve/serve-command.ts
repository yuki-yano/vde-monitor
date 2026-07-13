import { CMUX_METHODS } from "@vde-monitor/cmux";
import { HerdrClient, resolveSocketPath } from "@vde-monitor/herdr";
import { normalizeWeztermTarget } from "@vde-monitor/shared";
import { createTmuxAdapter } from "@vde-monitor/tmux";
import { createWeztermAdapter } from "@vde-monitor/wezterm";
import os from "node:os";
import path from "node:path";
import { serve } from "@hono/node-server";
import { execa } from "execa";
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

const MINIMUM_CMUX_VERSION = [0, 64, 17] as const;
const MINIMUM_CMUX_DARWIN_MAJOR = 23;
const SUPPORTED_CMUX_ACCESS_MODES = new Set(["cmuxOnly", "automation", "password"]);

export type CmuxCapabilities = {
  protocol: "cmux-socket";
  version: number;
  socket_path: string;
  access_mode: string;
  methods: string[];
};

type CmuxCliResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

type RunCmuxCli = (
  cliPath: string,
  args: string[],
  env: NodeJS.ProcessEnv,
) => Promise<CmuxCliResult>;

type ResolveCmuxConnectionOptions = {
  socketPath: string | null;
  password: string | null;
  env?: NodeJS.ProcessEnv;
};

const runCmuxCli: RunCmuxCli = async (cliPath, args, env) => {
  const result = await execa(cliPath, args, {
    env,
    reject: false,
    timeout: 10_000,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode ?? -1,
  };
};

export const resolveCmuxConnectionOptions = ({
  socketPath,
  password,
  env = process.env,
}: ResolveCmuxConnectionOptions) => {
  const environmentPassword = env.CMUX_SOCKET_PASSWORD;
  if (environmentPassword === "") {
    throw new Error("CMUX_SOCKET_PASSWORD must not be empty");
  }
  return {
    socketPath: socketPath?.trim() || env.CMUX_SOCKET_PATH?.trim() || null,
    password: environmentPassword ?? password,
  };
};

const parseCmuxVersion = (raw: string): readonly [number, number, number] | null => {
  const match = raw.match(/\b(\d+)\.(\d+)\.(\d+)\b/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

const isMinimumCmuxVersion = (version: readonly [number, number, number]) => {
  for (let index = 0; index < MINIMUM_CMUX_VERSION.length; index += 1) {
    const actual = version[index] ?? 0;
    const minimum = MINIMUM_CMUX_VERSION[index] ?? 0;
    if (actual !== minimum) return actual > minimum;
  }
  return true;
};

const parseCmuxCapabilities = (raw: string): CmuxCapabilities => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("cmux capabilities returned invalid JSON");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("cmux capabilities returned an invalid payload");
  }
  const capabilities = parsed as Record<string, unknown>;
  if (
    capabilities.protocol !== "cmux-socket" ||
    capabilities.version !== 2 ||
    typeof capabilities.socket_path !== "string" ||
    capabilities.socket_path.trim().length === 0 ||
    typeof capabilities.access_mode !== "string" ||
    !Array.isArray(capabilities.methods) ||
    capabilities.methods.some((method) => typeof method !== "string")
  ) {
    throw new Error("cmux capabilities is missing the required v2 socket metadata");
  }
  return capabilities as CmuxCapabilities;
};

export const ensureCmuxPlatformSupported = (
  platform: NodeJS.Platform = process.platform,
  osRelease: string = os.release(),
): void => {
  if (platform !== "darwin") {
    throw new Error("cmux requires macOS 14 or newer");
  }
  const darwinMajor = Number.parseInt(osRelease.split(".")[0] ?? "", 10);
  if (!Number.isSafeInteger(darwinMajor) || darwinMajor < MINIMUM_CMUX_DARWIN_MAJOR) {
    throw new Error("cmux requires macOS 14 or newer");
  }
};

export const ensureCmuxAvailable = async ({
  cliPath,
  socketPath,
  password,
  requiredMethods,
  run = runCmuxCli,
  platform = process.platform,
  osRelease = os.release(),
}: {
  cliPath: string;
  socketPath: string | null;
  password: string | null;
  requiredMethods: readonly string[];
  run?: RunCmuxCli;
  platform?: NodeJS.Platform;
  osRelease?: string;
}): Promise<CmuxCapabilities> => {
  ensureCmuxPlatformSupported(platform, osRelease);
  const versionResult = await run(cliPath, ["--version"], { ...process.env });
  if (versionResult.exitCode !== 0) {
    throw new Error(versionResult.stderr.trim() || "cmux CLI is not available");
  }
  const version = parseCmuxVersion(versionResult.stdout);
  if (!version) {
    throw new Error("unable to determine cmux version");
  }
  if (!isMinimumCmuxVersion(version)) {
    throw new Error("cmux 0.64.17 or newer is required");
  }

  const selectedSocketPath = socketPath?.trim() || null;
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.CMUX_SOCKET;
  if (selectedSocketPath) {
    env.CMUX_SOCKET_PATH = selectedSocketPath;
  } else {
    delete env.CMUX_SOCKET_PATH;
  }
  if (password != null) {
    env.CMUX_SOCKET_PASSWORD = password;
  } else {
    delete env.CMUX_SOCKET_PASSWORD;
  }

  const capabilitiesResult = await run(
    cliPath,
    ["--json", "--id-format", "uuids", "capabilities"],
    env,
  );
  if (capabilitiesResult.exitCode !== 0) {
    const detail = capabilitiesResult.stderr.trim() || "cmux socket is not available";
    throw new Error(
      `cmux socket preflight failed: ${detail}. Start vde-monitor inside a cmux terminal, or select Automation/Password under cmux Settings > Automation > Socket Control Mode.`,
    );
  }
  const capabilities = parseCmuxCapabilities(capabilitiesResult.stdout);
  if (!path.isAbsolute(capabilities.socket_path) || capabilities.socket_path.includes("\0")) {
    throw new Error("cmux requires a local Unix socket with an absolute filesystem path");
  }
  if (!SUPPORTED_CMUX_ACCESS_MODES.has(capabilities.access_mode)) {
    throw new Error(`cmux access mode is not supported: ${capabilities.access_mode}`);
  }
  if (capabilities.access_mode === "password" && password == null) {
    throw new Error("cmux password access mode requires a socket password");
  }

  const advertisedMethods = new Set(capabilities.methods);
  const missingMethods = [...new Set(requiredMethods)].filter(
    (method) => !advertisedMethods.has(method),
  );
  if (missingMethods.length > 0) {
    throw new Error(`cmux is missing required socket methods: ${missingMethods.join(", ")}`);
  }
  return capabilities;
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
  if (config.multiplexer.backend === "cmux") {
    const connection = resolveCmuxConnectionOptions({
      socketPath: config.multiplexer.cmux.socketPath,
      password: config.multiplexer.cmux.password,
    });
    const capabilities = await ensureCmuxAvailable({
      cliPath: config.multiplexer.cmux.cliPath,
      socketPath: connection.socketPath,
      password: connection.password,
      requiredMethods: Object.values(CMUX_METHODS),
    });
    config.multiplexer.cmux.socketPath = capabilities.socket_path;
    config.multiplexer.cmux.password = connection.password;
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
  cmuxCliPath?: string;
  cmuxSocketPath?: string;
};

const MONITOR_STOP_TIMEOUT_MS = 5000;
const SERVER_CLOSE_TIMEOUT_MS = 3000;

export const stopMonitorAndDisposeRuntime = async ({
  stopMonitor,
  disposeRuntime,
}: {
  stopMonitor: () => void | Promise<void>;
  disposeRuntime?: () => void | Promise<void>;
}): Promise<void> => {
  try {
    await stopMonitor();
  } finally {
    await disposeRuntime?.();
  }
};

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
  if (overrides.cmuxCliPath != null) {
    config.multiplexer.cmux.cliPath = overrides.cmuxCliPath;
  }
  if (overrides.cmuxSocketPath != null) {
    config.multiplexer.cmux.socketPath = overrides.cmuxSocketPath;
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
    cmuxCliPath: multiplexerOverrides.cmuxCliPath ?? undefined,
    cmuxSocketPath: multiplexerOverrides.cmuxSocketPath ?? undefined,
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

  // Instantiate the SSE infrastructure.
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
    // 1. Disconnect all SSE connections so clients reconnect.
    closeStreams: () => {
      streamConnections.closeAll();
      streamSource.dispose();
      screenScheduler.dispose();
    },
    // 2. Wait up to five seconds for the monitor to stop, including owned pipe detachment.
    stopMonitor: () =>
      stopMonitorAndDisposeRuntime({
        stopMonitor: () => monitor.stop(),
        disposeRuntime: runtime.dispose,
      }),
    // 3. Stop accepting new HTTP connections and close existing keep-alive connections.
    closeServer: (onClosed) => server.close(onClosed),
  });

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

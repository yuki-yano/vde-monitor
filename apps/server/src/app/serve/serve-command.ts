import { createInterface } from "node:readline/promises";

import { serve } from "@hono/node-server";
import { isObject } from "@vde-monitor/shared";
import { createTmuxAdapter } from "@vde-monitor/tmux";
import { createWeztermAdapter, normalizeWeztermTarget } from "@vde-monitor/wezterm";
import { execaSync } from "execa";
import qrcode from "qrcode-terminal";

import { createApp } from "../../app";
import { ensureConfig } from "../../config";
import { createSessionMonitor } from "../../monitor";
import { createMultiplexerRuntime } from "../../multiplexer/runtime";
import { getLocalIP, getTailscaleDnsName, getTailscaleIP } from "../../network";
import { createNotificationService } from "../../notifications/service";
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

export const buildTailscaleHttpsAccessUrl = ({
  dnsName,
  token,
}: {
  dnsName: string;
  token: string;
}) => {
  const hashParams = new URLSearchParams({ token });
  return `https://${dnsName}/#${hashParams.toString()}`;
};

const TAILSCALE_COMMAND_CANDIDATES = [
  "tailscale",
  "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
] as const;

type TailscaleCommandResult = {
  bin: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

const runTailscaleCommand = (
  bin: string,
  args: string[],
  timeout = 3000,
): TailscaleCommandResult | null => {
  try {
    const result = execaSync(bin, args, {
      encoding: "utf8",
      reject: false,
      stdio: ["pipe", "pipe", "pipe"],
      timeout,
    });
    return {
      bin,
      exitCode: result.exitCode ?? 1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  } catch {
    return null;
  }
};

const resolveTailscaleBinary = () => {
  for (const bin of TAILSCALE_COMMAND_CANDIDATES) {
    const result = runTailscaleCommand(bin, ["version"]);
    if (!result) {
      continue;
    }
    if (result.exitCode === 0) {
      return bin;
    }
  }
  return null;
};

const normalizeDnsName = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().replace(/\.$/u, "");
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed;
};

const resolveDnsNameFromStatus = (value: unknown) => {
  if (!isObject(value)) {
    return null;
  }
  const self = value.Self;
  if (!isObject(self)) {
    return null;
  }
  return normalizeDnsName(self.DNSName);
};

const parseJson = (raw: string): unknown | null => {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

const hasExistingServeConfig = (value: unknown) => {
  if (!isObject(value)) {
    return false;
  }
  const tcp = value.TCP;
  if (isObject(tcp) && Object.keys(tcp).length > 0) {
    return true;
  }
  const web = value.Web;
  if (isObject(web) && Object.keys(web).length > 0) {
    return true;
  }
  const services = value.Services;
  if (Array.isArray(services) && services.length > 0) {
    return true;
  }
  return false;
};

const askRunTailscaleServe = async () => {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log("[vde-monitor] Non-interactive terminal detected. Skip automatic tailscale serve.");
    return false;
  }
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = (await prompt.question("Run tailscale serve now? [y/N] ")).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    prompt.close();
  }
};

const runTailscaleHttpsPreflight = async (displayPort: number) => {
  const tailscaleBin = resolveTailscaleBinary();
  if (!tailscaleBin) {
    console.log("[vde-monitor] tailscale command not found. Install Tailscale and log in first.");
    return { dnsName: null as string | null };
  }

  const statusResult = runTailscaleCommand(tailscaleBin, ["status", "--json"]);
  if (!statusResult || statusResult.exitCode !== 0) {
    console.log(
      "[vde-monitor] tailscale status --json failed. Ensure Tailscale is running and logged in.",
    );
    return { dnsName: null as string | null };
  }
  const parsedStatus = parseJson(statusResult.stdout);
  const dnsName = resolveDnsNameFromStatus(parsedStatus);
  if (!dnsName) {
    console.log(
      "[vde-monitor] Could not resolve Tailscale DNSName. Log in with `tailscale up` and enable MagicDNS.",
    );
    return { dnsName: null as string | null };
  }

  const manualCommand = `tailscale serve --bg ${displayPort}`;
  const serveStatus = runTailscaleCommand(tailscaleBin, ["serve", "status", "--json"]);
  if (!serveStatus || serveStatus.exitCode !== 0) {
    console.log("[vde-monitor] Could not read existing tailscale serve settings.");
    console.log(`[vde-monitor] Run manually: ${manualCommand}`);
    return { dnsName };
  }
  const parsedServeStatus = parseJson(serveStatus.stdout);
  if (!parsedServeStatus) {
    console.log("[vde-monitor] Failed to parse tailscale serve status output.");
    console.log(`[vde-monitor] Run manually: ${manualCommand}`);
    return { dnsName };
  }
  if (hasExistingServeConfig(parsedServeStatus)) {
    console.log(
      "[vde-monitor] Existing tailscale serve settings detected. Skipping auto configuration.",
    );
    console.log(`[vde-monitor] Keep existing settings or run manually: ${manualCommand}`);
    return { dnsName };
  }

  const confirmed = await askRunTailscaleServe();
  if (!confirmed) {
    console.log("[vde-monitor] tailscale serve auto-setup skipped.");
    console.log(`[vde-monitor] Run manually if needed: ${manualCommand}`);
    return { dnsName };
  }

  const serveBg = runTailscaleCommand(tailscaleBin, ["serve", "--bg", String(displayPort)]);
  if (!serveBg || serveBg.exitCode !== 0) {
    const reason = serveBg?.stderr?.trim() || serveBg?.stdout?.trim() || "unknown error";
    console.log(`[vde-monitor] tailscale serve auto-setup failed: ${reason}`);
    console.log(`[vde-monitor] Run manually: ${manualCommand}`);
    return { dnsName };
  }

  const verify = runTailscaleCommand(tailscaleBin, ["serve", "status", "--json"]);
  if (!verify || verify.exitCode !== 0) {
    console.log(
      "[vde-monitor] tailscale serve verification failed. Confirm with: tailscale serve status",
    );
    return { dnsName };
  }

  console.log("[vde-monitor] tailscale serve configured successfully.");
  return { dnsName };
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
  const notificationService = createNotificationService({ config });
  const monitor = createSessionMonitor(runtime, config, {
    onSessionTransition: (event) => notificationService.dispatchTransition(event),
  });
  await monitor.start();

  const { app } = createApp({ config, monitor, actions: runtime.actions, notificationService });

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
  let qrUrl = url;
  const useTailscaleHttps = args.tailscale === true && args.https === true;

  if (useTailscaleHttps) {
    console.log(
      `[vde-monitor] Push notification testing requires HTTPS. Run: tailscale serve --bg ${displayPort}`,
    );
    console.log("[vde-monitor] Confirm serve endpoint: tailscale serve status");
    const preflight = await runTailscaleHttpsPreflight(displayPort);
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

  process.on("SIGINT", () => {
    monitor.stop();
    process.exit(0);
  });
};

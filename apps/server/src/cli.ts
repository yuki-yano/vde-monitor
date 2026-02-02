import type { AgentMonitorConfig } from "@vde-monitor/shared";

type FlagValue = string | boolean | undefined;

export type ParsedArgs = {
  command: string | null;
  flags: Map<string, string | boolean>;
  positional: string[];
};

export type ResolvedHosts = {
  bindHost: string;
  displayHost: string;
};

type ResolveHostsOptions = {
  flags: Map<string, string | boolean>;
  configBind: AgentMonitorConfig["bind"];
  getLocalIP: () => string;
  getTailscaleIP: () => string | null;
};

export const parseArgs = (argv = process.argv.slice(2)): ParsedArgs => {
  const flags = new Map<string, string | boolean>();
  let command: string | null = null;
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) {
      continue;
    }
    if (arg.startsWith("--")) {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags.set(arg, next);
        i += 1;
      } else {
        flags.set(arg, true);
      }
    } else if (!command) {
      command = arg;
    } else {
      positional.push(arg);
    }
  }

  return { command, flags, positional };
};

export const parsePort = (value: FlagValue) => {
  if (typeof value !== "string") {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const isIPv4 = (value: string) => {
  const parts = value.split(".");
  if (parts.length !== 4) {
    return false;
  }
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) {
      return false;
    }
    const parsed = Number(part);
    return parsed >= 0 && parsed <= 255 && String(parsed) === part;
  });
};

const parseBind = (value: FlagValue) => {
  if (value === undefined) {
    return null;
  }
  if (value === true) {
    throw new Error("--bind requires an IPv4 address.");
  }
  if (!isIPv4(value)) {
    throw new Error(`--bind must be a valid IPv4 address. (received: ${value})`);
  }
  return value;
};

export const resolveHosts = ({
  flags,
  configBind,
  getLocalIP,
  getTailscaleIP,
}: ResolveHostsOptions): ResolvedHosts => {
  const bindFlag = parseBind(flags.get("--bind"));
  const publicBind = flags.has("--public");
  const tailscale = flags.has("--tailscale");

  if (bindFlag && tailscale) {
    throw new Error("--bind and --tailscale cannot be used together.");
  }

  const tailscaleIP = tailscale ? getTailscaleIP() : null;
  if (tailscale && !tailscaleIP) {
    throw new Error("Tailscale IP not found. Is Tailscale running?");
  }

  const bindHost = bindFlag ?? (publicBind ? "0.0.0.0" : tailscale ? tailscaleIP! : configBind);
  const displayHost = tailscale
    ? tailscaleIP!
    : bindHost === "0.0.0.0"
      ? getLocalIP()
      : bindFlag
        ? bindHost
        : bindHost === "127.0.0.1"
          ? "localhost"
          : bindHost;

  return { bindHost, displayHost };
};

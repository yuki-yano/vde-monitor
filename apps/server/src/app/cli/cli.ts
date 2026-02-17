import type { AgentMonitorConfig } from "@vde-monitor/shared";
import type { ArgsDef, ParsedArgs as CittyParsedArgs } from "citty";
import { parseArgs as parseCittyArgs } from "citty";

const multiplexerBackends = ["tmux", "wezterm"] as const;
const imageBackends = ["alacritty", "terminal", "iterm", "wezterm", "ghostty"] as const;
const launchAgents = ["codex", "claude"] as const;
const launchOutputModes = ["json", "text"] as const;

const cliArgDefinitions = {
  command: { type: "positional", required: false },
  subcommand: { type: "positional", required: false },
  subcommand2: { type: "positional", required: false },
  bind: { type: "string" },
  public: { type: "boolean" },
  tailscale: { type: "boolean" },
  attach: { type: "boolean", default: true },
  port: { type: "string" },
  webPort: { type: "string" },
  socketName: { type: "string" },
  socketPath: { type: "string" },
  multiplexer: { type: "enum", options: [...multiplexerBackends] },
  backend: { type: "enum", options: [...imageBackends] },
  weztermCli: { type: "string" },
  weztermTarget: { type: "string" },
  session: { type: "string" },
  agent: { type: "enum", options: [...launchAgents] },
  requestId: { type: "string" },
  windowName: { type: "string" },
  cwd: { type: "string" },
  worktreePath: { type: "string" },
  worktreeBranch: { type: "string" },
  output: { type: "enum", options: [...launchOutputModes] },
} satisfies ArgsDef;

export type ParsedArgs = CittyParsedArgs<typeof cliArgDefinitions>;

export type ResolvedHosts = {
  bindHost: string;
  displayHost: string;
};

export type MultiplexerOverrides = {
  multiplexerBackend?: AgentMonitorConfig["multiplexer"]["backend"];
  screenImageBackend?: AgentMonitorConfig["screen"]["image"]["backend"];
  weztermCliPath?: string;
  weztermTarget?: string;
};

export type LaunchAgentArgs = {
  sessionName: string;
  agent: (typeof launchAgents)[number];
  requestId?: string;
  windowName?: string;
  cwd?: string;
  worktreePath?: string;
  worktreeBranch?: string;
  output: (typeof launchOutputModes)[number];
};

type ResolveHostsOptions = {
  args: ParsedArgs;
  configBind: AgentMonitorConfig["bind"];
  getLocalIP: () => string;
  getTailscaleIP: () => string | null;
};

const normalizeRawArgv = (argv: string[]) => argv.filter((token) => token !== "--");

export const parseArgs = (argv = process.argv.slice(2)): ParsedArgs =>
  parseCittyArgs<typeof cliArgDefinitions>(normalizeRawArgv(argv), cliArgDefinitions);

export const parsePort = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const readOptionalString = (value: unknown, flag: string): string | null => {
  if (value == null) {
    return null;
  }
  if (value === true) {
    throw new Error(`${flag} requires a value.`);
  }
  if (typeof value !== "string") {
    return null;
  }
  return value;
};

const readOptionalTrimmedString = (value: unknown, flag: string): string | undefined => {
  const resolved = readOptionalString(value, flag);
  if (resolved == null) {
    return undefined;
  }
  const trimmed = resolved.trim();
  if (trimmed.length === 0) {
    throw new Error(`${flag} must not be empty.`);
  }
  return trimmed;
};

const readRequiredString = (value: unknown, flag: string): string => {
  const resolved = readOptionalTrimmedString(value, flag);
  if (resolved == null) {
    throw new Error(`${flag} is required.`);
  }
  return resolved;
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

const parseBind = (value: unknown) => {
  const bind = readOptionalString(value, "--bind");
  if (bind == null) {
    return null;
  }
  if (!isIPv4(bind)) {
    throw new Error(`--bind must be a valid IPv4 address. (received: ${bind})`);
  }
  return bind;
};

const resolveTailscaleIP = (enabled: boolean, getTailscaleIP: () => string | null) => {
  if (!enabled) {
    return null;
  }
  const tailscaleIP = getTailscaleIP();
  if (!tailscaleIP) {
    throw new Error("Tailscale IP not found. Is Tailscale running?");
  }
  return tailscaleIP;
};

const resolveBindHost = ({
  bindFlag,
  publicBind,
  tailscaleIP,
  configBind,
}: {
  bindFlag: string | null;
  publicBind: boolean;
  tailscaleIP: string | null;
  configBind: AgentMonitorConfig["bind"];
}) => {
  if (bindFlag) {
    return bindFlag;
  }
  if (publicBind) {
    return "0.0.0.0";
  }
  if (tailscaleIP) {
    return tailscaleIP;
  }
  return configBind;
};

const resolveDisplayHost = ({
  bindHost,
  bindFlag,
  tailscaleIP,
  getLocalIP,
}: {
  bindHost: string;
  bindFlag: string | null;
  tailscaleIP: string | null;
  getLocalIP: () => string;
}) => {
  if (tailscaleIP) {
    return tailscaleIP;
  }
  if (bindHost === "0.0.0.0") {
    return getLocalIP();
  }
  if (bindFlag) {
    return bindHost;
  }
  return bindHost === "127.0.0.1" ? "localhost" : bindHost;
};

export const resolveHosts = ({
  args,
  configBind,
  getLocalIP,
  getTailscaleIP,
}: ResolveHostsOptions): ResolvedHosts => {
  const bindFlag = parseBind(args.bind);
  const publicBind = args.public === true;
  const tailscale = args.tailscale === true;

  if (bindFlag && tailscale) {
    throw new Error("--bind and --tailscale cannot be used together.");
  }

  const tailscaleIP = resolveTailscaleIP(tailscale, getTailscaleIP);
  const bindHost = resolveBindHost({
    bindFlag,
    publicBind,
    tailscaleIP,
    configBind,
  });
  const displayHost = resolveDisplayHost({
    bindHost,
    bindFlag,
    tailscaleIP,
    getLocalIP,
  });

  return { bindHost, displayHost };
};

export const resolveMultiplexerOverrides = (args: ParsedArgs): MultiplexerOverrides => {
  const overrides: MultiplexerOverrides = {};

  if (args.multiplexer) {
    overrides.multiplexerBackend = args.multiplexer;
  }

  if (args.backend) {
    overrides.screenImageBackend = args.backend;
  }

  const weztermCliPath = readOptionalString(args.weztermCli, "--wezterm-cli");
  if (weztermCliPath) {
    overrides.weztermCliPath = weztermCliPath;
  }

  const weztermTarget = readOptionalString(args.weztermTarget, "--wezterm-target");
  if (weztermTarget) {
    overrides.weztermTarget = weztermTarget;
  }

  return overrides;
};

export const resolveLaunchAgentArgs = (args: ParsedArgs): LaunchAgentArgs => {
  const sessionName = readRequiredString(args.session, "--session");
  const agent = readRequiredString(args.agent, "--agent") as LaunchAgentArgs["agent"];
  const requestId = readOptionalTrimmedString(args.requestId, "--request-id");
  const windowName = readOptionalTrimmedString(args.windowName, "--window-name");
  const cwd = readOptionalTrimmedString(args.cwd, "--cwd");
  const worktreePath = readOptionalTrimmedString(args.worktreePath, "--worktree-path");
  const worktreeBranch = readOptionalTrimmedString(args.worktreeBranch, "--worktree-branch");
  if (cwd && (worktreePath || worktreeBranch)) {
    throw new Error("--cwd cannot be combined with --worktree-path/--worktree-branch.");
  }
  const output = (args.output ?? "json") as LaunchAgentArgs["output"];

  return {
    sessionName,
    agent,
    requestId,
    windowName,
    cwd,
    worktreePath,
    worktreeBranch,
    output,
  };
};

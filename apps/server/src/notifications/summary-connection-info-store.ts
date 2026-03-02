import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  type AgentMonitorConfig,
  type SummaryPublishConnectionInfo,
  resolveMonitorServerKey,
  summaryPublishConnectionInfoSchema,
} from "@vde-monitor/shared";

const SUMMARY_CONNECTION_INFO_FILE = "summary-connection.json";

const resolveServerKey = (config: AgentMonitorConfig) =>
  resolveMonitorServerKey({
    multiplexerBackend: config.multiplexer.backend,
    tmuxSocketName: config.tmux.socketName,
    tmuxSocketPath: config.tmux.socketPath,
    weztermTarget: config.multiplexer.wezterm.target,
  });

const resolveConnectionInfoPath = (config: AgentMonitorConfig) =>
  path.join(
    os.homedir(),
    ".vde-monitor",
    "events",
    resolveServerKey(config),
    SUMMARY_CONNECTION_INFO_FILE,
  );

const ensureParentDir = (targetPath: string) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true, mode: 0o700 });
};

const writeAtomically = (targetPath: string, content: string) => {
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, content, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, targetPath);
  fs.chmodSync(targetPath, 0o600);
};

const isLoopbackHost = (host: string) =>
  host === "127.0.0.1" || host === "::1" || host === "::ffff:127.0.0.1" || host === "localhost";

const resolveEndpointHost = (bindHost: string) => (bindHost === "0.0.0.0" ? "127.0.0.1" : bindHost);

const resolveListenerType = (endpointHost: string): SummaryPublishConnectionInfo["listenerType"] =>
  isLoopbackHost(endpointHost) ? "loopback" : "network";

export const buildSummaryConnectionInfo = ({
  bindHost,
  port,
}: {
  bindHost: string;
  port: number;
}) => {
  const endpointHost = resolveEndpointHost(bindHost);
  return summaryPublishConnectionInfoSchema.parse({
    schemaVersion: 1 as const,
    endpoint: `http://${endpointHost}:${port}/api/notifications/summary-events`,
    listenerType: resolveListenerType(endpointHost),
    bind: bindHost,
    tokenRef: "server-token",
  });
};

export const writeSummaryConnectionInfo = ({
  config,
  bindHost,
  port,
}: {
  config: AgentMonitorConfig;
  bindHost: string;
  port: number;
}) => {
  const validated = buildSummaryConnectionInfo({ bindHost, port });
  const targetPath = resolveConnectionInfoPath(config);
  ensureParentDir(targetPath);
  writeAtomically(targetPath, `${JSON.stringify(validated, null, 2)}\n`);
};

import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  type SummaryEngineConfig,
  type SummaryPublishRequest,
  summaryPublishConnectionInfoSchema,
} from "@vde-monitor/shared";

import { loadConfig, resolveHookServerKey } from "./cli";
import type { SummaryText } from "./summary-engine";

type SummarySource = {
  turn_id?: string;
  session_id?: string;
  hook_event_name?: string;
};

const resolveRunAndPane = ({
  sourceAgent,
  paneLocator,
  source,
}: {
  sourceAgent: "codex" | "claude";
  paneLocator: {
    tmux_pane?: string;
    tty?: string;
    cwd?: string;
  };
  source: SummarySource;
}) => {
  const paneId = paneLocator.tmux_pane ?? "unknown-pane";
  if (sourceAgent === "claude") {
    return {
      runId: source.session_id ?? paneId,
      paneId,
    };
  }
  return {
    runId: paneId,
    paneId,
  };
};

const resolveSequence = (sourceEventAt: string) => {
  const parsed = Date.parse(sourceEventAt);
  const epochMs = Number.isFinite(parsed) ? parsed : Date.now();
  return Math.max(1, Math.floor(epochMs));
};

const isLoopbackHost = (host: string) =>
  host === "127.0.0.1" || host === "::1" || host === "::ffff:127.0.0.1" || host === "localhost";

const isSupportedProtocol = (protocol: string) => protocol === "http:" || protocol === "https:";

const resolveSummaryConnectionInfoPath = () => {
  const config = loadConfig();
  const serverKey = resolveHookServerKey(config);
  return path.join(os.homedir(), ".vde-monitor", "events", serverKey, "summary-connection.json");
};

export const resolveSummaryPublishEndpointFromConnectionInfo = (input: unknown): string | null => {
  const validated = summaryPublishConnectionInfoSchema.safeParse(input);
  if (!validated.success) {
    return null;
  }
  const endpoint = validated.data.endpoint;
  const endpointUrl = new URL(endpoint);
  if (!isSupportedProtocol(endpointUrl.protocol)) {
    return null;
  }
  if (validated.data.listenerType === "loopback" && !isLoopbackHost(endpointUrl.hostname)) {
    return null;
  }
  if (
    validated.data.listenerType === "network" &&
    endpointUrl.hostname !== validated.data.bind.trim()
  ) {
    return null;
  }
  if (validated.data.listenerType === "https" && endpointUrl.protocol !== "https:") {
    return null;
  }
  return endpoint;
};

const resolveSummaryPublishEndpoint = () => {
  const connectionInfoPath = resolveSummaryConnectionInfoPath();
  try {
    const raw = fs.readFileSync(connectionInfoPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return resolveSummaryPublishEndpointFromConnectionInfo(parsed);
  } catch {
    return null;
  }
};

const resolveServerToken = () => {
  const tokenPath = path.join(os.homedir(), ".vde-monitor", "token.json");
  try {
    const raw = fs.readFileSync(tokenPath, "utf8");
    const parsed = JSON.parse(raw) as { token?: unknown };
    if (typeof parsed.token !== "string") {
      return null;
    }
    const token = parsed.token.trim();
    if (token.length === 0) {
      return null;
    }
    return token;
  } catch {
    return null;
  }
};

export const buildSummaryEvent = ({
  sourceAgent,
  sourceEventAt,
  paneLocator,
  summary,
  engine,
  source,
}: {
  sourceAgent: "codex" | "claude";
  sourceEventAt: string;
  paneLocator: {
    tmux_pane?: string;
    tty?: string;
    cwd?: string;
  };
  summary: SummaryText;
  engine: SummaryEngineConfig;
  source: SummarySource;
}): SummaryPublishRequest => {
  void engine;
  const locator = resolveRunAndPane({ sourceAgent, paneLocator, source });
  return {
    schemaVersion: 1,
    eventId: randomUUID(),
    locator: {
      source: sourceAgent,
      runId: locator.runId,
      paneId: locator.paneId,
      eventType: "pane.task_completed",
      sequence: resolveSequence(sourceEventAt),
    },
    sourceEventAt,
    summary: {
      paneTitle: summary.paneTitle,
      notificationTitle: summary.notificationTitle,
      notificationBody: summary.notificationBody,
    },
  };
};

export const appendSummaryEvent = (event: SummaryPublishRequest) => {
  const token = resolveServerToken();
  if (!token) {
    console.warn("[vde-monitor][summary-publish] skipped: token is unavailable");
    return;
  }
  const endpoint = resolveSummaryPublishEndpoint();
  if (!endpoint) {
    console.warn("[vde-monitor][summary-publish] skipped: connection info is invalid");
    return;
  }
  let lastStatusCode: number | null = null;
  let lastSpawnStatus: number | null = null;
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = spawnSync(
      "curl",
      [
        "--silent",
        "--show-error",
        "--output",
        "/dev/null",
        "--write-out",
        "%{http_code}",
        "--max-time",
        "2",
        "--request",
        "POST",
        "--header",
        "content-type: application/json",
        "--header",
        `authorization: Bearer ${token}`,
        "--data-binary",
        JSON.stringify(event),
        endpoint,
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    lastSpawnStatus = result.status;
    const statusCode = Number.parseInt((result.stdout ?? "").trim(), 10);
    if (Number.isFinite(statusCode)) {
      lastStatusCode = statusCode;
    }
    if (
      !result.error &&
      result.status === 0 &&
      Number.isFinite(statusCode) &&
      statusCode >= 200 &&
      statusCode < 300
    ) {
      return;
    }
  }
  console.warn(
    `[vde-monitor][summary-publish] failed eventId=${event.eventId} status=${lastStatusCode ?? "unknown"} spawnStatus=${lastSpawnStatus ?? "unknown"}`,
  );
};

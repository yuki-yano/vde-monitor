import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { serveStatic } from "@hono/node-server/serve-static";
import type { AgentMonitorConfig } from "@vde-monitor/multiplexer";
import { Hono } from "hono";

import { rotateToken } from "./config";
import { createApiRouter } from "./http/api-router";
import type { createSessionMonitor } from "./monitor";
import type {
  MultiplexerInputActions,
  MultiplexerLaunchCapability,
} from "@vde-monitor/multiplexer";
import type { NotificationService } from "./notifications/service";
import type { ScreenStreamScheduler } from "./streams/screen-stream-scheduler";
import type { SessionsStreamSource } from "./streams/sessions-stream-source";
import type { StreamConnections } from "./streams/stream-connections";

type Monitor = ReturnType<typeof createSessionMonitor>;

type AppContext = {
  config: AgentMonitorConfig;
  monitor: Monitor;
  actions: MultiplexerInputActions;
  launchCapability?: MultiplexerLaunchCapability;
  notificationService: NotificationService;
  streamSource: SessionsStreamSource;
  screenScheduler: ScreenStreamScheduler;
  streamConnections: StreamConnections;
};

export const createApp = ({
  config,
  monitor,
  actions,
  launchCapability,
  notificationService,
  streamSource,
  screenScheduler,
  streamConnections,
}: AppContext) => {
  const app = new Hono();

  const api = createApiRouter({
    config,
    monitor,
    actions,
    launchCapability,
    notificationService,
    streamSource,
    screenScheduler,
    streamConnections,
  });
  app.route("/api", api);

  // 認証・Origin チェックは api ルーターの api.use("*") が /api/* 全体に適用される。
  app.post("/api/admin/token/rotate", (c) => {
    const next = rotateToken();
    config.token = next.token;
    notificationService.removeAllSubscriptions();
    // 旧トークンで確立済みの SSE 接続をすべて切断する。
    streamConnections.closeAll();
    return c.json({ token: next.token });
  });

  const distRoot = path.dirname(fileURLToPath(import.meta.url));
  const bundledDistDir = path.resolve(distRoot, "web");
  const workspaceDistDir = path.resolve(distRoot, "../../web/dist");
  const distDir = fs.existsSync(bundledDistDir) ? bundledDistDir : workspaceDistDir;

  if (fs.existsSync(distDir)) {
    app.use("/*", serveStatic({ root: distDir }));
    app.get("/*", serveStatic({ root: distDir, path: "index.html" }));
  }

  return { app };
};

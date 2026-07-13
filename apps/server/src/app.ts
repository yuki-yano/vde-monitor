import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { serveStatic } from "@hono/node-server/serve-static";
import type { AgentMonitorConfig } from "@vde-monitor/multiplexer";
import { Hono } from "hono";

import { rotateToken } from "./config";
import { PreviewTicketService } from "./file-preview";
import { createApiRouter } from "./http/api-router";
import { createFilePreviewRoutes } from "./http/routes/file-preview-routes";
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
  const previewTicketService = new PreviewTicketService();

  const api = createApiRouter({
    config,
    monitor,
    actions,
    launchCapability,
    notificationService,
    streamSource,
    screenScheduler,
    streamConnections,
    previewTicketService,
  });
  app.route("/api", api);
  app.route(
    "/file-preview",
    createFilePreviewRoutes({
      previewTicketService,
      allowedFrameOrigins: config.allowedOrigins,
    }),
  );

  // The API router's api.use("*") applies authentication and Origin checks to all /api/* routes.
  app.post("/api/admin/token/rotate", (c) => {
    const next = rotateToken();
    config.token = next.token;
    notificationService.removeAllSubscriptions();
    // Disconnect every SSE connection established with the previous token.
    streamConnections.closeAll();
    previewTicketService.revokeAll();
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

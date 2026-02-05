import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { serveStatic } from "@hono/node-server/serve-static";
import type { AgentMonitorConfig } from "@vde-monitor/shared";
import { Hono } from "hono";

import { rotateToken } from "./config.js";
import { createApiRouter } from "./http/api-router.js";
import { buildError, isOriginAllowed, requireAuth, requireStaticAuth } from "./http/helpers.js";
import type { createSessionMonitor } from "./monitor.js";
import type { createTmuxActions } from "./tmux-actions.js";

type Monitor = ReturnType<typeof createSessionMonitor>;
type TmuxActions = ReturnType<typeof createTmuxActions>;

type AppContext = {
  config: AgentMonitorConfig;
  monitor: Monitor;
  tmuxActions: TmuxActions;
};

export type ApiAppType = ReturnType<typeof createApiRouter>;

export const createApp = ({ config, monitor, tmuxActions }: AppContext) => {
  const app = new Hono();

  const api = createApiRouter({ config, monitor, tmuxActions });
  app.route("/api", api);

  app.use("/api/admin/*", async (c, next) => {
    if (!requireAuth(config, c)) {
      return c.json({ error: buildError("INVALID_PAYLOAD", "unauthorized") }, 401);
    }
    const origin = c.req.header("origin");
    const host = c.req.header("host");
    if (!isOriginAllowed(config, origin, host)) {
      return c.json({ error: buildError("INVALID_PAYLOAD", "origin not allowed") }, 403);
    }
    await next();
  });
  app.post("/api/admin/token/rotate", (c) => {
    const next = rotateToken();
    config.token = next.token;
    return c.json({ token: next.token });
  });

  const distRoot = path.dirname(fileURLToPath(import.meta.url));
  const bundledDistDir = path.resolve(distRoot, "web");
  const workspaceDistDir = path.resolve(distRoot, "../../web/dist");
  const distDir = fs.existsSync(bundledDistDir) ? bundledDistDir : workspaceDistDir;

  if (fs.existsSync(distDir)) {
    app.use("/*", async (c, next) => {
      if (!config.staticAuth) {
        return next();
      }
      if (!requireStaticAuth(config, c)) {
        return c.text("Unauthorized", 401);
      }
      return next();
    });

    app.use("/*", serveStatic({ root: distDir }));
    app.get("/*", serveStatic({ root: distDir, path: "index.html" }));
  }

  return { app };
};

import { Hono } from "hono";

import { nowIso } from "../helpers";
import { createInputRoutes } from "./session-routes/input-routes";
import { createLaunchRoute } from "./session-routes/launch-route";
import { createNotesRoutes } from "./session-routes/notes-routes";
import { createScreenRoutes } from "./session-routes/screen-routes";
import { createStateRoutes } from "./session-routes/state-routes";
import {
  type ResolvedPane,
  createWithPane,
  resolveLatestSessionResponse,
} from "./session-routes/shared";
import { createStreamRoutes } from "./session-routes/stream-routes";
import type { SessionRouteDeps } from "./types";

export const createSessionRoutes = ({
  config,
  monitor,
  actions,
  launchCapability,
  screenLimiter,
  sendLimiter,
  screenCache,
  getLimiterKey,
  resolvePane,
  resolveTitleUpdate,
  validateAttachmentContentLength,
  executeCommand,
  streamSource,
  screenScheduler,
  streamConnections,
}: SessionRouteDeps) => {
  const app = new Hono();
  const withPane = createWithPane(resolvePane);
  const resolveLatestSession = (pane: ResolvedPane) => resolveLatestSessionResponse(monitor, pane);

  return app
    .get("/sessions", (c) => {
      return c.json({
        sessions: monitor.registry.snapshot(),
        serverTime: nowIso(),
        clientConfig: {
          capabilities: {
            screenImage:
              config.multiplexer.backend === "tmux" || config.multiplexer.backend === "wezterm",
            launchAgent: launchCapability != null,
            resumeAgent: launchCapability != null,
          },
          screen: { highlightCorrection: config.screen.highlightCorrection },
          fileNavigator: {
            autoExpandMatchLimit: config.fileNavigator.autoExpandMatchLimit,
          },
          workspaceTabs: {
            displayMode: config.workspaceTabs.displayMode,
          },
          launch: config.launch,
        },
      });
    })
    .route(
      "/",
      createLaunchRoute({
        monitor,
        launchCapability,
        multiplexerBackend: config.multiplexer.backend,
        sendLimiter,
        getLimiterKey,
      }),
    )
    .get("/sessions/:paneId", (c) => {
      return withPane(c, (pane) => c.json({ session: pane.detail }));
    })
    .route("/", createStateRoutes({ monitor, withPane }))
    .route(
      "/",
      createScreenRoutes({
        config,
        monitor,
        screenLimiter,
        screenCache,
        getLimiterKey,
        validateAttachmentContentLength,
        withPane,
      }),
    )
    .route(
      "/",
      createNotesRoutes({
        monitor,
        withPane,
      }),
    )
    .route(
      "/",
      createInputRoutes({
        monitor,
        actions,
        sendLimiter,
        getLimiterKey,
        withPane,
        resolveLatestSessionResponse: resolveLatestSession,
        resolveTitleUpdate,
        executeCommand,
      }),
    )
    .route(
      "/",
      createStreamRoutes({
        monitor,
        streamSource,
        screenScheduler,
        streamConnections,
      }),
    );
};

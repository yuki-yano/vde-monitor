import { Hono } from "hono";

import { nowIso } from "../helpers";
import { createInputRoutes } from "./session-routes/input-routes";
import { createLaunchRoute } from "./session-routes/launch-route";
import { createNotesRoutes } from "./session-routes/notes-routes";
import { createScreenRoutes } from "./session-routes/screen-routes";
import {
  createWithPane,
  type ResolvedPane,
  resolveLatestSessionResponse,
} from "./session-routes/shared";
import type { SessionRouteDeps } from "./types";

export const createSessionRoutes = ({
  config,
  monitor,
  actions,
  screenLimiter,
  sendLimiter,
  screenCache,
  getLimiterKey,
  resolvePane,
  resolveTitleUpdate,
  validateAttachmentContentLength,
  executeCommand,
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
        actions,
        sendLimiter,
        getLimiterKey,
      }),
    )
    .get("/sessions/:paneId", (c) => {
      return withPane(c, (pane) => c.json({ session: pane.detail }));
    })
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
    );
};

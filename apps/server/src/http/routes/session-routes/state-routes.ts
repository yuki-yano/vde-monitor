import { zValidator } from "@hono/zod-validator";
import { acknowledgeSessionViewRequestSchema } from "@vde-monitor/shared";
import { Hono } from "hono";

import type { Monitor } from "../types";
import type { WithPane } from "./shared";

export const createStateRoutes = ({
  monitor,
  withPane,
}: {
  monitor: Monitor;
  withPane: WithPane;
}) =>
  new Hono().post(
    "/sessions/:paneId/state/acknowledge",
    zValidator("json", acknowledgeSessionViewRequestSchema),
    (c) =>
      withPane(c, (pane) => {
        const body = c.req.valid("json");
        const session =
          monitor.acknowledgeView({
            paneId: pane.paneId,
            epoch: body.epoch,
            throughSeq: body.throughSeq,
          }) ?? pane.detail;
        return c.json({ session });
      }),
  );

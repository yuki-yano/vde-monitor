import { zValidator } from "@hono/zod-validator";
import type { RawItem } from "@vde-monitor/shared";
import { Hono } from "hono";

import { buildError } from "../../helpers";
import { createSendTextIdempotencyExecutor } from "../../send-text-idempotency";
import type { ExecuteCommand, Monitor, ResolveTitleUpdate, SessionRouteDeps } from "../types";
import {
  type ResolvedPane,
  type WithPane,
  sendKeysSchema,
  sendRawSchema,
  sendTextSchema,
  titleSchema,
} from "./shared";

export const createInputRoutes = ({
  monitor,
  actions,
  sendLimiter,
  getLimiterKey,
  withPane,
  resolveLatestSessionResponse,
  resolveTitleUpdate,
  executeCommand,
}: {
  monitor: Monitor;
  actions: SessionRouteDeps["actions"];
  sendLimiter: (key: string) => boolean;
  getLimiterKey: SessionRouteDeps["getLimiterKey"];
  withPane: WithPane;
  resolveLatestSessionResponse: (pane: ResolvedPane) => { session: unknown };
  resolveTitleUpdate: ResolveTitleUpdate;
  executeCommand: ExecuteCommand;
}) => {
  const sendTextIdempotency = createSendTextIdempotencyExecutor({});

  return new Hono()
    .put("/sessions/:paneId/title", zValidator("json", titleSchema), async (c) => {
      return withPane(c, (pane) => {
        const { title } = c.req.valid("json");
        const titleUpdate = resolveTitleUpdate(c, title);
        if (titleUpdate instanceof Response) {
          return titleUpdate;
        }
        monitor.setCustomTitle(pane.paneId, titleUpdate.nextTitle);
        return c.json(resolveLatestSessionResponse(pane));
      });
    })
    .post("/sessions/:paneId/touch", (c) => {
      return withPane(c, (pane) => {
        monitor.recordInput(pane.paneId);
        return c.json(resolveLatestSessionResponse(pane));
      });
    })
    .post("/sessions/:paneId/send/text", zValidator("json", sendTextSchema), async (c) => {
      return withPane(c, async (pane) => {
        const body = c.req.valid("json");
        const command = await sendTextIdempotency.execute({
          paneId: pane.paneId,
          text: body.text,
          enter: body.enter,
          requestId: body.requestId,
          executeSendText: ({ paneId, text, enter }) =>
            executeCommand(c, {
              type: "send.text",
              paneId,
              text,
              enter,
            }),
        });
        return c.json({ command });
      });
    })
    .post("/sessions/:paneId/send/keys", zValidator("json", sendKeysSchema), async (c) => {
      return withPane(c, async (pane) => {
        const body = c.req.valid("json");
        const command = await executeCommand(c, {
          type: "send.keys",
          paneId: pane.paneId,
          keys: body.keys,
        });
        return c.json({ command });
      });
    })
    .post("/sessions/:paneId/send/raw", zValidator("json", sendRawSchema), async (c) => {
      return withPane(c, async (pane) => {
        const body = c.req.valid("json");
        const command = await executeCommand(c, {
          type: "send.raw",
          paneId: pane.paneId,
          items: body.items as RawItem[],
          unsafe: body.unsafe,
        });
        return c.json({ command });
      });
    })
    .post("/sessions/:paneId/kill/pane", async (c) => {
      return withPane(c, async (pane) => {
        if (!sendLimiter(getLimiterKey(c))) {
          return c.json({
            command: {
              ok: false,
              error: buildError("RATE_LIMIT", "rate limited"),
            },
          });
        }
        const command = await actions.killPane(pane.paneId);
        return c.json({ command });
      });
    })
    .post("/sessions/:paneId/kill/window", async (c) => {
      return withPane(c, async (pane) => {
        if (!sendLimiter(getLimiterKey(c))) {
          return c.json({
            command: {
              ok: false,
              error: buildError("RATE_LIMIT", "rate limited"),
            },
          });
        }
        const command = await actions.killWindow(pane.paneId);
        return c.json({ command });
      });
    })
    .post("/sessions/:paneId/focus", async (c) => {
      return withPane(c, async (pane) => {
        if (!sendLimiter(getLimiterKey(c))) {
          return c.json({
            command: {
              ok: false,
              error: buildError("RATE_LIMIT", "rate limited"),
            },
          });
        }
        const command = await actions.focusPane(pane.paneId);
        return c.json({ command });
      });
    });
};

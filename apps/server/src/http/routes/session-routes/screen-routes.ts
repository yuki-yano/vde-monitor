import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { createScreenResponse } from "../../../screen/screen-response";
import { buildError } from "../../helpers";
import {
  IMAGE_ATTACHMENT_MAX_CONTENT_LENGTH_BYTES,
  ImageAttachmentError,
  saveImageAttachment,
} from "../../image-attachment";
import type {
  Monitor,
  ScreenCache,
  SessionRouteDeps,
  ValidateAttachmentContentLength,
} from "../types";
import { resolveWorktreeListPayload } from "../worktree-utils";
import {
  imageAttachmentFormSchema,
  resolveTimelineRange,
  resolveTimelineScope,
  screenRequestSchema,
  timelineQuerySchema,
  type WithPane,
} from "./shared";

export const createScreenRoutes = ({
  config,
  monitor,
  screenLimiter,
  screenCache,
  getLimiterKey,
  validateAttachmentContentLength,
  withPane,
}: {
  config: SessionRouteDeps["config"];
  monitor: Monitor;
  screenLimiter: (key: string) => boolean;
  screenCache: ScreenCache;
  getLimiterKey: SessionRouteDeps["getLimiterKey"];
  validateAttachmentContentLength: ValidateAttachmentContentLength;
  withPane: WithPane;
}) => {
  return new Hono()
    .get("/sessions/:paneId/worktrees", async (c) => {
      return withPane(c, async (pane) => {
        const worktrees = await resolveWorktreeListPayload(pane.detail);
        return c.json({ worktrees });
      });
    })
    .get("/sessions/:paneId/timeline", zValidator("query", timelineQuerySchema), (c) => {
      return withPane(c, (pane) => {
        const query = c.req.valid("query");
        const range = resolveTimelineRange(query.range);
        const scope = resolveTimelineScope(query.scope);
        const limit = query.limit;
        const timeline =
          scope === "repo"
            ? monitor.getRepoStateTimeline(pane.paneId, range, limit)
            : monitor.getStateTimeline(pane.paneId, range, limit);
        if (!timeline) {
          return c.json(
            { error: buildError("INVALID_PAYLOAD", "repo timeline is unavailable") },
            400,
          );
        }
        return c.json({ timeline });
      });
    })
    .post(
      "/sessions/:paneId/attachments/image",
      zValidator("form", imageAttachmentFormSchema),
      async (c) => {
        return withPane(c, async (pane) => {
          const contentLength = validateAttachmentContentLength(c);
          if (contentLength instanceof Response) {
            return contentLength;
          }
          if (contentLength > IMAGE_ATTACHMENT_MAX_CONTENT_LENGTH_BYTES) {
            return c.json(
              { error: buildError("INVALID_PAYLOAD", "attachment exceeds content-length limit") },
              400,
            );
          }
          const { image } = c.req.valid("form");
          if (!(image instanceof File)) {
            return c.json({ error: buildError("INVALID_PAYLOAD", "image field is required") }, 400);
          }

          try {
            const attachment = await saveImageAttachment({
              paneId: pane.paneId,
              repoRoot: pane.detail.repoRoot,
              file: image,
            });
            return c.json({ attachment });
          } catch (error) {
            if (error instanceof ImageAttachmentError) {
              return c.json({ error: buildError(error.code, error.message) }, error.status);
            }
            return c.json(
              { error: buildError("INTERNAL", "failed to save image attachment") },
              500,
            );
          }
        });
      },
    )
    .post("/sessions/:paneId/screen", zValidator("json", screenRequestSchema), async (c) => {
      return withPane(c, async (pane) => {
        monitor.markPaneViewed(pane.paneId);
        const body = c.req.valid("json");
        const screen = await createScreenResponse({
          config,
          monitor,
          target: pane.detail,
          mode: body.mode,
          lines: body.lines,
          cursor: body.cursor,
          screenLimiter,
          limiterKey: getLimiterKey(c),
          buildTextResponse: screenCache.buildTextResponse,
        });
        return c.json({ screen });
      });
    });
};

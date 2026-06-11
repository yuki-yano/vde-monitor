import type { SessionDetail } from "@vde-monitor/shared";

import { buildError } from "./helpers";
import { IMAGE_ATTACHMENT_MAX_CONTENT_LENGTH_BYTES } from "./image-attachment";
import type { Monitor, RouteContext } from "./routes/types";

/**
 * Resolves pane id and session detail from the route context.
 * Returns `{ paneId, detail }` on success or a JSON error Response on failure.
 */
export const resolvePane = (
  c: RouteContext,
  monitor: Monitor,
): { paneId: string; detail: SessionDetail } | Response => {
  const paneId = c.req.param("paneId");
  if (!paneId) {
    return c.json({ error: buildError("INVALID_PAYLOAD", "invalid pane id") }, 400);
  }
  const detail = monitor.registry.getDetail(paneId);
  if (!detail) {
    return c.json({ error: buildError("INVALID_PANE", "pane not found") }, 404);
  }
  return { paneId, detail };
};

/**
 * Validates and trims a title value for a session update.
 * Returns `{ nextTitle }` on success or a JSON error Response on failure.
 */
export const resolveTitleUpdate = (
  c: RouteContext,
  title: string | null,
): { nextTitle: string | null } | Response => {
  const trimmed = title ? title.trim() : null;
  if (trimmed && trimmed.length > 80) {
    return c.json({ error: buildError("INVALID_PAYLOAD", "title too long") }, 400);
  }
  return { nextTitle: trimmed && trimmed.length > 0 ? trimmed : null };
};

/**
 * Validates the content-length header for attachment uploads.
 * Returns the parsed byte count on success or a JSON error Response on failure.
 */
export const validateAttachmentContentLength = (c: RouteContext): number | Response => {
  const header = c.req.header("content-length") ?? c.req.header("Content-Length");
  if (!header) {
    return c.json(
      { error: buildError("INVALID_PAYLOAD", "content-length header is required") },
      400,
    );
  }
  const normalized = header.trim();
  if (!/^\d+$/.test(normalized)) {
    return c.json({ error: buildError("INVALID_PAYLOAD", "invalid content-length") }, 400);
  }
  const contentLength = Number(normalized);
  if (!Number.isSafeInteger(contentLength) || contentLength < 1) {
    return c.json({ error: buildError("INVALID_PAYLOAD", "invalid content-length") }, 400);
  }
  if (contentLength > IMAGE_ATTACHMENT_MAX_CONTENT_LENGTH_BYTES) {
    return c.json(
      { error: buildError("INVALID_PAYLOAD", "attachment exceeds content-length limit") },
      400,
    );
  }
  return contentLength;
};

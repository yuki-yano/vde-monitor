import {
  allowedKeySchema,
  launchAgentRequestSchema,
  type SessionStateTimelineRange,
  type SessionStateTimelineScope,
} from "@vde-monitor/shared";
import { z } from "zod";

import type { Monitor, ResolvePane, RouteContext } from "../types";

export const timelineQuerySchema = z.object({
  scope: z.enum(["pane", "repo"]).optional(),
  range: z.enum(["15m", "1h", "3h", "6h", "24h"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const titleSchema = z.object({
  title: z.string().nullable(),
});

export const screenRequestSchema = z.object({
  mode: z.enum(["text", "image"]).optional(),
  lines: z.number().int().min(1).optional(),
  cursor: z.string().optional(),
});

export const sendTextSchema = z.object({
  text: z.string(),
  enter: z.boolean().optional(),
  requestId: z.string().trim().min(1).max(128).optional(),
});

export const sendKeysSchema = z.object({
  keys: z.array(allowedKeySchema),
});

const rawItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), value: z.string() }),
  z.object({ kind: z.literal("key"), value: allowedKeySchema }),
]);

export const sendRawSchema = z.object({
  items: z.array(rawItemSchema),
  unsafe: z.boolean().optional(),
});

export const notePayloadSchema = z.object({
  title: z.string().max(120).nullable().optional(),
  body: z.string().max(10_000),
});

export const imageAttachmentFormSchema = z.object({
  image: z.instanceof(File).optional(),
});

export const launchRequestSchema = launchAgentRequestSchema;

export type ResolvedPane = Exclude<ReturnType<ResolvePane>, Response>;
export type WithPane = <TReturn>(
  c: RouteContext,
  handler: (pane: ResolvedPane) => TReturn,
) => TReturn | Response;

export const createWithPane =
  (resolvePane: ResolvePane) =>
  <TReturn>(c: RouteContext, handler: (pane: ResolvedPane) => TReturn): TReturn | Response => {
    const pane = resolvePane(c);
    if (pane instanceof Response) {
      return pane;
    }
    return handler(pane);
  };

export const resolveLatestSessionResponse = (monitor: Monitor, pane: ResolvedPane) => ({
  session: monitor.registry.getDetail(pane.paneId) ?? pane.detail,
});

export const resolveTimelineRange = (range: string | undefined): SessionStateTimelineRange => {
  if (range === "15m" || range === "1h" || range === "3h" || range === "6h" || range === "24h") {
    return range;
  }
  return "1h";
};

export const resolveTimelineScope = (scope: string | undefined): SessionStateTimelineScope => {
  if (scope === "repo") {
    return "repo";
  }
  return "pane";
};

export const normalizeNoteTitle = (title: string | null | undefined) => {
  if (title == null) {
    return null;
  }
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : null;
};

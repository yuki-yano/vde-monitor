import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { buildError } from "../../helpers";
import type { Monitor } from "../types";
import { normalizeNoteTitle, notePayloadSchema, type WithPane } from "./shared";

export const createNotesRoutes = ({
  monitor,
  withPane,
}: {
  monitor: Monitor;
  withPane: WithPane;
}) => {
  return new Hono()
    .get("/sessions/:paneId/notes", (c) => {
      return withPane(c, (pane) => {
        if (!pane.detail.repoRoot) {
          return c.json({ error: buildError("REPO_UNAVAILABLE", "repo root is unavailable") }, 400);
        }
        const notes = monitor.getRepoNotes(pane.paneId) ?? [];
        return c.json({ repoRoot: pane.detail.repoRoot, notes });
      });
    })
    .post("/sessions/:paneId/notes", zValidator("json", notePayloadSchema), (c) => {
      return withPane(c, (pane) => {
        if (!pane.detail.repoRoot) {
          return c.json({ error: buildError("REPO_UNAVAILABLE", "repo root is unavailable") }, 400);
        }
        const payload = c.req.valid("json");
        const note = monitor.createRepoNote(pane.paneId, {
          title: normalizeNoteTitle(payload.title),
          body: payload.body,
        });
        if (!note) {
          return c.json({ error: buildError("REPO_UNAVAILABLE", "repo root is unavailable") }, 400);
        }
        return c.json({ note });
      });
    })
    .put("/sessions/:paneId/notes/:noteId", zValidator("json", notePayloadSchema), (c) => {
      return withPane(c, (pane) => {
        if (!pane.detail.repoRoot) {
          return c.json({ error: buildError("REPO_UNAVAILABLE", "repo root is unavailable") }, 400);
        }
        const noteId = c.req.param("noteId")?.trim();
        if (!noteId) {
          return c.json({ error: buildError("INVALID_PAYLOAD", "invalid note id") }, 400);
        }
        const payload = c.req.valid("json");
        const note = monitor.updateRepoNote(pane.paneId, noteId, {
          title: normalizeNoteTitle(payload.title),
          body: payload.body,
        });
        if (!note) {
          return c.json({ error: buildError("NOT_FOUND", "note not found") }, 404);
        }
        return c.json({ note });
      });
    })
    .delete("/sessions/:paneId/notes/:noteId", (c) => {
      return withPane(c, (pane) => {
        if (!pane.detail.repoRoot) {
          return c.json({ error: buildError("REPO_UNAVAILABLE", "repo root is unavailable") }, 400);
        }
        const noteId = c.req.param("noteId")?.trim();
        if (!noteId) {
          return c.json({ error: buildError("INVALID_PAYLOAD", "invalid note id") }, 400);
        }
        const removed = monitor.deleteRepoNote(pane.paneId, noteId);
        if (!removed) {
          return c.json({ error: buildError("NOT_FOUND", "note not found") }, 404);
        }
        return c.json({ noteId });
      });
    });
};

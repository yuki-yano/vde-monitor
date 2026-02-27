import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createSummaryEventStore } from "./summary-event-store";

const tempDirs: string[] = [];

const createTempSummaryPath = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vde-monitor-summary-store-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, "summary.jsonl");
  fs.writeFileSync(filePath, "", "utf8");
  return filePath;
};

const createSummaryEvent = ({
  summaryId,
  sourceAgent,
  sourceEventAt,
  locator,
}: {
  summaryId: string;
  sourceAgent: "codex" | "claude";
  sourceEventAt: string;
  locator: { tmux_pane?: string; tty?: string; cwd?: string };
}) => ({
  ts: sourceEventAt,
  summary_id: summaryId,
  source_agent: sourceAgent,
  event_type: "task_completed_summary" as const,
  source_event_at: sourceEventAt,
  pane_locator: locator,
  summary: {
    pane_title: "Done",
    notification_title: `Title ${summaryId}`,
    notification_body: `Body ${summaryId}`,
  },
  engine: {
    agent: sourceAgent,
    model: sourceAgent === "codex" ? "gpt-5.3-codex-spark" : "claude-haiku-4-5",
    effort: "low" as const,
  },
  source: {},
});

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("createSummaryEventStore", () => {
  it("selects earliest in-window summary for matching source and pane", async () => {
    const filePath = createTempSummaryPath();
    const baseMs = Date.parse("2026-02-20T00:00:00.000Z");
    const nowMs = vi.fn(() => baseMs + 500);
    const logger = { log: vi.fn() };
    fs.appendFileSync(
      filePath,
      [
        JSON.stringify(
          createSummaryEvent({
            summaryId: "s-mismatch",
            sourceAgent: "claude",
            sourceEventAt: "2026-02-20T00:00:00.400Z",
            locator: { tmux_pane: "%1" },
          }),
        ),
        JSON.stringify(
          createSummaryEvent({
            summaryId: "s-valid-early",
            sourceAgent: "codex",
            sourceEventAt: "2026-02-20T00:00:00.600Z",
            locator: { tmux_pane: "%1" },
          }),
        ),
        JSON.stringify(
          createSummaryEvent({
            summaryId: "s-valid-late",
            sourceAgent: "codex",
            sourceEventAt: "2026-02-20T00:00:00.900Z",
            locator: { tmux_pane: "%1" },
          }),
        ),
        "",
      ].join("\n"),
      "utf8",
    );

    const store = createSummaryEventStore({
      filePath,
      nowMs,
      sleep: async () => undefined,
      logger,
    });

    const result = await store.waitForSummary({
      paneId: "%1",
      paneTty: "tty1",
      cwd: "/repo",
      sourceAgent: "codex",
      transitionAt: "2026-02-20T00:00:00.000Z",
      waitMs: 7000,
    });

    expect(result?.event.summary_id).toBe("s-valid-early");
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("summary_wait_hit"));
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("summary_candidate_rejected"));
  });

  it("returns null on timeout when no candidate arrives", async () => {
    const filePath = createTempSummaryPath();
    let currentMs = Date.parse("2026-02-20T00:00:00.000Z");
    const logger = { log: vi.fn() };
    const store = createSummaryEventStore({
      filePath,
      nowMs: () => currentMs,
      sleep: async (ms) => {
        currentMs += ms;
      },
      logger,
      pollIntervalMs: 20,
    });

    const result = await store.waitForSummary({
      paneId: "%1",
      paneTty: "tty1",
      cwd: "/repo",
      sourceAgent: "codex",
      transitionAt: "2026-02-20T00:00:00.000Z",
      waitMs: 50,
    });

    expect(result).toBeNull();
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("summary_wait_timeout"));
  });
});

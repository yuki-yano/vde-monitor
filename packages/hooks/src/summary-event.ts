import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { SummaryEngineConfig, SummaryEvent } from "@vde-monitor/shared";

import { loadConfig, resolveHookServerKey } from "./cli";
import type { SummaryText } from "./summary-engine";

type SummarySource = {
  turn_id?: string;
  session_id?: string;
  hook_event_name?: string;
};

export const buildSummaryEvent = ({
  sourceAgent,
  sourceEventAt,
  paneLocator,
  summary,
  engine,
  source,
}: {
  sourceAgent: "codex" | "claude";
  sourceEventAt: string;
  paneLocator: {
    tmux_pane?: string;
    tty?: string;
    cwd?: string;
  };
  summary: SummaryText;
  engine: SummaryEngineConfig;
  source: SummarySource;
}): SummaryEvent => ({
  ts: new Date().toISOString(),
  summary_id: randomUUID(),
  source_agent: sourceAgent,
  event_type: "task_completed_summary",
  source_event_at: sourceEventAt,
  pane_locator: {
    ...(paneLocator.tmux_pane ? { tmux_pane: paneLocator.tmux_pane } : {}),
    ...(paneLocator.tty ? { tty: paneLocator.tty } : {}),
    ...(paneLocator.cwd ? { cwd: paneLocator.cwd } : {}),
  },
  summary: {
    pane_title: summary.paneTitle,
    notification_title: summary.notificationTitle,
    notification_body: summary.notificationBody,
  },
  engine,
  source: {
    ...(source.turn_id ? { turn_id: source.turn_id } : {}),
    ...(source.session_id ? { session_id: source.session_id } : {}),
    ...(source.hook_event_name ? { hook_event_name: source.hook_event_name } : {}),
  },
});

export const appendSummaryEvent = (event: SummaryEvent) => {
  const config = loadConfig();
  const serverKey = resolveHookServerKey(config);
  const baseDir = path.join(os.homedir(), ".vde-monitor");
  const eventsDir = path.join(baseDir, "events", serverKey);
  const eventsPath = path.join(eventsDir, "summary.jsonl");
  fs.mkdirSync(eventsDir, { recursive: true, mode: 0o700 });
  fs.appendFileSync(eventsPath, `${JSON.stringify(event)}\n`, "utf8");
};

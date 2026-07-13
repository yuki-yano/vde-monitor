import path from "node:path";

import { encodePaneId } from "@vde-monitor/shared";

export const resolveLogPaths = (baseDir: string, serverKey: string, paneId: string) => {
  const paneIdEncoded = encodePaneId(paneId);
  const paneLogFileId = paneIdEncoded.replaceAll("_", "_u").replaceAll("%", "_p");
  const panesDir = path.join(baseDir, "panes", serverKey);
  const eventsDir = path.join(baseDir, "events", serverKey);
  return {
    paneIdEncoded,
    panesDir,
    eventsDir,
    paneLogPath: path.join(panesDir, `${paneLogFileId}.log`),
    eventLogPath: path.join(eventsDir, "claude.jsonl"),
  };
};

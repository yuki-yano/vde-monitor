import { describe, expect, it } from "vitest";

import { resolveLogPaths } from "./log-paths";

describe("resolveLogPaths", () => {
  it("encodes paneId into a percent-free pane log file id", () => {
    const paths = resolveLogPaths("/base", "server", "%1");
    expect(paths.paneIdEncoded).toBe("%251");
    expect(paths.paneLogPath).toBe("/base/panes/server/_p251.log");
    expect(paths.eventLogPath).toBe("/base/events/server/claude.jsonl");
  });

  it("handles special pane IDs without collisions", () => {
    const paths = resolveLogPaths("/base", "server", "%1/2");
    const collidingCandidate = resolveLogPaths("/base", "server", "%12F2");
    expect(paths.paneIdEncoded).toBe("%251%2F2");
    expect(paths.paneLogPath).toBe("/base/panes/server/_p251_p2F2.log");
    expect(collidingCandidate.paneLogPath).toBe("/base/panes/server/_p2512F2.log");
    expect(paths.paneLogPath).not.toBe(collidingCandidate.paneLogPath);
  });
});

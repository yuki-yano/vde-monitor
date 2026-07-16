import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildPaneLogDaemonBaseCommand } from "./runtime-tmux";

describe("buildPaneLogDaemonBaseCommand", () => {
  it("preserves every execArgv entry and resolves the dev entrypoint", () => {
    expect(
      buildPaneLogDaemonBaseCommand({
        execPath: "/opt/node/bin/node",
        execArgv: ["--require", "/tsx/preflight.cjs", "--import", "file:///tsx/loader.mjs"],
        entrypoint: "apps/server/src/index.ts",
      }),
    ).toEqual([
      "/opt/node/bin/node",
      "--require",
      "/tsx/preflight.cjs",
      "--import",
      "file:///tsx/loader.mjs",
      path.resolve("apps/server/src/index.ts"),
      "internal",
      "pane-log-daemon",
    ]);
  });

  it("keeps an absolute packaged entrypoint", () => {
    expect(
      buildPaneLogDaemonBaseCommand({
        execPath: "/opt/node/bin/node",
        execArgv: [],
        entrypoint: "/app/dist/index.js",
      }),
    ).toEqual(["/opt/node/bin/node", "/app/dist/index.js", "internal", "pane-log-daemon"]);
  });

  it("rejects a missing entrypoint", () => {
    expect(() =>
      buildPaneLogDaemonBaseCommand({
        execPath: "/opt/node/bin/node",
        execArgv: [],
        entrypoint: undefined,
      }),
    ).toThrow("process.argv[1]");
  });
});

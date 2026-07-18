import { describe, expect, it } from "vitest";

import { buildAgent } from "./agent-resolver-utils";

describe("buildAgent", () => {
  it.each([
    ["codex --yolo", "codex"],
    ["/opt/bin/codex resume session-id", "codex"],
    ["node /opt/npm/bin/codex --yolo", "codex"],
    ["node /opt/npm/bin/codex.js --yolo", "codex"],
    ["claude --dangerously-skip-permissions", "claude"],
    ["/opt/bin/claude", "claude"],
  ] as const)("recognizes an interactive Agent command: %s", (command, expected) => {
    expect(buildAgent(command)).toBe(expected);
  });

  it.each([
    "codex app-server --listen stdio://",
    "/opt/bin/codex -c features.foo=true app-server --listen stdio://",
    "node /opt/npm/bin/codex app-server --listen stdio://",
  ])("rejects the non-interactive Codex app-server command: %s", (command) => {
    expect(buildAgent(command)).toBe("unknown");
  });

  it.each([
    "rg codex",
    "node server.js --provider claude",
    "/repos/codex-tools/bin/server --listen",
    "codex-code-mode-host",
  ])("does not infer an Agent from an arbitrary command argument or path: %s", (command) => {
    expect(buildAgent(command)).toBe("unknown");
  });
});

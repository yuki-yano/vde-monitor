import { afterEach, describe, expect, it, vi } from "vitest";

import { printCodexHooksSnippet } from "./print-codex-hooks-snippet";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("printCodexHooksSnippet", () => {
  it("prints hooks config for all codex events", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    printCodexHooksSnippet();

    expect(log).toHaveBeenCalledTimes(1);
    const snippet = JSON.parse(log.mock.calls[0]?.[0] as string);
    const events = ["PreToolUse", "PostToolUse", "PermissionRequest", "Stop", "UserPromptSubmit"];
    expect(Object.keys(snippet.hooks)).toEqual(events);
    events.forEach((event) => {
      expect(snippet.hooks[event]).toEqual([
        { hooks: [{ type: "command", command: `vde-monitor-hook codex ${event}` }] },
      ]);
    });
  });
});

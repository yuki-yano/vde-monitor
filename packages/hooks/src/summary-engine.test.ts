import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  spawnSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  default: {
    spawnSync: mocks.spawnSync,
  },
  spawnSync: mocks.spawnSync,
}));

import { runSummaryWithClaude, runSummaryWithCodex } from "./summary-engine";

describe("summary-engine", () => {
  let originalXdgCacheHome: string | undefined;
  let cacheHome: string | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    originalXdgCacheHome = process.env.XDG_CACHE_HOME;
    cacheHome = fs.mkdtempSync(path.join(os.tmpdir(), "vde-monitor-summary-engine-test-"));
    process.env.XDG_CACHE_HOME = cacheHome;
  });

  afterEach(() => {
    if (originalXdgCacheHome == null) {
      delete process.env.XDG_CACHE_HOME;
    } else {
      process.env.XDG_CACHE_HOME = originalXdgCacheHome;
    }
    if (cacheHome) {
      fs.rmSync(cacheHome, { recursive: true, force: true });
      cacheHome = null;
    }
  });

  it("runs codex summary with project doc disabled", () => {
    mocks.spawnSync.mockReturnValue({
      status: 1,
      stdout: "",
      stderr: "",
      output: [],
      pid: 1,
      signal: null,
    } as never);

    const result = runSummaryWithCodex({
      prompt: "hello",
      model: "gpt-5.3-codex-spark",
      effort: "low",
      timeoutMs: 4_321,
    });

    expect(result).toBeNull();
    expect(mocks.spawnSync).toHaveBeenCalledTimes(1);

    const [command, args, options] = mocks.spawnSync.mock.calls[0] ?? [];
    expect(command).toBe("codex");
    expect(args).toEqual(expect.arrayContaining(["-c", "project_doc_max_bytes=0"]));
    expect(options).toMatchObject({
      cwd: os.tmpdir(),
      input: "hello",
      timeout: 4_321,
      encoding: "utf8",
      stdio: ["pipe", "ignore", "ignore"],
    });
  });

  it("runs claude summary with simple mode and user-only settings", () => {
    mocks.spawnSync.mockReturnValue({
      status: 0,
      stdout: JSON.stringify({
        structured_output: {
          pane_title: "Done",
          notification_title: "Task done",
          notification_body: "Tests passed",
        },
      }),
      stderr: "",
      output: [],
      pid: 1,
      signal: null,
    } as never);

    const result = runSummaryWithClaude({
      prompt: "summarize",
      model: "claude-haiku-4-5",
      effort: "medium",
      timeoutMs: 8_765,
    });

    expect(result).toEqual({
      pane_title: "Done",
      notification_title: "Task done",
      notification_body: "Tests passed",
    });

    expect(mocks.spawnSync).toHaveBeenCalledTimes(1);
    const [command, args, options] = mocks.spawnSync.mock.calls[0] ?? [];
    expect(command).toBe("claude");
    expect(args).toEqual(expect.arrayContaining(["--setting-sources", "user"]));
    expect(args).toContain("--disable-slash-commands");
    expect(options).toMatchObject({
      cwd: os.tmpdir(),
      input: "summarize",
      timeout: 8_765,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    expect(options?.env?.CLAUDE_CODE_SIMPLE).toBe("1");
    expect(options?.env?.CLAUDE_CODE_EFFORT_LEVEL).toBe("medium");
  });
});

import { defaultConfig } from "@vde-monitor/shared";
import { execa } from "execa";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { markPaneFocus } from "./activity-suppressor";
import { resolveVwWorktreeSnapshotCached } from "./monitor/vw-worktree";
import { resolveBackendApp } from "./screen/macos-app";
import { focusTerminalApp, isAppRunning } from "./screen/macos-applescript";
import { focusTmuxPane } from "./screen/tmux-geometry";
import { createTmuxActions } from "./tmux-actions";

vi.mock("./screen/macos-app", () => ({
  resolveBackendApp: vi.fn(),
}));

vi.mock("./screen/macos-applescript", () => ({
  isAppRunning: vi.fn(),
  focusTerminalApp: vi.fn(),
}));

vi.mock("./screen/tmux-geometry", () => ({
  focusTmuxPane: vi.fn(),
}));

vi.mock("./activity-suppressor", () => ({
  markPaneFocus: vi.fn(),
}));

vi.mock("./monitor/vw-worktree", () => ({
  resolveVwWorktreeSnapshotCached: vi.fn(),
}));

vi.mock("execa", () => ({
  execa: vi.fn(),
}));

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");

const setProcessPlatform = (platform: NodeJS.Platform) => {
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
};

describe("createTmuxActions.sendText", () => {
  it("sends enter key after text when enabled", async () => {
    const adapter = {
      run: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
    };
    const config = {
      ...defaultConfig,
      token: "test-token",
      input: { ...defaultConfig.input, enterKey: "C-m", enterDelayMs: 0 },
    };
    const tmuxActions = createTmuxActions(adapter, config);

    const result = await tmuxActions.sendText("%1", "echo hi", true);

    expect(result.ok).toBe(true);
    expect(adapter.run).toHaveBeenNthCalledWith(1, [
      "if-shell",
      "-t",
      "%1",
      '[ "#{pane_in_mode}" = "1" ]',
      "copy-mode -q -t %1",
    ]);
    expect(adapter.run).toHaveBeenNthCalledWith(2, [
      "send-keys",
      "-l",
      "-t",
      "%1",
      "--",
      "echo hi",
    ]);
    expect(adapter.run).toHaveBeenNthCalledWith(3, ["send-keys", "-t", "%1", "C-m"]);
  });

  it("sends multiline text as a single bracketed paste", async () => {
    const adapter = {
      run: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
    };
    const config = {
      ...defaultConfig,
      token: "test-token",
      input: { ...defaultConfig.input, enterKey: "C-m", enterDelayMs: 0 },
    };
    const tmuxActions = createTmuxActions(adapter, config);

    const result = await tmuxActions.sendText("%1", "echo 1\npwd", true);

    expect(result.ok).toBe(true);
    expect(adapter.run).toHaveBeenNthCalledWith(1, [
      "if-shell",
      "-t",
      "%1",
      '[ "#{pane_in_mode}" = "1" ]',
      "copy-mode -q -t %1",
    ]);
    expect(adapter.run).toHaveBeenNthCalledWith(2, [
      "send-keys",
      "-l",
      "-t",
      "%1",
      "--",
      "\u001b[200~echo 1\npwd\u001b[201~",
    ]);
    expect(adapter.run).toHaveBeenNthCalledWith(3, ["send-keys", "-t", "%1", "C-m"]);
  });

  it("sends leading hyphen text as a literal argument", async () => {
    const adapter = {
      run: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
    };
    const config = {
      ...defaultConfig,
      token: "test-token",
      input: { ...defaultConfig.input, enterKey: "C-m", enterDelayMs: 0 },
    };
    const tmuxActions = createTmuxActions(adapter, config);

    const result = await tmuxActions.sendText("%1", "-abc", false);

    expect(result.ok).toBe(true);
    expect(adapter.run).toHaveBeenNthCalledWith(2, ["send-keys", "-l", "-t", "%1", "--", "-abc"]);
  });

  it("detects dangerous commands across split sends", async () => {
    const adapter = {
      run: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
    };
    const config = {
      ...defaultConfig,
      token: "test-token",
      input: { ...defaultConfig.input, enterKey: "C-m", enterDelayMs: 0 },
    };
    const tmuxActions = createTmuxActions(adapter, config);

    const first = await tmuxActions.sendText("%1", "rm ", false);
    const second = await tmuxActions.sendText("%1", "-rf /tmp", true);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.error?.code).toBe("DANGEROUS_COMMAND");
    expect(adapter.run).toHaveBeenCalledTimes(2);
  });
});

describe("createTmuxActions.focusPane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setProcessPlatform("darwin");
    vi.mocked(resolveBackendApp).mockReturnValue({
      key: "terminal",
      appName: "Terminal",
    });
    vi.mocked(isAppRunning).mockResolvedValue(true);
    vi.mocked(focusTerminalApp).mockResolvedValue();
    vi.mocked(markPaneFocus).mockImplementation(() => undefined);
    vi.mocked(focusTmuxPane).mockResolvedValue();
  });

  afterEach(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, "platform", originalPlatformDescriptor);
    }
  });

  it("rejects focus on non-macOS", async () => {
    setProcessPlatform("linux");
    const adapter = {
      run: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
    };
    const tmuxActions = createTmuxActions(adapter, { ...defaultConfig, token: "test-token" });

    const result = await tmuxActions.focusPane("%1");

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INVALID_PAYLOAD");
    expect(focusTerminalApp).not.toHaveBeenCalled();
  });

  it("returns TMUX_UNAVAILABLE when backend app is not running", async () => {
    vi.mocked(isAppRunning).mockResolvedValue(false);
    const adapter = {
      run: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
    };
    const tmuxActions = createTmuxActions(adapter, { ...defaultConfig, token: "test-token" });

    const result = await tmuxActions.focusPane("%1");

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("TMUX_UNAVAILABLE");
    expect(focusTerminalApp).not.toHaveBeenCalled();
    expect(markPaneFocus).not.toHaveBeenCalled();
    expect(focusTmuxPane).not.toHaveBeenCalled();
  });

  it("returns ok even when tmux pane focusing fails", async () => {
    vi.mocked(focusTmuxPane).mockRejectedValue(new Error("failed"));
    const adapter = {
      run: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
    };
    const config = { ...defaultConfig, token: "test-token" };
    const tmuxActions = createTmuxActions(adapter, config);

    const result = await tmuxActions.focusPane("%1");

    expect(result.ok).toBe(true);
    expect(resolveBackendApp).toHaveBeenCalledWith(config.screen.image.backend);
    expect(isAppRunning).toHaveBeenCalledWith("Terminal");
    expect(focusTerminalApp).toHaveBeenCalledWith("Terminal");
    expect(markPaneFocus).toHaveBeenCalledWith("%1");
    expect(focusTmuxPane).toHaveBeenCalledWith("%1", config.tmux);
  });
});

describe("createTmuxActions.sendKeys", () => {
  it("blocks configured danger keys", async () => {
    const adapter = {
      run: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
    };
    const tmuxActions = createTmuxActions(adapter, { ...defaultConfig, token: "test-token" });

    const result = await tmuxActions.sendKeys("%1", ["C-c"]);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("DANGEROUS_COMMAND");
    expect(adapter.run).not.toHaveBeenCalled();
  });
});

describe("createTmuxActions.sendRaw", () => {
  it("sends raw text and key items in order", async () => {
    const adapter = {
      run: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
    };
    const tmuxActions = createTmuxActions(adapter, { ...defaultConfig, token: "test-token" });

    const result = await tmuxActions.sendRaw(
      "%1",
      [
        { kind: "text", value: "ls" },
        { kind: "key", value: "Enter" },
      ],
      false,
    );

    expect(result.ok).toBe(true);
    expect(adapter.run).toHaveBeenNthCalledWith(1, [
      "if-shell",
      "-t",
      "%1",
      '[ "#{pane_in_mode}" = "1" ]',
      "copy-mode -q -t %1",
    ]);
    expect(adapter.run).toHaveBeenNthCalledWith(2, ["send-keys", "-l", "-t", "%1", "--", "ls"]);
    expect(adapter.run).toHaveBeenNthCalledWith(3, ["send-keys", "-t", "%1", "Enter"]);
  });

  it("blocks dangerous keys when unsafe is false", async () => {
    const adapter = {
      run: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
    };
    const tmuxActions = createTmuxActions(adapter, { ...defaultConfig, token: "test-token" });

    const result = await tmuxActions.sendRaw("%1", [{ kind: "key", value: "C-c" }], false);

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("DANGEROUS_COMMAND");
    expect(adapter.run).not.toHaveBeenCalled();
  });

  it("allows dangerous keys when unsafe is true", async () => {
    const adapter = {
      run: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
    };
    const tmuxActions = createTmuxActions(adapter, { ...defaultConfig, token: "test-token" });

    const result = await tmuxActions.sendRaw("%1", [{ kind: "key", value: "C-c" }], true);

    expect(result.ok).toBe(true);
    expect(adapter.run).toHaveBeenCalledWith(["send-keys", "-t", "%1", "C-c"]);
  });
});

describe("createTmuxActions.killPane / killWindow", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gracefully terminates pane session before kill-pane", async () => {
    vi.useFakeTimers();
    const adapter = {
      run: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
    };
    const tmuxActions = createTmuxActions(adapter, {
      ...defaultConfig,
      token: "test-token",
      input: { ...defaultConfig.input, enterKey: "C-m", enterDelayMs: 0 },
    });

    const promise = tmuxActions.killPane("%1");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(adapter.run).toHaveBeenNthCalledWith(1, [
      "if-shell",
      "-t",
      "%1",
      '[ "#{pane_in_mode}" = "1" ]',
      "copy-mode -q -t %1",
    ]);
    expect(adapter.run).toHaveBeenNthCalledWith(2, ["send-keys", "-t", "%1", "C-c"]);
    expect(adapter.run).toHaveBeenNthCalledWith(3, ["send-keys", "-l", "-t", "%1", "--", "exit"]);
    expect(adapter.run).toHaveBeenNthCalledWith(4, ["send-keys", "-t", "%1", "C-m"]);
    expect(adapter.run).toHaveBeenNthCalledWith(5, ["kill-pane", "-t", "%1"]);
  });

  it("kills pane window after graceful termination", async () => {
    vi.useFakeTimers();
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "list-panes") {
          return { stdout: "@42\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const tmuxActions = createTmuxActions(adapter, {
      ...defaultConfig,
      token: "test-token",
      input: { ...defaultConfig.input, enterKey: "C-m", enterDelayMs: 0 },
    });

    const promise = tmuxActions.killWindow("%1");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(adapter.run).toHaveBeenNthCalledWith(1, [
      "list-panes",
      "-t",
      "%1",
      "-F",
      "#{window_id}",
    ]);
    expect(adapter.run).toHaveBeenNthCalledWith(6, ["kill-window", "-t", "@42"]);
  });

  it("treats already-closed pane as successful kill-pane", async () => {
    vi.useFakeTimers();
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "kill-pane") {
          return { stdout: "", stderr: "can't find pane: %1", exitCode: 1 };
        }
        return { stdout: "", stderr: "can't find pane: %1", exitCode: 1 };
      }),
    };
    const tmuxActions = createTmuxActions(adapter, {
      ...defaultConfig,
      token: "test-token",
      input: { ...defaultConfig.input, enterKey: "C-m", enterDelayMs: 0 },
    });

    const promise = tmuxActions.killPane("%1");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(adapter.run).toHaveBeenCalledWith(["kill-pane", "-t", "%1"]);
  });
});

describe("createTmuxActions.launchAgentInSession", () => {
  beforeEach(() => {
    vi.mocked(resolveVwWorktreeSnapshotCached).mockReset();
    vi.mocked(execa).mockReset();
  });

  it("launches codex in a new detached window", async () => {
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-windows") {
          return { stdout: "main\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "new-window") {
          return { stdout: "@42\t3\tcodex-work\t%128\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes") {
          return { stdout: "codex\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const config = {
      ...defaultConfig,
      token: "test-token",
      launch: {
        agents: {
          codex: { options: ["--model", "gpt-5-codex"] },
          claude: { options: [] },
        },
      },
    };
    const tmuxActions = createTmuxActions(adapter, config);

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "dev-main",
      agent: "codex",
      windowName: "codex-work",
      cwd: "/tmp",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.result.windowId).toBe("@42");
    expect(result.result.paneId).toBe("%128");
    expect(result.result.verification.status).toBe("verified");
    expect(result.result.resolvedOptions).toEqual(["--model", "gpt-5-codex"]);
    expect(adapter.run).toHaveBeenCalledWith([
      "send-keys",
      "-l",
      "-t",
      "%128",
      "--",
      "codex '--model' 'gpt-5-codex'",
    ]);
    expect(result.rollback).toEqual({ attempted: false, ok: true });
  });

  it("overrides configured launch options when agentOptions are provided", async () => {
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-windows") {
          return { stdout: "main\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "new-window") {
          return { stdout: "@42\t3\tcodex-work\t%128\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes") {
          return { stdout: "codex\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const config = {
      ...defaultConfig,
      token: "test-token",
      launch: {
        agents: {
          codex: { options: ["--model", "gpt-5-codex"] },
          claude: { options: [] },
        },
      },
    };
    const tmuxActions = createTmuxActions(adapter, config);

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "dev-main",
      agent: "codex",
      agentOptions: ["--approval-mode", "full-auto"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.result.resolvedOptions).toEqual(["--approval-mode", "full-auto"]);
    expect(adapter.run).toHaveBeenCalledWith([
      "send-keys",
      "-l",
      "-t",
      "%128",
      "--",
      "codex '--approval-mode' 'full-auto'",
    ]);
  });

  it("appends suffix when requested window name already exists", async () => {
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-windows") {
          return {
            stdout: "codex-work\ncodex-work-2\n",
            stderr: "",
            exitCode: 0,
          };
        }
        if (args[0] === "new-window") {
          return { stdout: "@42\t4\tcodex-work-3\t%129\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes") {
          return { stdout: "codex\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const tmuxActions = createTmuxActions(adapter, { ...defaultConfig, token: "test-token" });

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "dev-main",
      agent: "codex",
      windowName: "codex-work",
    });

    expect(result.ok).toBe(true);
    expect(adapter.run).toHaveBeenCalledWith(
      expect.arrayContaining(["new-window", "-d", "-P", "-F"]),
    );
    expect(adapter.run).toHaveBeenCalledWith(
      expect.arrayContaining(["-n", "codex-work-3", "-t", "dev-main"]),
    );
  });

  it("resolves launch cwd from vw worktreePath", async () => {
    vi.mocked(resolveVwWorktreeSnapshotCached).mockResolvedValueOnce({
      repoRoot: "/tmp",
      baseBranch: "main",
      entries: [
        {
          path: "/tmp",
          branch: "feature/a",
          dirty: false,
          locked: { value: false, owner: null, reason: null },
          merged: { overall: false, byPR: null },
        },
      ],
    });
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes" && args.includes("#{pane_current_path}")) {
          return { stdout: "/tmp\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-windows") {
          return { stdout: "main\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "new-window") {
          return { stdout: "@55\t4\tcodex-work\t%155\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes" && args.includes("#{pane_current_command}")) {
          return { stdout: "codex\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const tmuxActions = createTmuxActions(adapter, { ...defaultConfig, token: "test-token" });

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "dev-main",
      agent: "codex",
      worktreePath: "/tmp",
    });

    expect(result.ok).toBe(true);
    expect(vi.mocked(resolveVwWorktreeSnapshotCached)).toHaveBeenCalledWith("/tmp");
    expect(adapter.run).toHaveBeenCalledWith(
      expect.arrayContaining(["new-window", "-d", "-P", "-F"]),
    );
    expect(adapter.run).toHaveBeenCalledWith(expect.arrayContaining(["-c", "/tmp"]));
  });

  it("returns INVALID_PAYLOAD when vw snapshot is unavailable", async () => {
    vi.mocked(resolveVwWorktreeSnapshotCached).mockResolvedValueOnce(null);
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes" && args.includes("#{pane_current_path}")) {
          return { stdout: "/repo\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const tmuxActions = createTmuxActions(adapter, { ...defaultConfig, token: "test-token" });

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "dev-main",
      agent: "claude",
      worktreeBranch: "feature/a",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("INVALID_PAYLOAD");
    expect(result.error.message).toContain("vw worktree snapshot is unavailable");
    expect(adapter.run.mock.calls.some((call) => call[0]?.[0] === "new-window")).toBe(false);
  });

  it("creates a worktree via vw switch when worktreeCreateIfMissing is true", async () => {
    vi.mocked(resolveVwWorktreeSnapshotCached).mockResolvedValueOnce({
      repoRoot: "/tmp",
      baseBranch: "main",
      entries: [
        {
          path: "/tmp/.worktree/feature/a",
          branch: "feature/a",
          dirty: false,
          locked: { value: false, owner: null, reason: null },
          merged: { overall: false, byPR: null },
        },
      ],
    });
    vi.mocked(execa)
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "",
        stderr: "",
      } as never)
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "/tmp\n",
        stderr: "",
      } as never);
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes" && args.includes("#{pane_current_path}")) {
          return { stdout: "/tmp\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-windows") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "new-window") {
          return { stdout: "@51\t2\tclaude-work\t%151\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes" && args.includes("#{pane_current_command}")) {
          return { stdout: "claude\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const tmuxActions = createTmuxActions(adapter, { ...defaultConfig, token: "test-token" });

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "dev-main",
      agent: "claude",
      worktreeBranch: "feature/new-pane",
      worktreeCreateIfMissing: true,
    });

    expect(result.ok).toBe(true);
    expect(vi.mocked(execa)).toHaveBeenNthCalledWith(
      1,
      "vw",
      ["switch", "feature/new-pane"],
      expect.objectContaining({ cwd: "/tmp" }),
    );
    expect(vi.mocked(execa)).toHaveBeenNthCalledWith(
      2,
      "vw",
      ["path", "feature/new-pane"],
      expect.objectContaining({ cwd: "/tmp" }),
    );
    expect(adapter.run).toHaveBeenCalledWith(
      expect.arrayContaining(["new-window", "-d", "-P", "-F"]),
    );
    expect(adapter.run).toHaveBeenCalledWith(expect.arrayContaining(["-c", "/tmp"]));
  });

  it("returns INVALID_PAYLOAD when worktreePath and worktreeCreateIfMissing are combined", async () => {
    const adapter = {
      run: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
    };
    const tmuxActions = createTmuxActions(adapter, { ...defaultConfig, token: "test-token" });

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "dev-main",
      agent: "claude",
      worktreePath: "/repo/.worktree/feature/a",
      worktreeBranch: "feature/a",
      worktreeCreateIfMissing: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("INVALID_PAYLOAD");
    expect(result.error.message).toContain("worktreePath cannot be combined");
  });

  it("returns INVALID_PAYLOAD when worktreePath and worktreeBranch mismatch", async () => {
    vi.mocked(resolveVwWorktreeSnapshotCached).mockResolvedValueOnce({
      repoRoot: "/repo",
      baseBranch: "main",
      entries: [
        {
          path: "/repo/.worktree/feature/a",
          branch: "feature/a",
          dirty: false,
          locked: { value: false, owner: null, reason: null },
          merged: { overall: false, byPR: null },
        },
        {
          path: "/repo/.worktree/feature/b",
          branch: "feature/b",
          dirty: false,
          locked: { value: false, owner: null, reason: null },
          merged: { overall: false, byPR: null },
        },
      ],
    });
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes" && args.includes("#{pane_current_path}")) {
          return { stdout: "/repo\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const tmuxActions = createTmuxActions(adapter, { ...defaultConfig, token: "test-token" });

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "dev-main",
      agent: "claude",
      worktreePath: "/repo/.worktree/feature/a",
      worktreeBranch: "feature/b",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("INVALID_PAYLOAD");
    expect(result.error.message).toContain("resolved to different worktrees");
    expect(adapter.run.mock.calls.some((call) => call[0]?.[0] === "new-window")).toBe(false);
  });

  it("returns NOT_FOUND when session does not exist", async () => {
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "missing", exitCode: 1 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const tmuxActions = createTmuxActions(adapter, { ...defaultConfig, token: "test-token" });

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "missing",
      agent: "claude",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("NOT_FOUND");
    expect(result.rollback).toEqual({ attempted: false, ok: true });
  });

  it("rolls back created window when send-keys fails", async () => {
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-windows") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "new-window") {
          return { stdout: "@42\t2\tclaude-work\t%130\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "send-keys" && args[1] === "-l") {
          return { stdout: "", stderr: "send failed", exitCode: 1 };
        }
        if (args[0] === "kill-window") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const tmuxActions = createTmuxActions(adapter, { ...defaultConfig, token: "test-token" });

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "dev-main",
      agent: "claude",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("INTERNAL");
    expect(result.rollback).toEqual({ attempted: true, ok: true });
    expect(adapter.run).toHaveBeenCalledWith(["kill-window", "-t", "@42"]);
  });

  it("reports rollback failure details when kill-window fails", async () => {
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-windows") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "new-window") {
          return { stdout: "@42\t2\tclaude-work\t%130\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "send-keys" && args[1] === "-l") {
          return { stdout: "", stderr: "send failed", exitCode: 1 };
        }
        if (args[0] === "kill-window") {
          return { stdout: "", stderr: "kill failed", exitCode: 1 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const tmuxActions = createTmuxActions(adapter, { ...defaultConfig, token: "test-token" });

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "dev-main",
      agent: "claude",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.rollback.attempted).toBe(true);
    expect(result.rollback.ok).toBe(false);
    expect(result.rollback.message).toContain("kill failed");
  });

  it("returns mismatch verification when pane_current_command does not match", async () => {
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "has-session") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-windows") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (args[0] === "new-window") {
          return { stdout: "@42\t3\tclaude-work\t%140\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "list-panes") {
          return { stdout: "zsh\n", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const tmuxActions = createTmuxActions(adapter, { ...defaultConfig, token: "test-token" });

    const result = await tmuxActions.launchAgentInSession({
      sessionName: "dev-main",
      agent: "claude",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.result.verification.status).toBe("mismatch");
    expect(result.result.verification.observedCommand).toBe("zsh");
    expect(result.result.verification.attempts).toBe(5);
  });
});

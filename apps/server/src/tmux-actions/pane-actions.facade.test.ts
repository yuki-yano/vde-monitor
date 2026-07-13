import {
  afterEach,
  beforeEach,
  describe,
  expect,
  focusTerminalApp,
  focusTmuxPane,
  isAppRunning,
  it,
  markPaneFocus,
  originalPlatformDescriptor,
  resolveBackendApp,
  setProcessPlatform,
  vi,
} from "./test-helpers";
import { configDefaults } from "@vde-monitor/shared";

import { createTmuxActions } from "../tmux-actions.ts";

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
    const tmuxActions = createTmuxActions(adapter, { ...configDefaults, token: "test-token" });

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
    const tmuxActions = createTmuxActions(adapter, { ...configDefaults, token: "test-token" });

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
    const config = { ...configDefaults, token: "test-token" };
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
      ...configDefaults,
      token: "test-token",
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

  it("does not allow another send to interleave with graceful pane termination", async () => {
    vi.useFakeTimers();
    const calls: string[][] = [];
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        calls.push(args);
        return { stdout: "", stderr: "", exitCode: 0 };
      }),
    };
    const tmuxActions = createTmuxActions(adapter, {
      ...configDefaults,
      token: "test-token",
    });

    const killing = tmuxActions.killPane("%1");
    await vi.waitFor(() => expect(calls).toContainEqual(["send-keys", "-t", "%1", "C-c"]));
    const sending = tmuxActions.sendText("%1", "echo after", false);
    await vi.runAllTimersAsync();
    await Promise.all([killing, sending]);

    const killIndex = calls.findIndex((args) => args[0] === "kill-pane");
    const sendIndex = calls.findIndex((args) => args.includes("echo after"));
    expect(killIndex).toBeGreaterThanOrEqual(0);
    expect(sendIndex).toBeGreaterThan(killIndex);
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
      ...configDefaults,
      token: "test-token",
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
      ...configDefaults,
      token: "test-token",
    });

    const promise = tmuxActions.killPane("%1");
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(adapter.run).toHaveBeenCalledWith(["kill-pane", "-t", "%1"]);
  });
});

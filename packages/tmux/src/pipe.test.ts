import { describe, expect, it, vi } from "vitest";

import {
  type PaneLogTransport,
  buildPipeCommand,
  createPipeManager as createPipeManagerImpl,
  createPipeOwnerTag,
} from "./pipe";

const SERVER_KEY = "server-key";
const LOG_PATH = "/tmp/test.log";
const OWNER_TAG = "v2:fbce5c7c6cf59b61928ffb509f445dc733682f4b87ea6b60755963fcec80ca5d";
const success = { stdout: "", stderr: "", exitCode: 0 };
const quoteShellArgument = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
const pipeAttachCommand = (paneId: string, logPath: string) =>
  `pipe-pane -o -t ${quoteShellArgument(paneId)} ${quoteShellArgument(buildPipeCommand(`${logPath}.fifo`, `${logPath}.ready`))}`;
const createTransport = (): PaneLogTransport => ({
  prepare: vi.fn(async (_paneId, logPath) => ({
    fifoPath: `${logPath}.fifo`,
    readyPath: `${logPath}.ready`,
  })),
  activate: vi.fn(async () => {}),
  abort: vi.fn(async () => {}),
  release: vi.fn(async () => {}),
  isHealthy: vi.fn(async () => true),
  dispose: vi.fn(async () => {}),
});
const createPipeManager = (
  adapter: Parameters<typeof createPipeManagerImpl>[0],
  serverKey: string,
) => createPipeManagerImpl(adapter, serverKey, createTransport());

describe("pipe ownership helpers", () => {
  it("builds the v2 owner from server key, NUL, and absolute log path", () => {
    expect(createPipeOwnerTag(SERVER_KEY, LOG_PATH)).toBe(OWNER_TAG);
    expect(() => createPipeOwnerTag(SERVER_KEY, "relative.log")).toThrow(
      "pipe log path must be absolute",
    );
  });

  it("quotes shell-active FIFO and ready paths", () => {
    const logPath = "/tmp/back\\slash\"quote'single$dollar`tick;semi.log";

    const command = buildPipeCommand(`${logPath}.fifo`, `${logPath}.ready`);

    expect(command).not.toContain("cat >>");
    expect(command).toContain("umask 077");
    expect(command).toContain("exec cat >&3");
    expect(command).toContain("quote'\\''single$dollar`tick;semi.log");
    expect(() => buildPipeCommand("relative.fifo", "/tmp/ready")).toThrow(
      "FIFO path must be absolute",
    );
    expect(() => buildPipeCommand("/tmp/data", "relative.ready")).toThrow(
      "ready path must be absolute",
    );
  });
});

describe("createPipeManager", () => {
  it("exposes the expected owner tag and conflict matrix", () => {
    const adapter = { run: vi.fn().mockResolvedValue(success) };
    const manager = createPipeManager(adapter, SERVER_KEY);

    expect(manager.getOwnerTag(LOG_PATH)).toBe(OWNER_TAG);
    expect(manager.hasConflict({ panePipe: false, pipeTagValue: null }, LOG_PATH)).toBe(false);
    expect(manager.hasConflict({ panePipe: false, pipeTagValue: OWNER_TAG }, LOG_PATH)).toBe(false);
    expect(manager.hasConflict({ panePipe: true, pipeTagValue: OWNER_TAG }, LOG_PATH)).toBe(false);
    expect(manager.hasConflict({ panePipe: true, pipeTagValue: null }, LOG_PATH)).toBe(true);
    expect(manager.hasConflict({ panePipe: false, pipeTagValue: "v2:foreign" }, LOG_PATH)).toBe(
      true,
    );
    expect(manager.hasConflict({ panePipe: true, pipeTagValue: "v2:foreign" }, LOG_PATH)).toBe(
      true,
    );
    expect(manager.hasConflict({ panePipe: true, pipeTagValue: "1" }, LOG_PATH)).toBe(true);
  });

  it("attaches the pane log writer and writes a pane-local owner tag", async () => {
    const adapter = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "%1|0", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce(success)
        .mockResolvedValueOnce(success)
        .mockResolvedValueOnce({ stdout: "%1|1", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: OWNER_TAG, stderr: "", exitCode: 0 }),
    };
    const manager = createPipeManager(adapter, SERVER_KEY);

    const result = await manager.attachPipe("%1", LOG_PATH, {
      panePipe: false,
      pipeTagValue: null,
    });

    expect(result).toEqual({ attached: true, conflict: false });
    expect(adapter.run).toHaveBeenNthCalledWith(3, [
      "if-shell",
      "-F",
      "-t",
      "%1",
      "#{==:#{pane_pipe},0}",
      `set-option -p -o -t '%1' '@vde-monitor_pipe' '${OWNER_TAG}' ; ${pipeAttachCommand("%1", LOG_PATH)}`,
      "",
    ]);
    expect(adapter.run).toHaveBeenCalledTimes(5);
  });

  it("quotes the nested attach command for shell-active log path characters", async () => {
    const logPath = "/tmp/back\\\\slash\"quote'single$dollar`tick.log";
    const ownerTag = createPipeOwnerTag(SERVER_KEY, logPath);
    const adapter = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "%1|0", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce(success)
        .mockResolvedValueOnce(success)
        .mockResolvedValueOnce({ stdout: "%1|1", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: ownerTag, stderr: "", exitCode: 0 }),
    };
    const manager = createPipeManager(adapter, SERVER_KEY);

    await expect(
      manager.attachPipe("%1", logPath, { panePipe: false, pipeTagValue: null }),
    ).resolves.toEqual({ attached: true, conflict: false });
    const guardedAttachArgs = adapter.run.mock.calls[2]?.[0];
    expect(guardedAttachArgs?.slice(0, 5)).toEqual([
      "if-shell",
      "-F",
      "-t",
      "%1",
      "#{==:#{pane_pipe},0}",
    ]);
    expect(guardedAttachArgs?.[5]).toBe(
      `set-option -p -o -t '%1' '@vde-monitor_pipe' '${ownerTag}' ; ${pipeAttachCommand("%1", logPath)}`,
    );
    expect(guardedAttachArgs?.[6]).toBe("");
  });

  it("keeps an already-owned pipe without reattaching", async () => {
    const adapter = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "%1|1", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: OWNER_TAG, stderr: "", exitCode: 0 }),
    };
    const manager = createPipeManager(adapter, SERVER_KEY);

    await expect(
      manager.attachPipe("%1", LOG_PATH, { panePipe: true, pipeTagValue: OWNER_TAG }),
    ).resolves.toEqual({ attached: true, conflict: false });
    expect(adapter.run).toHaveBeenCalledTimes(2);
  });

  it("repairs a detached pipe with its existing owner tag", async () => {
    const adapter = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "%1|0", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: OWNER_TAG, stderr: "", exitCode: 0 })
        .mockResolvedValueOnce(success)
        .mockResolvedValueOnce({ stdout: "%1|1", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: OWNER_TAG, stderr: "", exitCode: 0 }),
    };
    const manager = createPipeManager(adapter, SERVER_KEY);

    await expect(
      manager.attachPipe("%1", LOG_PATH, { panePipe: false, pipeTagValue: OWNER_TAG }),
    ).resolves.toEqual({ attached: true, conflict: false });
    expect(adapter.run).toHaveBeenCalledTimes(5);
    expect(adapter.run).toHaveBeenCalledWith([
      "if-shell",
      "-F",
      "-t",
      "%1",
      `#{&&:#{==:#{pane_pipe},0},#{==:#{@vde-monitor_pipe},${OWNER_TAG}}}`,
      pipeAttachCommand("%1", LOG_PATH),
      "",
    ]);
  });

  it.each([
    { panePipe: true, pipeTagValue: null },
    { panePipe: true, pipeTagValue: "v2:foreign" },
    { panePipe: false, pipeTagValue: "v2:foreign" },
    { panePipe: true, pipeTagValue: "1" },
  ])("does not attach or overwrite conflicting state %#", async (state) => {
    const adapter = { run: vi.fn().mockResolvedValue(success) };
    const manager = createPipeManager(adapter, SERVER_KEY);

    await expect(manager.attachPipe("%1", LOG_PATH, state)).resolves.toEqual({
      attached: false,
      conflict: true,
    });
    expect(adapter.run).not.toHaveBeenCalled();
  });

  it("keeps its stale owner tag for retry when pipe attachment fails", async () => {
    const adapter = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "%1|0", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce(success)
        .mockResolvedValueOnce({ stdout: "", stderr: "attach failed", exitCode: 1 })
        .mockResolvedValueOnce({ stdout: "%1|0", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: OWNER_TAG, stderr: "", exitCode: 0 }),
    };
    const manager = createPipeManager(adapter, SERVER_KEY);

    await expect(
      manager.attachPipe("%1", LOG_PATH, { panePipe: false, pipeTagValue: null }),
    ).resolves.toEqual({ attached: false, conflict: false });
    expect(adapter.run).toHaveBeenCalledTimes(5);
  });

  it("leaves the pipe untouched when owner tag claim fails", async () => {
    const adapter = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "%1|0", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce(success)
        .mockResolvedValueOnce({ stdout: "", stderr: "tag failed", exitCode: 1 })
        .mockResolvedValueOnce({ stdout: "%1|0", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce(success),
    };
    const manager = createPipeManager(adapter, SERVER_KEY);

    await expect(
      manager.attachPipe("%1", LOG_PATH, { panePipe: false, pipeTagValue: null }),
    ).resolves.toEqual({ attached: false, conflict: false });
    expect(adapter.run).toHaveBeenCalledTimes(5);
  });

  it("does not claim or toggle a foreign pipe that wins after the fresh read", async () => {
    const adapter = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "%1|0", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce(success)
        .mockResolvedValueOnce(success)
        .mockResolvedValueOnce({ stdout: "%1|1", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce(success),
    };
    const manager = createPipeManager(adapter, SERVER_KEY);

    await expect(
      manager.attachPipe("%1", LOG_PATH, { panePipe: false, pipeTagValue: null }),
    ).resolves.toEqual({ attached: false, conflict: true });
    expect(adapter.run).toHaveBeenNthCalledWith(3, [
      "if-shell",
      "-F",
      "-t",
      "%1",
      "#{==:#{pane_pipe},0}",
      `set-option -p -o -t '%1' '@vde-monitor_pipe' '${OWNER_TAG}' ; ${pipeAttachCommand("%1", LOG_PATH)}`,
      "",
    ]);
  });

  it("does not attach when a foreign owner tag wins after the fresh read", async () => {
    const adapter = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "%1|0", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce(success)
        .mockResolvedValueOnce({ stdout: "", stderr: "tag exists", exitCode: 1 })
        .mockResolvedValueOnce({ stdout: "%1|0", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "v2:foreign", stderr: "", exitCode: 0 }),
    };
    const manager = createPipeManager(adapter, SERVER_KEY);

    await expect(
      manager.attachPipe("%1", LOG_PATH, { panePipe: false, pipeTagValue: null }),
    ).resolves.toEqual({ attached: false, conflict: true });
  });

  it("refuses to overwrite a foreign pipe that appeared after the passed observation", async () => {
    const adapter = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "%1|1", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "v2:foreign", stderr: "", exitCode: 0 }),
    };
    const manager = createPipeManager(adapter, SERVER_KEY);

    await expect(
      manager.attachPipe("%1", LOG_PATH, { panePipe: false, pipeTagValue: null }),
    ).resolves.toEqual({ attached: false, conflict: true });
    expect(adapter.run).toHaveBeenCalledTimes(2);
  });

  it("does not mutate pipe state when the fresh owner tag read fails", async () => {
    const adapter = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "%1|0", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "", stderr: "read failed", exitCode: 1 }),
    };
    const manager = createPipeManager(adapter, SERVER_KEY);

    await expect(
      manager.attachPipe("%1", LOG_PATH, { panePipe: false, pipeTagValue: null }),
    ).resolves.toEqual({ attached: false, conflict: false });
    expect(adapter.run).toHaveBeenCalledTimes(2);
  });

  it("detaches only after fresh pane-local ownership reads and then unsets the tag", async () => {
    const adapter = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "%1|1\n", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: `${OWNER_TAG}\n`, stderr: "", exitCode: 0 })
        .mockResolvedValueOnce(success)
        .mockResolvedValueOnce(success),
    };
    const manager = createPipeManager(adapter, SERVER_KEY);

    await expect(manager.detachOwnedPipe("%1", LOG_PATH)).resolves.toEqual({
      ok: true,
      owned: true,
      detached: true,
    });
    expect(adapter.run).toHaveBeenNthCalledWith(1, [
      "display-message",
      "-p",
      "-t",
      "%1",
      "#{pane_id}|#{pane_pipe}",
    ]);
    expect(adapter.run).toHaveBeenNthCalledWith(2, [
      "show-options",
      "-p",
      "-q",
      "-t",
      "%1",
      "-v",
      "@vde-monitor_pipe",
    ]);
    expect(adapter.run).toHaveBeenNthCalledWith(3, ["pipe-pane", "-t", "%1"]);
    expect(adapter.run).toHaveBeenNthCalledWith(4, [
      "set-option",
      "-p",
      "-t",
      "%1",
      "-u",
      "@vde-monitor_pipe",
    ]);
  });

  it("cleans an owned stale tag only after a successful no-op detach", async () => {
    const adapter = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "%1|0\n", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: OWNER_TAG, stderr: "", exitCode: 0 })
        .mockResolvedValueOnce(success)
        .mockResolvedValueOnce(success),
    };
    const manager = createPipeManager(adapter, SERVER_KEY);

    await expect(manager.detachOwnedPipe("%1", LOG_PATH)).resolves.toEqual({
      ok: true,
      owned: true,
      detached: true,
    });
    expect(adapter.run).toHaveBeenNthCalledWith(3, ["pipe-pane", "-t", "%1"]);
    expect(adapter.run).toHaveBeenNthCalledWith(4, [
      "set-option",
      "-p",
      "-t",
      "%1",
      "-u",
      "@vde-monitor_pipe",
    ]);
  });

  it.each([null, "1", "v2:foreign"])(
    "does not detach a tag not owned by this process: %s",
    async (pipeTagValue) => {
      const tagResult = { stdout: pipeTagValue ?? "", stderr: "", exitCode: 0 };
      const adapter = {
        run: vi
          .fn()
          .mockResolvedValueOnce({ stdout: "%1|1", stderr: "", exitCode: 0 })
          .mockResolvedValueOnce(tagResult),
      };
      const manager = createPipeManager(adapter, SERVER_KEY);

      await expect(manager.detachOwnedPipe("%1", LOG_PATH)).resolves.toEqual({
        ok: true,
        owned: false,
        detached: false,
      });
      expect(adapter.run).toHaveBeenCalledTimes(2);
    },
  );

  it("reports a fresh state read failure for retry", async () => {
    const adapter = {
      run: vi.fn().mockResolvedValue({ stdout: "", stderr: "pane gone", exitCode: 1 }),
    };
    const manager = createPipeManager(adapter, SERVER_KEY);

    await expect(manager.detachOwnedPipe("%1", LOG_PATH)).resolves.toEqual({
      ok: false,
      owned: false,
      detached: false,
    });
    expect(adapter.run).toHaveBeenCalledTimes(1);
  });

  it("treats an exit-zero empty pane identity as missing without mutation", async () => {
    const attachAdapter = {
      run: vi.fn().mockResolvedValue({ stdout: "|", stderr: "", exitCode: 0 }),
    };
    const attachManager = createPipeManager(attachAdapter, SERVER_KEY);

    await expect(
      attachManager.attachPipe("%missing", LOG_PATH, {
        panePipe: false,
        pipeTagValue: null,
      }),
    ).resolves.toEqual({ attached: false, conflict: false });
    expect(attachAdapter.run).toHaveBeenCalledTimes(1);

    const detachAdapter = {
      run: vi.fn().mockResolvedValue({ stdout: "|", stderr: "", exitCode: 0 }),
    };
    const detachManager = createPipeManager(detachAdapter, SERVER_KEY);
    await expect(detachManager.detachOwnedPipe("%missing", LOG_PATH)).resolves.toEqual({
      ok: true,
      owned: false,
      detached: false,
    });
    expect(detachAdapter.run).toHaveBeenCalledTimes(1);
  });

  it("distinguishes pane-local tag read failure from an unset tag", async () => {
    const adapter = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "%1|1", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "", stderr: "read failed", exitCode: 1 }),
    };
    const manager = createPipeManager(adapter, SERVER_KEY);

    await expect(manager.detachOwnedPipe("%1", LOG_PATH)).resolves.toEqual({
      ok: false,
      owned: false,
      detached: false,
    });
    expect(adapter.run).toHaveBeenCalledTimes(2);
  });

  it("does not unset the tag when pipe detach fails", async () => {
    const adapter = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "%1|1", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: OWNER_TAG, stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "", stderr: "detach failed", exitCode: 1 }),
    };
    const manager = createPipeManager(adapter, SERVER_KEY);

    await expect(manager.detachOwnedPipe("%1", LOG_PATH)).resolves.toEqual({
      ok: false,
      owned: true,
      detached: false,
    });
    expect(adapter.run).toHaveBeenCalledTimes(3);
  });

  it("reports tag unset failure after the pipe was detached", async () => {
    const adapter = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "%1|1", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: OWNER_TAG, stderr: "", exitCode: 0 })
        .mockResolvedValueOnce(success)
        .mockResolvedValueOnce({ stdout: "", stderr: "unset failed", exitCode: 1 }),
    };
    const manager = createPipeManager(adapter, SERVER_KEY);

    await expect(manager.detachOwnedPipe("%1", LOG_PATH)).resolves.toEqual({
      ok: false,
      owned: true,
      detached: true,
    });
    expect(adapter.run).toHaveBeenCalledTimes(4);
  });
});

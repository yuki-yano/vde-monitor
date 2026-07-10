import { describe, expect, it, vi } from "vitest";

import { buildPipeCommand, createPipeManager, createPipeOwnerTag, escapePipeLogPath } from "./pipe";

const SERVER_KEY = "server-key";
const LOG_PATH = "/tmp/test.log";
const OWNER_TAG = "v2:fbce5c7c6cf59b61928ffb509f445dc733682f4b87ea6b60755963fcec80ca5d";

const success = { stdout: "", stderr: "", exitCode: 0 };

describe("pipe ownership helpers", () => {
  it("builds the v2 owner from server key, NUL, and absolute log path", () => {
    expect(createPipeOwnerTag(SERVER_KEY, LOG_PATH)).toBe(OWNER_TAG);
    expect(() => createPipeOwnerTag(SERVER_KEY, "relative.log")).toThrow(
      "pipe log path must be absolute",
    );
  });

  it("escapes shell-active characters and uses one exec cat process", () => {
    const logPath = '/tmp/back\\slash"quote$dollar`tick.log';

    expect(escapePipeLogPath(logPath)).toBe('/tmp/back\\\\slash\\"quote\\$dollar\\`tick.log');
    expect(buildPipeCommand(logPath)).toBe(
      'exec cat >> "/tmp/back\\\\slash\\"quote\\$dollar\\`tick.log"',
    );
    expect(() => buildPipeCommand("relative.log")).toThrow("pipe log path must be absolute");
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

  it("attaches with exec cat and writes a pane-local owner tag", async () => {
    const adapter = { run: vi.fn().mockResolvedValue(success) };
    const manager = createPipeManager(adapter, SERVER_KEY);

    const result = await manager.attachPipe("%1", LOG_PATH, {
      panePipe: false,
      pipeTagValue: null,
    });

    expect(result).toEqual({ attached: true, conflict: false });
    expect(adapter.run).toHaveBeenNthCalledWith(3, [
      "pipe-pane",
      "-o",
      "-t",
      "%1",
      'exec cat >> "/tmp/test.log"',
    ]);
    expect(adapter.run).toHaveBeenNthCalledWith(4, [
      "set-option",
      "-p",
      "-o",
      "-t",
      "%1",
      "@vde-monitor_pipe",
      OWNER_TAG,
    ]);
  });

  it("keeps an already-owned pipe without reattaching", async () => {
    const adapter = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "1", stderr: "", exitCode: 0 })
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
        .mockResolvedValueOnce({ stdout: "0", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: OWNER_TAG, stderr: "", exitCode: 0 })
        .mockResolvedValueOnce(success),
    };
    const manager = createPipeManager(adapter, SERVER_KEY);

    await expect(
      manager.attachPipe("%1", LOG_PATH, { panePipe: false, pipeTagValue: OWNER_TAG }),
    ).resolves.toEqual({ attached: true, conflict: false });
    expect(adapter.run).toHaveBeenCalledTimes(3);
    expect(adapter.run).toHaveBeenCalledWith([
      "pipe-pane",
      "-o",
      "-t",
      "%1",
      'exec cat >> "/tmp/test.log"',
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

  it("does not write a tag when pipe attachment fails", async () => {
    const adapter = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "0", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce(success)
        .mockResolvedValueOnce({ stdout: "", stderr: "attach failed", exitCode: 1 }),
    };
    const manager = createPipeManager(adapter, SERVER_KEY);

    await expect(
      manager.attachPipe("%1", LOG_PATH, { panePipe: false, pipeTagValue: null }),
    ).resolves.toEqual({ attached: false, conflict: false });
    expect(adapter.run).toHaveBeenCalledTimes(3);
  });

  it("does not detach a tagless pipe when owner tag write fails", async () => {
    const adapter = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "0", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce(success)
        .mockResolvedValueOnce(success)
        .mockResolvedValueOnce({ stdout: "", stderr: "tag failed", exitCode: 1 }),
    };
    const manager = createPipeManager(adapter, SERVER_KEY);

    await expect(
      manager.attachPipe("%1", LOG_PATH, { panePipe: false, pipeTagValue: null }),
    ).resolves.toEqual({ attached: false, conflict: true });
    expect(adapter.run).toHaveBeenCalledTimes(4);
  });

  it("refuses to overwrite a foreign pipe that appeared after the passed observation", async () => {
    const adapter = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "1", stderr: "", exitCode: 0 })
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
        .mockResolvedValueOnce({ stdout: "0", stderr: "", exitCode: 0 })
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
        .mockResolvedValueOnce({ stdout: "1\n", stderr: "", exitCode: 0 })
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
      "#{pane_pipe}",
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
        .mockResolvedValueOnce({ stdout: "0\n", stderr: "", exitCode: 0 })
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
          .mockResolvedValueOnce({ stdout: "1", stderr: "", exitCode: 0 })
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

  it("distinguishes pane-local tag read failure from an unset tag", async () => {
    const adapter = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "1", stderr: "", exitCode: 0 })
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
        .mockResolvedValueOnce({ stdout: "1", stderr: "", exitCode: 0 })
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
        .mockResolvedValueOnce({ stdout: "1", stderr: "", exitCode: 0 })
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

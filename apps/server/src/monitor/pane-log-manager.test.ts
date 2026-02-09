import type { AgentMonitorConfig } from "@vde-monitor/shared";
import { describe, expect, it, vi } from "vitest";

import { createPaneLogManager } from "./pane-log-manager";

const resolveMockLogPaths = (paneId: string, paneLogPath = `/logs/${paneId}.log`) => ({
  paneIdEncoded: paneId,
  panesDir: "/logs",
  eventsDir: "/logs",
  paneLogPath,
  eventLogPath: "/logs/events.log",
});

describe("pane-log-manager", () => {
  it("attaches pipe when allowed and updates logging", async () => {
    const pipeManager = {
      hasConflict: vi.fn(() => false),
      attachPipe: vi.fn(async () => ({ attached: true, conflict: false })),
    };
    const logActivity = { register: vi.fn() };
    const config = {
      attachOnServe: true,
      logs: { maxPaneLogBytes: 10, retainRotations: 1 },
    } as AgentMonitorConfig;
    const manager = createPaneLogManager({
      baseDir: "/base",
      serverKey: "key",
      config,
      pipeSupport: "tmux-pipe",
      pipeManager,
      logActivity,
      deps: {
        resolveLogPaths: (_base, _key, paneId) => resolveMockLogPaths(paneId),
        ensureDir: vi.fn(async () => {}),
        rotateLogIfNeeded: vi.fn(async () => {}),
        openLogFile: vi.fn(async () => {}),
      },
    });

    const result = await manager.preparePaneLogging({
      paneId: "1",
      panePipe: false,
      pipeTagValue: "0",
    });

    expect(pipeManager.attachPipe).toHaveBeenCalledWith(
      "1",
      "/logs/1.log",
      {
        panePipe: false,
        pipeTagValue: "0",
      },
      { forceReattach: false },
    );
    expect(logActivity.register).toHaveBeenCalledWith("1", "/logs/1.log");
    expect(result.pipeAttached).toBe(true);
    expect(result.pipeConflict).toBe(false);
  });

  it("re-attaches once when pipe is already attached and tagged", async () => {
    const pipeManager = {
      hasConflict: vi.fn(() => false),
      attachPipe: vi.fn(async () => ({ attached: true, conflict: false })),
    };
    const logActivity = { register: vi.fn() };
    const config = {
      attachOnServe: true,
      logs: { maxPaneLogBytes: 10, retainRotations: 1 },
    } as AgentMonitorConfig;
    const manager = createPaneLogManager({
      baseDir: "/base",
      serverKey: "key",
      config,
      pipeSupport: "tmux-pipe",
      pipeManager,
      logActivity,
      deps: {
        resolveLogPaths: (_base, _key, paneId) => resolveMockLogPaths(paneId),
        ensureDir: vi.fn(async () => {}),
        rotateLogIfNeeded: vi.fn(async () => {}),
        openLogFile: vi.fn(async () => {}),
      },
    });

    const first = await manager.preparePaneLogging({
      paneId: "1",
      panePipe: true,
      pipeTagValue: "1",
    });
    expect(pipeManager.attachPipe).toHaveBeenCalledWith(
      "1",
      "/logs/1.log",
      {
        panePipe: true,
        pipeTagValue: "1",
      },
      { forceReattach: true },
    );
    expect(first.pipeAttached).toBe(true);
    expect(first.pipeConflict).toBe(false);

    const second = await manager.preparePaneLogging({
      paneId: "1",
      panePipe: true,
      pipeTagValue: "1",
    });
    expect(pipeManager.attachPipe).toHaveBeenCalledTimes(1);
    expect(second.pipeAttached).toBe(true);
    expect(second.pipeConflict).toBe(false);
  });

  it("re-attaches when pane pipe is detached even if tag remains attached", async () => {
    const pipeManager = {
      hasConflict: vi.fn(() => false),
      attachPipe: vi.fn(async () => ({ attached: true, conflict: false })),
    };
    const logActivity = { register: vi.fn() };
    const config = {
      attachOnServe: true,
      logs: { maxPaneLogBytes: 10, retainRotations: 1 },
    } as AgentMonitorConfig;
    const manager = createPaneLogManager({
      baseDir: "/base",
      serverKey: "key",
      config,
      pipeSupport: "tmux-pipe",
      pipeManager,
      logActivity,
      deps: {
        resolveLogPaths: (_base, _key, paneId) => resolveMockLogPaths(paneId),
        ensureDir: vi.fn(async () => {}),
        rotateLogIfNeeded: vi.fn(async () => {}),
        openLogFile: vi.fn(async () => {}),
      },
    });

    const result = await manager.preparePaneLogging({
      paneId: "1",
      panePipe: false,
      pipeTagValue: "1",
    });

    expect(pipeManager.attachPipe).toHaveBeenCalledWith(
      "1",
      "/logs/1.log",
      {
        panePipe: false,
        pipeTagValue: "1",
      },
      { forceReattach: false },
    );
    expect(result.pipeAttached).toBe(true);
    expect(result.pipeConflict).toBe(false);
  });

  it("skips attach when conflict is detected", async () => {
    const pipeManager = {
      hasConflict: vi.fn(() => true),
      attachPipe: vi.fn(async () => ({ attached: false, conflict: true })),
    };
    const logActivity = { register: vi.fn() };
    const config = {
      attachOnServe: true,
      logs: { maxPaneLogBytes: 10, retainRotations: 1 },
    } as AgentMonitorConfig;
    const manager = createPaneLogManager({
      baseDir: "/base",
      serverKey: "key",
      config,
      pipeSupport: "tmux-pipe",
      pipeManager,
      logActivity,
      deps: {
        resolveLogPaths: (_base, _key, paneId) => resolveMockLogPaths(paneId),
        ensureDir: vi.fn(async () => {}),
        rotateLogIfNeeded: vi.fn(async () => {}),
        openLogFile: vi.fn(async () => {}),
      },
    });

    const result = await manager.preparePaneLogging({
      paneId: "2",
      panePipe: true,
      pipeTagValue: null,
    });

    expect(pipeManager.attachPipe).not.toHaveBeenCalled();
    expect(result.pipeConflict).toBe(true);
  });

  it("skips pipe and log registration when pipe support is none", async () => {
    const pipeManager = {
      hasConflict: vi.fn(() => false),
      attachPipe: vi.fn(async () => ({ attached: true, conflict: false })),
    };
    const logActivity = { register: vi.fn() };
    const config = {
      attachOnServe: true,
      logs: { maxPaneLogBytes: 10, retainRotations: 1 },
    } as AgentMonitorConfig;
    const manager = createPaneLogManager({
      baseDir: "/base",
      serverKey: "key",
      config,
      pipeSupport: "none",
      pipeManager,
      logActivity,
      deps: {
        resolveLogPaths: (_base, _key, paneId) => resolveMockLogPaths(paneId),
        ensureDir: vi.fn(async () => {}),
        rotateLogIfNeeded: vi.fn(async () => {}),
        openLogFile: vi.fn(async () => {}),
      },
    });

    const result = await manager.preparePaneLogging({
      paneId: "2",
      panePipe: false,
      pipeTagValue: null,
    });

    expect(pipeManager.attachPipe).not.toHaveBeenCalled();
    expect(logActivity.register).not.toHaveBeenCalled();
    expect(result).toEqual({
      pipeAttached: false,
      pipeConflict: false,
      logPath: null,
    });
  });
});

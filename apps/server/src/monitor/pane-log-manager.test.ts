import type { MultiplexerPipeCapability } from "@vde-monitor/multiplexer";
import { describe, expect, it, vi } from "vitest";

import { createPaneLogManager } from "./pane-log-manager";

const OWNER_TAG = `v2:${"a".repeat(64)}`;

const resolveMockLogPaths = (paneId: string, paneLogPath = `/logs/${paneId}.log`) => ({
  paneIdEncoded: paneId,
  panesDir: "/logs",
  eventsDir: "/logs",
  paneLogPath,
  eventLogPath: "/logs/events.log",
});

const createPipeCapability = (
  overrides: Partial<MultiplexerPipeCapability> = {},
): MultiplexerPipeCapability => ({
  getOwnerTag: vi.fn(() => OWNER_TAG),
  hasConflict: vi.fn(() => false),
  attachPipe: vi.fn(async () => ({ attached: true, conflict: false })),
  detachOwnedPipe: vi.fn(async () => ({ ok: true, owned: true, detached: true })),
  ...overrides,
});

const createManager = ({
  pipeCapability = createPipeCapability(),
}: {
  pipeCapability?: MultiplexerPipeCapability | null;
} = {}) => {
  const logActivity = { register: vi.fn(), unregister: vi.fn() };
  const manager = createPaneLogManager({
    baseDir: "/base",
    serverKey: "key",
    pipeCapability: pipeCapability ?? undefined,
    logActivity,
    deps: {
      resolveLogPaths: (_base, _key, paneId) => resolveMockLogPaths(paneId),
      ensureDir: vi.fn(async () => {}),
      rotateLogIfNeeded: vi.fn(async () => {}),
      openLogFile: vi.fn(async () => {}),
    },
  });
  return { manager, logActivity, pipeCapability };
};

describe("pane-log-manager", () => {
  it("attaches an unowned empty pane and caches the expected owner", async () => {
    const pipeCapability = createPipeCapability();
    const { manager, logActivity } = createManager({ pipeCapability });

    const result = await manager.preparePaneLogging({
      paneId: "%1",
      panePipe: false,
      pipeTagValue: null,
    });

    expect(pipeCapability.attachPipe).toHaveBeenCalledWith("%1", "/logs/%1.log", {
      panePipe: false,
      pipeTagValue: null,
    });
    expect(logActivity.register).toHaveBeenCalledWith("%1", "/logs/%1.log");
    expect(result).toMatchObject({
      pipeAttached: true,
      pipeConflict: false,
      ownerTag: OWNER_TAG,
    });
    expect(manager.getOwnedPaneIds()).toEqual(["%1"]);
  });

  it("keeps an already owned pipe without reattaching", async () => {
    const pipeCapability = createPipeCapability();
    const { manager } = createManager({ pipeCapability });

    const result = await manager.preparePaneLogging({
      paneId: "%1",
      panePipe: true,
      pipeTagValue: OWNER_TAG,
    });

    expect(pipeCapability.attachPipe).not.toHaveBeenCalled();
    expect(result.pipeAttached).toBe(true);
    expect(result.pipeConflict).toBe(false);
  });

  it("repairs a detached pipe only when its v2 owner tag matches", async () => {
    const pipeCapability = createPipeCapability();
    const { manager } = createManager({ pipeCapability });

    await manager.preparePaneLogging({
      paneId: "%1",
      panePipe: false,
      pipeTagValue: OWNER_TAG,
    });

    expect(pipeCapability.attachPipe).toHaveBeenCalledWith("%1", "/logs/%1.log", {
      panePipe: false,
      pipeTagValue: OWNER_TAG,
    });
  });

  it("does not attach or repair while presence is indeterminate", async () => {
    const pipeCapability = createPipeCapability();
    const { manager } = createManager({ pipeCapability });

    const result = await manager.preparePaneLogging({
      paneId: "%1",
      panePipe: false,
      pipeTagValue: OWNER_TAG,
      allowAttach: false,
    });

    expect(pipeCapability.attachPipe).not.toHaveBeenCalled();
    expect(result.pipeAttached).toBe(false);
  });

  it("does not attach or register logging for foreign and legacy conflicts", async () => {
    const pipeCapability = createPipeCapability({ hasConflict: vi.fn(() => true) });
    const { manager, logActivity } = createManager({ pipeCapability });

    const result = await manager.preparePaneLogging({
      paneId: "%2",
      panePipe: true,
      pipeTagValue: "1",
    });

    expect(pipeCapability.attachPipe).not.toHaveBeenCalled();
    expect(logActivity.register).not.toHaveBeenCalled();
    expect(logActivity.unregister).toHaveBeenCalledWith("%2");
    expect(result.pipeConflict).toBe(true);
  });

  it("checks a confirmed absence once and retries only after a failed ownership check", async () => {
    const detachOwnedPipe = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, owned: false, detached: false })
      .mockResolvedValue({ ok: true, owned: true, detached: true });
    const { manager, logActivity } = createManager({
      pipeCapability: createPipeCapability({ detachOwnedPipe }),
    });

    await manager.detachOwnedPipe("%1");
    await manager.detachOwnedPipe("%1");
    await manager.detachOwnedPipe("%1");

    expect(detachOwnedPipe).toHaveBeenCalledTimes(2);
    expect(logActivity.unregister).toHaveBeenCalledTimes(1);
    expect(manager.getOwnedPaneIds()).toEqual([]);
  });

  it("forces a fresh owned check for cleanup and graceful shutdown", async () => {
    const detachOwnedPipe = vi.fn(async () => ({ ok: true, owned: false, detached: false }));
    const { manager } = createManager({
      pipeCapability: createPipeCapability({ detachOwnedPipe }),
    });

    await manager.detachOwnedPipe("%1");
    await manager.detachOwnedPipe("%1", { forceCheck: true });

    expect(detachOwnedPipe).toHaveBeenCalledTimes(2);
  });

  it("skips pipe and log registration when pipe capability is absent", async () => {
    const { manager, logActivity } = createManager({ pipeCapability: null });

    const result = await manager.preparePaneLogging({
      paneId: "%2",
      panePipe: false,
      pipeTagValue: null,
    });

    expect(logActivity.register).not.toHaveBeenCalled();
    expect(result).toEqual({
      pipeAttached: false,
      pipeConflict: false,
      logPath: null,
    });
  });
});

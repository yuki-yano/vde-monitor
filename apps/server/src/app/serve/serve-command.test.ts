import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createGracefulShutdown } from "./serve-command";
import {
  buildTailscaleServeCommand,
  buildTailscaleServeProxyTarget,
  collectServeProxyTargets,
  matchesExpectedTailscaleServeTarget,
} from "./tailscale-setup";

const flushMicrotasks = async (): Promise<void> => {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
};

describe("createGracefulShutdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shares one shutdown across duplicate SIGINT and SIGTERM delivery", async () => {
    let resolveMonitorStop = () => {};
    const monitorStopped = new Promise<void>((resolve) => {
      resolveMonitorStop = resolve;
    });
    let onServerClosed = () => {};
    const closeStreams = vi.fn();
    const stopMonitor = vi.fn(() => monitorStopped);
    const closeServer = vi.fn((onClosed: () => void) => {
      onServerClosed = onClosed;
    });
    const exitProcess = vi.fn();
    const shutdown = createGracefulShutdown({
      closeStreams,
      stopMonitor,
      closeServer,
      exitProcess,
    });

    const sigintShutdown = shutdown();
    const sigtermShutdown = shutdown();
    await flushMicrotasks();

    expect(sigtermShutdown).toBe(sigintShutdown);
    expect(closeStreams).toHaveBeenCalledOnce();
    expect(stopMonitor).toHaveBeenCalledOnce();
    expect(closeServer).not.toHaveBeenCalled();

    resolveMonitorStop();
    await flushMicrotasks();

    expect(closeServer).toHaveBeenCalledOnce();
    expect(exitProcess).not.toHaveBeenCalled();

    onServerClosed();
    await sigintShutdown;

    expect(exitProcess).toHaveBeenCalledOnce();
    expect(exitProcess).toHaveBeenCalledWith(0);
    expect(shutdown()).toBe(sigintShutdown);
  });

  it("starts HTTP server close after the five-second monitor stop timeout", async () => {
    const closeServer = vi.fn();
    const shutdown = createGracefulShutdown({
      closeStreams: vi.fn(),
      stopMonitor: vi.fn(() => new Promise<void>(() => {})),
      closeServer,
      exitProcess: vi.fn(),
    });

    shutdown();
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(4999);

    expect(closeServer).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(closeServer).toHaveBeenCalledOnce();
  });

  it("keeps the three-second server-close guard after monitor shutdown", async () => {
    let onServerClosed = () => {};
    const exitProcess = vi.fn();
    const shutdown = createGracefulShutdown({
      closeStreams: vi.fn(),
      stopMonitor: vi.fn(),
      closeServer: vi.fn((onClosed: () => void) => {
        onServerClosed = onClosed;
      }),
      exitProcess,
    });

    const shutdownPromise = shutdown();
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(2999);

    expect(exitProcess).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await shutdownPromise;

    expect(exitProcess).toHaveBeenCalledOnce();
    expect(exitProcess).toHaveBeenCalledWith(0);

    onServerClosed();
    expect(exitProcess).toHaveBeenCalledOnce();
  });

  it("continues server shutdown when monitor stop rejects", async () => {
    let onServerClosed = () => {};
    const closeServer = vi.fn((onClosed: () => void) => {
      onServerClosed = onClosed;
    });
    const exitProcess = vi.fn();
    const shutdown = createGracefulShutdown({
      closeStreams: vi.fn(),
      stopMonitor: vi.fn(async () => {
        throw new Error("detach failed");
      }),
      closeServer,
      exitProcess,
    });

    const shutdownPromise = shutdown();
    await flushMicrotasks();

    expect(closeServer).toHaveBeenCalledOnce();

    onServerClosed();
    await shutdownPromise;
    expect(exitProcess).toHaveBeenCalledOnce();
  });
});

describe("buildTailscaleServeProxyTarget", () => {
  it("builds an HTTP upstream target from host and port", () => {
    expect(
      buildTailscaleServeProxyTarget({
        proxyHost: "127.0.0.1",
        displayPort: 11080,
      }),
    ).toBe("http://127.0.0.1:11080");
  });
});

describe("buildTailscaleServeCommand", () => {
  it("builds a serve command with explicit upstream target", () => {
    expect(buildTailscaleServeCommand("http://100.102.60.85:11080")).toBe(
      "tailscale serve --bg http://100.102.60.85:11080",
    );
  });
});

describe("collectServeProxyTargets", () => {
  it("collects and deduplicates HTTP proxy targets from serve status json", () => {
    const status = {
      Web: {
        "device.tail123.ts.net:443": {
          Handlers: {
            "/": {
              Proxy: "http://127.0.0.1:11080",
            },
            "/api": {
              Proxy: "http://100.102.60.85:11080/",
            },
          },
        },
      },
      Services: [{ Proxy: "http://127.0.0.1:11080" }],
    };

    expect(collectServeProxyTargets(status).sort()).toEqual([
      "http://100.102.60.85:11080",
      "http://127.0.0.1:11080",
    ]);
  });
});

describe("matchesExpectedTailscaleServeTarget", () => {
  it("returns true when serve status includes expected upstream", () => {
    const status = {
      Web: {
        "device.tail123.ts.net:443": {
          Handlers: {
            "/": {
              Proxy: "http://100.102.60.85:11080/",
            },
          },
        },
      },
    };

    expect(
      matchesExpectedTailscaleServeTarget({
        serveStatus: status,
        expectedProxyTarget: "http://100.102.60.85:11080",
      }),
    ).toBe(true);
  });

  it("returns false when serve status does not include expected upstream", () => {
    const status = {
      Web: {
        "device.tail123.ts.net:443": {
          Handlers: {
            "/": {
              Proxy: "http://127.0.0.1:11080",
            },
          },
        },
      },
    };

    expect(
      matchesExpectedTailscaleServeTarget({
        serveStatus: status,
        expectedProxyTarget: "http://100.102.60.85:11080",
      }),
    ).toBe(false);
  });
});

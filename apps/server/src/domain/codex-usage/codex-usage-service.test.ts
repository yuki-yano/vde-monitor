import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeProcess = EventEmitter & {
  stdin: EventEmitter & {
    destroyed: boolean;
    writable: boolean;
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  default: {
    spawn: mocks.spawn,
  },
  spawn: mocks.spawn,
}));

vi.mock("node:readline", () => ({
  default: {
    createInterface: ({ input }: { input: EventEmitter }) => {
      const reader = new EventEmitter() as EventEmitter & { close: ReturnType<typeof vi.fn> };
      reader.close = vi.fn();
      input.on("data", (chunk) => {
        for (const line of String(chunk).split("\n")) {
          if (line.length > 0) {
            reader.emit("line", line);
          }
        }
      });
      return reader;
    },
  },
  createInterface: ({ input }: { input: EventEmitter }) => {
    const reader = new EventEmitter() as EventEmitter & { close: ReturnType<typeof vi.fn> };
    reader.close = vi.fn();
    input.on("data", (chunk) => {
      for (const line of String(chunk).split("\n")) {
        if (line.length > 0) {
          reader.emit("line", line);
        }
      }
    });
    return reader;
  },
}));

import { UsageProviderError } from "../usage-shared/usage-error";
import { fetchCodexRateLimits } from "./codex-usage-service";

const createFakeProcess = (): FakeProcess => {
  const processHandle = new EventEmitter() as FakeProcess;
  processHandle.stdout = new EventEmitter();
  processHandle.stderr = new EventEmitter();
  processHandle.stdin = new EventEmitter() as FakeProcess["stdin"];
  processHandle.stdin.destroyed = false;
  processHandle.stdin.writable = true;
  processHandle.stdin.write = vi.fn();
  processHandle.stdin.end = vi.fn(() => {
    processHandle.stdin.destroyed = true;
  });
  processHandle.kill = vi.fn();
  return processHandle;
};

const parseWrittenMessages = (processHandle: FakeProcess) =>
  processHandle.stdin.write.mock.calls.map(([line]) => JSON.parse(String(line)));

describe("fetchCodexRateLimits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes codex app-server and parses rate limit snapshots", async () => {
    const processHandle = createFakeProcess();
    mocks.spawn.mockReturnValue(processHandle);

    const promise = fetchCodexRateLimits({ timeoutMs: 1_000, cwd: "/repo" });

    expect(mocks.spawn).toHaveBeenCalledWith("codex", ["app-server", "--listen", "stdio://"], {
      cwd: "/repo",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const initialize = parseWrittenMessages(processHandle)[0];
    expect(initialize.method).toBe("initialize");

    processHandle.stdout.emit(
      "data",
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: initialize.id,
        result: {},
      })}\n`,
    );

    const readRequest = parseWrittenMessages(processHandle).find(
      (message) => message.method === "account/rateLimits/read",
    );
    expect(readRequest?.params).toBeNull();

    processHandle.stdout.emit(
      "data",
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: readRequest.id,
        result: {
          rateLimits: {
            limitId: 123,
            limitName: "Pro",
            planType: "team",
            credits: {
              hasCredits: true,
              unlimited: false,
              balance: 42,
            },
            primary: {
              usedPercent: "12.5",
              windowDurationMins: "300.4",
              resetsAt: "1700000000.4",
            },
            secondary: null,
          },
          rateLimitsByLimitId: {
            extra: {
              limitId: "extra",
              limitName: "Extra",
              planType: null,
              credits: null,
              primary: {
                usedPercent: 55,
                windowDurationMins: 10080,
                resetsAt: 1700500000,
              },
              secondary: null,
            },
            invalid: {
              primary: null,
            },
          },
        },
      })}\n`,
    );

    await expect(promise).resolves.toEqual({
      rateLimits: {
        limitId: "123",
        limitName: "Pro",
        planType: "team",
        credits: {
          hasCredits: true,
          unlimited: false,
          balance: "42",
        },
        primary: {
          usedPercent: 12.5,
          windowDurationMins: 300,
          resetsAt: 1700000000,
        },
        secondary: null,
      },
      rateLimitsByLimitId: {
        extra: {
          limitId: "extra",
          limitName: "Extra",
          planType: null,
          credits: null,
          primary: {
            usedPercent: 55,
            windowDurationMins: 10080,
            resetsAt: 1700500000,
          },
          secondary: null,
        },
        invalid: {
          limitId: null,
          limitName: null,
          planType: null,
          credits: null,
          primary: null,
          secondary: null,
        },
      },
    });
    expect(processHandle.kill).toHaveBeenCalledTimes(1);
  });

  it("maps JSON-RPC read errors to provider errors", async () => {
    const processHandle = createFakeProcess();
    mocks.spawn.mockReturnValue(processHandle);

    const promise = fetchCodexRateLimits({ timeoutMs: 1_000 });
    const initialize = parseWrittenMessages(processHandle)[0];
    processHandle.stdout.emit(
      "data",
      `${JSON.stringify({ jsonrpc: "2.0", id: initialize.id, result: {} })}\n`,
    );
    const readRequest = parseWrittenMessages(processHandle).find(
      (message) => message.method === "account/rateLimits/read",
    );
    processHandle.stdout.emit(
      "data",
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: readRequest.id,
        error: {
          code: -32000,
          message: "not signed in",
        },
      })}\n`,
    );

    await expect(promise).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
      message: "not signed in",
    } satisfies Partial<UsageProviderError>);
  });

  it("times out when app-server does not answer", async () => {
    vi.useFakeTimers();
    try {
      const processHandle = createFakeProcess();
      mocks.spawn.mockReturnValue(processHandle);

      const promise = fetchCodexRateLimits({ timeoutMs: 100 });
      const expectation = expect(promise).rejects.toMatchObject({
        code: "CODEX_APP_SERVER_UNAVAILABLE",
        message: "Codex app-server request timed out",
      } satisfies Partial<UsageProviderError>);
      await vi.advanceTimersByTimeAsync(100);

      await expectation;
      expect(processHandle.kill).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

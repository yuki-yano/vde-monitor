import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HERDR_MAX_CONCURRENT_REQUESTS, HerdrClient, resolveSocketPath } from "./client";

const tempDirs: string[] = [];

const makeTempSocketPath = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "vde-herdr-client-"));
  tempDirs.push(dir);
  return join(dir, "herdr.sock");
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("resolveSocketPath", () => {
  it("prefers HERDR_SOCKET_PATH", () => {
    expect(
      resolveSocketPath({ HERDR_SOCKET_PATH: "/tmp/x.sock", HERDR_SESSION: "work" }, "/home/u"),
    ).toBe("/tmp/x.sock");
  });

  it("resolves a named session socket from HERDR_SESSION", () => {
    expect(resolveSocketPath({ HERDR_SESSION: "work" }, "/home/u")).toBe(
      "/home/u/.config/herdr/sessions/work/herdr.sock",
    );
  });

  it("defaults to the default session socket", () => {
    expect(resolveSocketPath({}, "/home/u")).toBe("/home/u/.config/herdr/herdr.sock");
  });
});

describe("HerdrClient", () => {
  it("rejects concurrency above the supported connection bound", () => {
    expect(
      () =>
        new HerdrClient("/tmp/herdr.sock", {
          maxConcurrentRequests: HERDR_MAX_CONCURRENT_REQUESTS + 1,
        }),
    ).toThrow(`herdr max concurrency must be between 1 and ${HERDR_MAX_CONCURRENT_REQUESTS}`);
  });

  it("resolves a request with the response that has the same id", async () => {
    const socketPath = await makeTempSocketPath();
    const received: unknown[] = [];
    const server = createServer((socket) => {
      socket.setEncoding("utf8");
      let buffer = "";
      socket.on("data", (chunk: string) => {
        buffer += chunk;
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex < 0) return;
        const line = buffer.slice(0, newlineIndex);
        const request = JSON.parse(line) as { id: string; method: string; params: unknown };
        received.push(request);
        socket.write(`${JSON.stringify({ id: request.id, result: { type: "pong" } })}\n`);
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });

    const client = new HerdrClient(socketPath);
    await expect(client.request("ping")).resolves.toEqual({ type: "pong" });
    await client.close();

    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    expect(received).toEqual([{ id: "vdem_1", method: "ping", params: {} }]);
  });

  it("aborts a pending request and ignores its later response", async () => {
    const socketPath = await makeTempSocketPath();
    let respond: (() => void) | undefined;
    let markReceived: (() => void) | undefined;
    const received = new Promise<void>((resolve) => {
      markReceived = resolve;
    });
    const server = createServer((socket) => {
      socket.on("error", () => undefined);
      socket.setEncoding("utf8");
      let buffer = "";
      socket.on("data", (chunk: string) => {
        buffer += chunk;
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex < 0) return;
        const request = JSON.parse(buffer.slice(0, newlineIndex)) as { id: string };
        respond = () => {
          socket.write(`${JSON.stringify({ id: request.id, result: { type: "late" } })}\n`);
        };
        markReceived?.();
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });

    const controller = new AbortController();
    const client = new HerdrClient(socketPath);
    const request = client.request("pane.read", {}, { signal: controller.signal });
    await received;
    controller.abort(new Error("capture timeout"));

    await expect(request).rejects.toThrow("capture timeout");
    respond?.();
    await client.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("reconnects on the next request when the server closes after a response", async () => {
    const socketPath = await makeTempSocketPath();
    const received: string[] = [];
    const server = createServer((socket) => {
      socket.setEncoding("utf8");
      let buffer = "";
      socket.on("data", (chunk: string) => {
        buffer += chunk;
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex < 0) return;
        const line = buffer.slice(0, newlineIndex);
        const request = JSON.parse(line) as { id: string; method: string };
        received.push(request.method);
        socket.write(`${JSON.stringify({ id: request.id, result: { type: "ok" } })}\n`, () => {
          socket.end();
        });
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });

    const client = new HerdrClient(socketPath);
    await expect(client.request("pane.list")).resolves.toEqual({ type: "ok" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await expect(client.request("pane.read")).resolves.toEqual({ type: "ok" });
    await client.close();

    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    expect(received).toEqual(["pane.list", "pane.read"]);
  });

  it("reconnects once and resends a request when the connection drops before a response", async () => {
    const socketPath = await makeTempSocketPath();
    const received: string[] = [];
    let connectionCount = 0;
    const server = createServer((socket) => {
      connectionCount += 1;
      const currentConnection = connectionCount;
      socket.setEncoding("utf8");
      let buffer = "";
      socket.on("data", (chunk: string) => {
        buffer += chunk;
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex < 0) return;
        const line = buffer.slice(0, newlineIndex);
        const request = JSON.parse(line) as { id: string; method: string };
        received.push(request.method);
        if (currentConnection === 1) {
          socket.destroy();
          return;
        }
        socket.write(`${JSON.stringify({ id: request.id, result: { type: "retried" } })}\n`);
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });

    const client = new HerdrClient(socketPath);
    await expect(client.request("pane.get", { pane_id: "wD:p2" })).resolves.toEqual({
      type: "retried",
    });
    await client.close();

    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    expect(received).toEqual(["pane.get", "pane.get"]);
  });

  it("does not resend a mutating request when the connection drops before a response", async () => {
    const socketPath = await makeTempSocketPath();
    const received: string[] = [];
    const server = createServer((socket) => {
      socket.setEncoding("utf8");
      socket.on("data", (chunk: string) => {
        const request = JSON.parse(chunk.trim()) as { method: string };
        received.push(request.method);
        socket.destroy();
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });

    const client = new HerdrClient(socketPath);
    await expect(
      client.request("pane.send_input", { pane_id: "wD:p2", text: "hello" }),
    ).rejects.toThrow("herdr socket closed");
    await new Promise((resolve) => setTimeout(resolve, 10));
    await client.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );

    expect(received).toEqual(["pane.send_input"]);
  });

  it("bounds concurrent requests across one-request connections", async () => {
    const socketPath = await makeTempSocketPath();
    let connectionCount = 0;
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const received: string[] = [];
    const respond: Array<() => void> = [];
    const server = createServer((socket) => {
      connectionCount += 1;
      socket.setEncoding("utf8");
      socket.once("data", (chunk: string) => {
        const request = JSON.parse(chunk.split("\n", 1)[0]!) as { id: string; method: string };
        received.push(request.method);
        activeRequests += 1;
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
        respond.push(() => {
          activeRequests -= 1;
          socket.write(`${JSON.stringify({ id: request.id, result: request.method })}\n`);
        });
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });

    const client = new HerdrClient(socketPath, { maxConcurrentRequests: 2 });
    const requests = Promise.all([
      client.request("ping"),
      client.request("pane.list"),
      client.request("pane.read"),
    ]);

    await vi.waitFor(() => expect(respond).toHaveLength(2));
    expect(connectionCount).toBe(2);
    expect(maxActiveRequests).toBe(2);

    respond[0]!();
    await vi.waitFor(() => expect(respond).toHaveLength(3));
    expect(connectionCount).toBe(3);
    expect(maxActiveRequests).toBe(2);
    respond[1]!();
    respond[2]!();

    await expect(requests).resolves.toEqual(["ping", "pane.list", "pane.read"]);
    await client.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );

    expect(received).toEqual(["ping", "pane.list", "pane.read"]);
  });

  it("starts four of five requests with the default concurrency bound", async () => {
    const socketPath = await makeTempSocketPath();
    const respond: Array<() => void> = [];
    const server = createServer((socket) => {
      socket.setEncoding("utf8");
      socket.once("data", (chunk: string) => {
        const request = JSON.parse(chunk.split("\n", 1)[0]!) as { id: string; method: string };
        respond.push(() => {
          socket.write(`${JSON.stringify({ id: request.id, result: request.method })}\n`);
        });
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });

    const client = new HerdrClient(socketPath);
    const requests = Promise.all(
      Array.from({ length: 5 }, (_, index) => client.request(`test.${index + 1}`)),
    );

    await vi.waitFor(() => expect(respond).toHaveLength(HERDR_MAX_CONCURRENT_REQUESTS));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(respond).toHaveLength(HERDR_MAX_CONCURRENT_REQUESTS);

    respond[0]!();
    await vi.waitFor(() => expect(respond).toHaveLength(5));
    for (const sendResponse of respond.slice(1)) sendResponse();

    await expect(requests).resolves.toEqual(["test.1", "test.2", "test.3", "test.4", "test.5"]);
    await client.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("starts the request timeout after a queued request acquires a connection slot", async () => {
    const socketPath = await makeTempSocketPath();
    let respondToSlowRequest = (): void => undefined;
    const received: string[] = [];
    const server = createServer((socket) => {
      socket.setEncoding("utf8");
      socket.once("data", (chunk: string) => {
        const request = JSON.parse(chunk.split("\n", 1)[0]!) as { id: string; method: string };
        received.push(request.method);
        const respond = () =>
          socket.write(`${JSON.stringify({ id: request.id, result: request.method })}\n`);
        if (request.method === "test.slow") {
          respondToSlowRequest = respond;
        } else {
          respond();
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });

    const client = new HerdrClient(socketPath, { maxConcurrentRequests: 1 });
    const slow = client.request("test.slow", {}, { timeoutMs: 1000 });
    await vi.waitFor(() => expect(received).toEqual(["test.slow"]));
    const queued = client.request("test.fast", {}, { timeoutMs: 100 });
    let queuedSettled = false;
    void queued.then(
      () => {
        queuedSettled = true;
      },
      () => {
        queuedSettled = true;
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(queuedSettled).toBe(false);
    expect(received).toEqual(["test.slow"]);

    respondToSlowRequest();
    await expect(slow).resolves.toBe("test.slow");
    await expect(queued).resolves.toBe("test.fast");
    await client.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    expect(received).toEqual(["test.slow", "test.fast"]);
  });

  it("removes an aborted queued request without blocking the next waiter", async () => {
    const socketPath = await makeTempSocketPath();
    let respondToActive = (): void => undefined;
    const received: string[] = [];
    const server = createServer((socket) => {
      socket.setEncoding("utf8");
      socket.once("data", (chunk: string) => {
        const request = JSON.parse(chunk.split("\n", 1)[0]!) as { id: string; method: string };
        received.push(request.method);
        const respond = () =>
          socket.write(`${JSON.stringify({ id: request.id, result: request.method })}\n`);
        if (request.method === "test.active") {
          respondToActive = respond;
        } else {
          respond();
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });

    const client = new HerdrClient(socketPath, { maxConcurrentRequests: 1 });
    const active = client.request("test.active", {}, { timeoutMs: 1000 });
    await vi.waitFor(() => expect(received).toEqual(["test.active"]));
    const controller = new AbortController();
    const aborted = client.request("test.aborted", {}, { signal: controller.signal });
    const following = client.request("test.following");

    controller.abort(new Error("queued request cancelled"));
    await expect(aborted).rejects.toThrow("queued request cancelled");
    expect(received).toEqual(["test.active"]);

    respondToActive();
    await expect(active).resolves.toBe("test.active");
    await expect(following).resolves.toBe("test.following");
    expect(received).toEqual(["test.active", "test.following"]);
    await client.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it.each(["timeout", "error"] as const)(
    "starts a queued waiter after the active request ends with %s",
    async (failureMode) => {
      const socketPath = await makeTempSocketPath();
      let failFirst = (): void => undefined;
      const received: string[] = [];
      const server = createServer((socket) => {
        socket.setEncoding("utf8");
        socket.once("data", (chunk: string) => {
          const request = JSON.parse(chunk.split("\n", 1)[0]!) as {
            id: string;
            method: string;
          };
          received.push(request.method);
          if (request.method === "test.first") {
            failFirst = () => socket.destroy();
            return;
          }
          socket.write(`${JSON.stringify({ id: request.id, result: request.method })}\n`);
        });
      });
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(socketPath, resolve);
      });

      const client = new HerdrClient(socketPath, { maxConcurrentRequests: 1 });
      const first = client.request(
        "test.first",
        {},
        {
          timeoutMs: failureMode === "timeout" ? 100 : 500,
        },
      );
      await vi.waitFor(() => expect(received).toEqual(["test.first"]));
      const next = client.request("test.next");
      const firstRejection = expect(first).rejects.toMatchObject({
        code: failureMode === "timeout" ? "timeout" : "connection_closed",
      });
      if (failureMode === "error") failFirst();

      await firstRejection;
      await expect(next).resolves.toBe("test.next");
      expect(received).toEqual(["test.first", "test.next"]);
      await client.close();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  );

  it("keeps a retry within the original request deadline", async () => {
    const socketPath = await makeTempSocketPath();
    let connectionCount = 0;
    let now = 1000;
    const server = createServer((socket) => {
      connectionCount += 1;
      const currentConnection = connectionCount;
      socket.once("data", () => {
        if (currentConnection === 1) {
          now = 1900;
          socket.destroy();
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });

    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);
    const client = new HerdrClient(socketPath);
    let deadlineGuardTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const request = client.request("pane.get", {}, { timeoutMs: 1000 });
      const deadlineGuard = new Promise<never>((_resolve, reject) => {
        deadlineGuardTimer = setTimeout(
          () => reject(new Error("retry exceeded the original deadline")),
          300,
        );
      });
      await expect(Promise.race([request, deadlineGuard])).rejects.toMatchObject({
        code: "timeout",
      });
      expect(connectionCount).toBe(2);
    } finally {
      if (deadlineGuardTimer != null) clearTimeout(deadlineGuardTimer);
      nowSpy.mockRestore();
      await client.close();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("rejects active and queued requests when the client closes", async () => {
    const socketPath = await makeTempSocketPath();
    let markConnected = (): void => undefined;
    const connected = new Promise<void>((resolve) => {
      markConnected = resolve;
    });
    const server = createServer((socket) => {
      socket.resume();
      markConnected();
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });

    const client = new HerdrClient(socketPath, { maxConcurrentRequests: 1 });
    const active = client.request("test.active", {}, { timeoutMs: 500 });
    await connected;
    const queued = client.request("test.queued", {}, { timeoutMs: 500 });
    const activeRejection = expect(active).rejects.toMatchObject({ code: "client_closed" });
    const queuedRejection = expect(queued).rejects.toMatchObject({ code: "client_closed" });

    await client.close();
    await Promise.all([activeRejection, queuedRejection]);
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("keeps response buffers isolated across a reconnect", async () => {
    const socketPath = await makeTempSocketPath();
    let connectionCount = 0;
    const server = createServer((socket) => {
      connectionCount += 1;
      const currentConnection = connectionCount;
      socket.setEncoding("utf8");
      socket.once("data", (chunk: string) => {
        const request = JSON.parse(chunk.trim()) as { id: string };
        if (currentConnection === 1) {
          socket.write(`{"id":"${request.id}"`);
          socket.destroy();
          return;
        }
        socket.write(`${JSON.stringify({ id: request.id, result: "reconnected" })}\n`);
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });

    const client = new HerdrClient(socketPath);
    await expect(client.request("pane.get", { pane_id: "wD:p2" })).resolves.toBe("reconnected");
    await client.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("rejects invalid JSON without crashing the process", async () => {
    const socketPath = await makeTempSocketPath();
    const server = createServer((socket) => {
      socket.once("data", () => socket.write("{not-json}\n"));
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });

    const client = new HerdrClient(socketPath);
    await expect(client.request("pane.send_input", { pane_id: "wD:p2" })).rejects.toMatchObject({
      code: "protocol_error",
    });
    await client.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it.each([
    ["missing", (requestId: string) => ({ result: requestId })],
    ["mismatched", (_requestId: string) => ({ id: "unexpected", result: "wrong" })],
  ])("rejects a non-empty response with a %s id", async (_label, buildResponse) => {
    const socketPath = await makeTempSocketPath();
    const server = createServer((socket) => {
      socket.once("data", (chunk) => {
        const request = JSON.parse(chunk.toString().trim()) as { id: string };
        socket.write(`${JSON.stringify(buildResponse(request.id))}\n`);
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });

    const client = new HerdrClient(socketPath);
    await expect(
      client.request("pane.send_input", { pane_id: "wD:p2" }, { timeoutMs: 500 }),
    ).rejects.toMatchObject({ code: "protocol_error" });
    await client.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("rejects a response that has neither a result nor an error", async () => {
    const socketPath = await makeTempSocketPath();
    const server = createServer((socket) => {
      socket.once("data", (chunk) => {
        const request = JSON.parse(chunk.toString().trim()) as { id: string };
        socket.write(`${JSON.stringify({ id: request.id })}\n`);
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });

    const client = new HerdrClient(socketPath);
    await expect(client.request("pane.send_input", { pane_id: "wD:p2" })).rejects.toMatchObject({
      code: "protocol_error",
    });
    await client.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("times out when the server does not respond", async () => {
    const socketPath = await makeTempSocketPath();
    const server = createServer((socket) => socket.resume());
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });

    const client = new HerdrClient(socketPath);
    await expect(client.request("ping", {}, { timeoutMs: 20 })).rejects.toMatchObject({
      code: "timeout",
    });
    await client.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
});

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { HerdrClient, resolveSocketPath } from "./client";

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

  it("serializes concurrent requests across one-request connections", async () => {
    const socketPath = await makeTempSocketPath();
    let connectionCount = 0;
    const received: string[] = [];
    const server = createServer((socket) => {
      connectionCount += 1;
      socket.setEncoding("utf8");
      socket.once("data", (chunk: string) => {
        const request = JSON.parse(chunk.split("\n", 1)[0]!) as { id: string; method: string };
        received.push(request.method);
        socket.write(`${JSON.stringify({ id: request.id, result: request.method })}\n`, () => {
          socket.end();
        });
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });

    const client = new HerdrClient(socketPath);
    await expect(
      Promise.all([client.request("ping"), client.request("pane.list")]),
    ).resolves.toEqual(["ping", "pane.list"]);
    await client.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );

    expect(connectionCount).toBe(2);
    expect(received).toEqual(["ping", "pane.list"]);
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

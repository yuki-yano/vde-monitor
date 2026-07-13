import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Server, createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { CmuxClient, CmuxClientError } from "./client";

const tempDirs: string[] = [];
const servers: Server[] = [];

const makeTempSocketPath = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "vde-cmux-client-"));
  tempDirs.push(dir);
  return join(dir, "cmux.sock");
};

const listen = async (server: Server, socketPath: string): Promise<void> => {
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
};

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(async (server) => await new Promise<void>((resolve) => server.close(() => resolve()))),
  );
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("CmuxClient", () => {
  it("matches newline-delimited v2 requests by id", async () => {
    const socketPath = await makeTempSocketPath();
    const received: unknown[] = [];
    const server = createServer((socket) => {
      socket.setEncoding("utf8");
      socket.on("data", (chunk: string) => {
        const request = JSON.parse(chunk.trim()) as {
          id: string;
          method: string;
          params: unknown;
        };
        received.push(request);
        socket.write(`${JSON.stringify({ id: request.id, ok: true, result: { pong: true } })}\n`);
      });
    });
    await listen(server, socketPath);

    const client = new CmuxClient(socketPath);
    await expect(client.request("system.identify", { detail: true })).resolves.toEqual({
      pong: true,
    });
    await client.close();

    expect(received).toEqual([
      { id: "vdem_1", method: "system.identify", params: { detail: true } },
    ]);
  });

  it("sends auth.login first on every password-authenticated connection", async () => {
    const socketPath = await makeTempSocketPath();
    const received: Array<{ method: string; params: Record<string, unknown> }> = [];
    const server = createServer((socket) => {
      socket.setEncoding("utf8");
      let buffer = "";
      socket.on("data", (chunk: string) => {
        buffer += chunk;
        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex >= 0) {
          const request = JSON.parse(buffer.slice(0, newlineIndex)) as {
            id: string;
            method: string;
            params: Record<string, unknown>;
          };
          buffer = buffer.slice(newlineIndex + 1);
          received.push({ method: request.method, params: request.params });
          socket.write(`${JSON.stringify({ id: request.id, ok: true, result: {} })}\n`);
          newlineIndex = buffer.indexOf("\n");
        }
      });
    });
    await listen(server, socketPath);

    const client = new CmuxClient(socketPath, { password: "s3cret" });
    await client.request("system.tree");
    await client.close();

    expect(received).toEqual([
      { method: "auth.login", params: { password: "s3cret" } },
      { method: "system.tree", params: {} },
    ]);
  });

  it("redacts the password from authentication errors", async () => {
    const socketPath = await makeTempSocketPath();
    const server = createServer((socket) => {
      socket.setEncoding("utf8");
      socket.once("data", (chunk: string) => {
        const request = JSON.parse(chunk.trim()) as { id: string };
        socket.write(
          `${JSON.stringify({
            id: request.id,
            ok: false,
            error: { code: "auth_failed", message: "invalid bad-secret" },
          })}\n`,
        );
      });
    });
    await listen(server, socketPath);

    const client = new CmuxClient(socketPath, { password: "bad-secret" });
    const error = await client.request("system.tree").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CmuxClientError);
    expect((error as Error).message).toBe("invalid [REDACTED]");
    expect((error as Error).message).not.toContain("bad-secret");
    await client.close();
  });

  it("normalizes server errors to CmuxClientError", async () => {
    const socketPath = await makeTempSocketPath();
    const server = createServer((socket) => {
      socket.setEncoding("utf8");
      socket.once("data", (chunk: string) => {
        const request = JSON.parse(chunk.trim()) as { id: string };
        socket.write(
          `${JSON.stringify({
            id: request.id,
            ok: false,
            error: { code: "not_found", message: "Surface not found", data: { kind: "surface" } },
          })}\n`,
        );
      });
    });
    await listen(server, socketPath);

    const client = new CmuxClient(socketPath);
    const error = await client.request("surface.read_text").catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      code: "not_found",
      message: "Surface not found",
      data: { kind: "surface" },
    });
    await client.close();
  });

  it.each([
    ["null", "null"],
    ["array", "[]"],
    ["string", '"unexpected"'],
    ["number", "42"],
    ["boolean", "true"],
  ])("treats a %s frame as a protocol error", async (_label, frame) => {
    const socketPath = await makeTempSocketPath();
    const server = createServer((socket) => {
      socket.once("data", () => {
        socket.write(`${frame}\n`);
      });
    });
    await listen(server, socketPath);

    const client = new CmuxClient(socketPath);
    await expect(client.request("system.tree")).rejects.toMatchObject({
      name: "CmuxClientError",
      code: "protocol_error",
    });
    await client.close();
  });

  it("handles timeouts and AbortSignal for pending requests", async () => {
    const socketPath = await makeTempSocketPath();
    let receivedCount = 0;
    const server = createServer((socket) => {
      socket.on("data", () => {
        receivedCount += 1;
      });
    });
    await listen(server, socketPath);

    const client = new CmuxClient(socketPath);
    await expect(client.request("system.tree", {}, { timeoutMs: 20 })).rejects.toMatchObject({
      code: "timeout",
    });

    const controller = new AbortController();
    const aborted = client.request("system.top", {}, { signal: controller.signal });
    await expect.poll(() => receivedCount).toBe(2);
    controller.abort(new Error("inspection cancelled"));
    await expect(aborted).rejects.toThrow("inspection cancelled");
    await client.close();
  });

  it("ignores a late response after timeout and resolves the next request", async () => {
    const socketPath = await makeTempSocketPath();
    let requestCount = 0;
    const server = createServer((socket) => {
      socket.setEncoding("utf8");
      let buffer = "";
      socket.on("data", (chunk: string) => {
        buffer += chunk;
        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex >= 0) {
          const request = JSON.parse(buffer.slice(0, newlineIndex)) as { id: string };
          buffer = buffer.slice(newlineIndex + 1);
          requestCount += 1;
          if (requestCount === 1) {
            setTimeout(() => {
              socket.write(`${JSON.stringify({ id: request.id, ok: true, result: "late" })}\n`);
            }, 30);
          } else {
            socket.write(`${JSON.stringify({ id: request.id, ok: true, result: "next" })}\n`);
          }
          newlineIndex = buffer.indexOf("\n");
        }
      });
    });
    await listen(server, socketPath);

    const client = new CmuxClient(socketPath);
    await expect(client.request("system.tree", {}, { timeoutMs: 10 })).rejects.toMatchObject({
      code: "timeout",
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    await expect(client.request("system.top")).resolves.toBe("next");
    await client.close();
  });

  it("reconnects and reauthenticates on the next request after disconnect", async () => {
    const socketPath = await makeTempSocketPath();
    const methods: string[] = [];
    let connectionCount = 0;
    const server = createServer((socket) => {
      connectionCount += 1;
      const thisConnection = connectionCount;
      socket.setEncoding("utf8");
      let buffer = "";
      socket.on("data", (chunk: string) => {
        buffer += chunk;
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex < 0) return;
        const request = JSON.parse(buffer.slice(0, newlineIndex)) as {
          id: string;
          method: string;
        };
        buffer = buffer.slice(newlineIndex + 1);
        methods.push(request.method);
        socket.write(`${JSON.stringify({ id: request.id, ok: true, result: {} })}\n`, () => {
          if (request.method !== "auth.login" && thisConnection === 1) socket.end();
        });
      });
    });
    await listen(server, socketPath);

    const client = new CmuxClient(socketPath, { password: "secret" });
    await client.request("system.tree");
    await expect.poll(() => connectionCount).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await client.request("system.top");
    await client.close();

    expect(methods).toEqual(["auth.login", "system.tree", "auth.login", "system.top"]);
    expect(connectionCount).toBe(2);
  });

  it("normalizes a pending socket error and reconnects for the next request", async () => {
    const socketPath = await makeTempSocketPath();
    let connectionCount = 0;
    const server = createServer((socket) => {
      connectionCount += 1;
      const currentConnection = connectionCount;
      socket.setEncoding("utf8");
      socket.once("data", (chunk: string) => {
        const request = JSON.parse(chunk.trim()) as { id: string };
        if (currentConnection === 1) {
          socket.destroy();
          return;
        }
        socket.write(`${JSON.stringify({ id: request.id, ok: true, result: "reconnected" })}\n`);
      });
    });
    await listen(server, socketPath);

    const client = new CmuxClient(socketPath);
    await expect(client.request("system.tree")).rejects.toMatchObject({
      name: "CmuxClientError",
      code: "connection_closed",
    });
    await expect(client.request("system.top")).resolves.toBe("reconnected");
    await client.close();
    expect(connectionCount).toBe(2);
  });

  it("does not revive or reuse a socket that connects while closing", async () => {
    const socketPath = await makeTempSocketPath();
    let authReceived = false;
    const server = createServer((socket) => {
      socket.once("data", () => {
        authReceived = true;
      });
    });
    await listen(server, socketPath);

    const client = new CmuxClient(socketPath, { password: "secret" });
    const pending = client.request("system.tree");
    await expect.poll(() => authReceived).toBe(true);
    await client.close();

    await expect(pending).rejects.toMatchObject({ code: "client_closed" });
    await expect(client.request("system.top")).rejects.toMatchObject({
      code: "client_closed",
    });
  });
});

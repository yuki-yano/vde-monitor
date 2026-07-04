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
  it("HERDR_SOCKET_PATH を最優先で使う", () => {
    expect(
      resolveSocketPath({ HERDR_SOCKET_PATH: "/tmp/x.sock", HERDR_SESSION: "work" }, "/home/u"),
    ).toBe("/tmp/x.sock");
  });

  it("HERDR_SESSION から named session の socket を解決する", () => {
    expect(resolveSocketPath({ HERDR_SESSION: "work" }, "/home/u")).toBe(
      "/home/u/.config/herdr/sessions/work/herdr.sock",
    );
  });

  it("既定は default session の socket", () => {
    expect(resolveSocketPath({}, "/home/u")).toBe("/home/u/.config/herdr/herdr.sock");
  });
});

describe("HerdrClient", () => {
  it("request が同一 id のレスポンスを解決する", async () => {
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

  it("server がレスポンス後に接続を閉じた場合は次の request で再接続する", async () => {
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

  it("応答前に接続が落ちた request は一度だけ再接続して再送する", async () => {
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
});

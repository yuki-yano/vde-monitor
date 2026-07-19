import { createServer } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { findAvailablePort, isPortAvailable, waitForPort } from "./dev-network";

const HOST = "127.0.0.1";
const servers: ReturnType<typeof createServer>[] = [];

const listen = async (port = 0) => {
  const server = createServer();
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, HOST, resolve);
  });
  const address = server.address();
  if (address == null || typeof address === "string") {
    throw new Error("Expected a TCP server address");
  }
  return { server, port: address.port };
};

const close = (server: ReturnType<typeof createServer>) =>
  new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

afterEach(async () => {
  await Promise.all(servers.filter((server) => server.listening).map(close));
  servers.length = 0;
});

describe("development port coordination", () => {
  it("skips a port that is already in use", async () => {
    const { port } = await listen();

    await expect(isPortAvailable(port, HOST)).resolves.toBe(false);
    const availablePort = await findAvailablePort(port, HOST, 20);
    expect(availablePort).toBeGreaterThan(port);
  });

  it("waits until the backend begins accepting connections", async () => {
    const { server, port } = await listen();
    await close(server);

    const delayedServer = createServer();
    servers.push(delayedServer);
    const timer = setTimeout(() => delayedServer.listen(port, HOST), 40);

    try {
      await expect(waitForPort(port, HOST, 1_000, 5)).resolves.toBeUndefined();
    } finally {
      clearTimeout(timer);
    }
  });

  it("fails when the backend does not become ready before the deadline", async () => {
    const { server, port } = await listen();
    await close(server);

    await expect(waitForPort(port, HOST, 30, 5)).rejects.toThrow(
      `Dev server did not become ready at ${HOST}:${port} within 30ms`,
    );
  });
});

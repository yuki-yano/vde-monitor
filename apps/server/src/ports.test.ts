// @vitest-environment node
import { createServer } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { listenOnAvailablePort } from "./ports";

const servers: ReturnType<typeof createServer>[] = [];

const closeServer = (server: ReturnType<typeof createServer>) =>
  new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => closeServer(server)));
});

describe("listenOnAvailablePort", () => {
  it("retries the actual application bind after EADDRINUSE", async () => {
    const occupied = createServer();
    servers.push(occupied);
    await new Promise<void>((resolve) => occupied.listen(0, "127.0.0.1", resolve));
    const address = occupied.address();
    if (address == null || typeof address === "string") {
      throw new Error("failed to resolve occupied port");
    }

    const bound = await listenOnAvailablePort({
      startPort: address.port,
      host: "127.0.0.1",
      attempts: 10,
      listen: (port, onListening) => {
        const server = createServer();
        server.listen(port, "127.0.0.1", onListening);
        return server;
      },
    });
    servers.push(bound.server);

    expect(bound.port).toBeGreaterThan(address.port);
    expect(bound.server.listening).toBe(true);
  });
});

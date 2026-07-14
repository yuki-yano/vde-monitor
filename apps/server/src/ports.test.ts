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

  it("stops at 65535 instead of passing an invalid port to the listener", async () => {
    const attemptedPorts: number[] = [];
    const listen = (port: number) => {
      attemptedPorts.push(port);
      const listeners = new Set<(error: NodeJS.ErrnoException) => void>();
      const server = {
        once: (_event: "error", listener: (error: NodeJS.ErrnoException) => void) => {
          listeners.add(listener);
          queueMicrotask(() => {
            const error = new Error("occupied") as NodeJS.ErrnoException;
            error.code = "EADDRINUSE";
            listeners.forEach((activeListener) => activeListener(error));
          });
          return server;
        },
        off: (_event: "error", listener: (error: NodeJS.ErrnoException) => void) => {
          listeners.delete(listener);
          return server;
        },
      };
      return server;
    };

    await expect(
      listenOnAvailablePort({
        startPort: 65535,
        host: "127.0.0.1",
        attempts: 10,
        listen,
      }),
    ).rejects.toThrow("No available port found in range 65535-65535");
    expect(attemptedPorts).toEqual([65535]);
  });
});

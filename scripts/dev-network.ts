import { createConnection, createServer } from "node:net";

const CONNECTION_TIMEOUT_MS = 200;
const DEFAULT_RETRY_MS = 25;

export const isPortAvailable = (port: number, host: string) =>
  new Promise<boolean>((resolve) => {
    const server = createServer();
    server.once("error", () => {
      server.close();
      resolve(false);
    });
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });

export const findAvailablePort = async (startPort: number, host: string, attempts: number) => {
  for (let i = 0; i < attempts; i += 1) {
    const port = startPort + i;
    if (await isPortAvailable(port, host)) {
      return port;
    }
  }
  throw new Error(
    `No available server port found in range ${startPort}-${startPort + attempts - 1}`,
  );
};

export const isPortReachable = (port: number, host: string) =>
  new Promise<boolean>((resolve) => {
    const connection = createConnection({ host, port });
    let settled = false;
    const finish = (reachable: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      connection.destroy();
      resolve(reachable);
    };
    connection.setTimeout(CONNECTION_TIMEOUT_MS, () => finish(false));
    connection.once("connect", () => finish(true));
    connection.once("error", () => finish(false));
  });

export const waitForPort = async (
  port: number,
  host: string,
  timeoutMs: number,
  retryMs = DEFAULT_RETRY_MS,
) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortReachable(port, host)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, retryMs));
  }
  throw new Error(`Dev server did not become ready at ${host}:${port} within ${timeoutMs}ms`);
};

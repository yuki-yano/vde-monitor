type BindableServer = {
  once: (event: "error", listener: (error: NodeJS.ErrnoException) => void) => unknown;
  off: (event: "error", listener: (error: NodeJS.ErrnoException) => void) => unknown;
};

type ListenOnAvailablePortOptions<Server extends BindableServer> = {
  startPort: number;
  host: string;
  attempts: number;
  listen: (port: number, onListening: () => void) => Server;
};

export const listenOnAvailablePort = async <Server extends BindableServer>({
  startPort,
  host,
  attempts,
  listen,
}: ListenOnAvailablePortOptions<Server>): Promise<{ port: number; server: Server }> => {
  const endPort = Math.min(65535, startPort + attempts - 1);
  for (let port = startPort; port <= endPort; port += 1) {
    const result = await new Promise<{ ok: true; server: Server } | { ok: false }>(
      (resolve, reject) => {
        let server: Server;
        const onError = (error: NodeJS.ErrnoException) => {
          if (error.code === "EADDRINUSE") {
            resolve({ ok: false });
            return;
          }
          reject(error);
        };
        server = listen(port, () => {
          server.off("error", onError);
          resolve({ ok: true, server });
        });
        server.once("error", onError);
      },
    );
    if (result.ok) {
      return { port, server: result.server };
    }
  }
  throw new Error(`No available port found in range ${startPort}-${endPort} on ${host}`);
};

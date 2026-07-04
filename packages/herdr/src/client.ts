import { type Socket, createConnection } from "node:net";

export const resolveSocketPath = (
  env: Record<string, string | undefined>,
  homeDir: string,
): string => {
  if (env.HERDR_SOCKET_PATH) return env.HERDR_SOCKET_PATH;
  if (env.HERDR_SESSION) {
    return `${homeDir}/.config/herdr/sessions/${env.HERDR_SESSION}/herdr.sock`;
  }
  return `${homeDir}/.config/herdr/herdr.sock`;
};

type PendingEntry = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type HerdrResponse = {
  id?: string;
  result?: unknown;
  error?: {
    code?: string;
    message?: string;
  };
};

export class HerdrClient {
  private buffer = "";
  private seq = 0;
  private socket: Socket | null = null;
  private readonly pending = new Map<string, PendingEntry>();

  constructor(private readonly socketPath: string) {}

  async request<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const socket = await this.ensureConnected();
    const id = `vdem_${++this.seq}`;
    const line = `${JSON.stringify({ id, method, params })}\n`;

    return await new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      socket.write(line, (error) => {
        if (error == null) return;
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  async close(): Promise<void> {
    const socket = this.socket;
    this.socket = null;
    this.buffer = "";
    this.rejectAll(new Error("herdr client closed"));
    if (socket == null || socket.destroyed) return;

    await new Promise<void>((resolve) => {
      socket.once("close", resolve);
      socket.end();
    });
  }

  private async ensureConnected(): Promise<Socket> {
    if (
      this.socket != null &&
      !this.socket.destroyed &&
      !this.socket.closed &&
      !this.socket.readableEnded &&
      !this.socket.writableEnded
    ) {
      return this.socket;
    }

    const socket = createConnection(this.socketPath);
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => this.onData(chunk));
    socket.on("error", (error) => this.rejectAll(error));
    socket.on("end", () => {
      if (this.socket === socket) {
        this.socket = null;
      }
    });
    socket.on("close", () => {
      if (this.socket === socket) {
        this.socket = null;
      }
    });

    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        socket.off("connect", onConnect);
        socket.off("error", onError);
      };
      const onConnect = (): void => {
        cleanup();
        resolve();
      };
      const onError = (error: Error): void => {
        cleanup();
        reject(error);
      };
      socket.once("connect", onConnect);
      socket.once("error", onError);
    });

    this.socket = socket;
    return socket;
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      this.dispatch(line);
      newlineIndex = this.buffer.indexOf("\n");
    }
  }

  private dispatch(line: string): void {
    if (!line.trim()) return;

    const message = JSON.parse(line) as HerdrResponse;
    if (!message.id) return;

    const entry = this.pending.get(message.id);
    if (entry == null) return;
    this.pending.delete(message.id);

    if (message.error != null) {
      const prefix =
        message.error.code == null ? "herdr error" : `herdr error ${message.error.code}`;
      entry.reject(
        new Error(message.error.message == null ? prefix : `${prefix}: ${message.error.message}`),
      );
      return;
    }

    entry.resolve(message.result);
  }

  private rejectAll(error: Error): void {
    for (const entry of this.pending.values()) {
      entry.reject(error);
    }
    this.pending.clear();
  }
}

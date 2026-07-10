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

const createAbortError = (signal: AbortSignal) => {
  if (signal.reason instanceof Error) {
    return signal.reason;
  }
  return new Error("herdr request aborted");
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

  async request<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    options: { signal?: AbortSignal } = {},
  ): Promise<T> {
    try {
      return await this.requestOnce<T>(method, params, options.signal);
    } catch (error) {
      if (isRecoverableConnectionError(error)) {
        this.socket = null;
        return await this.requestOnce<T>(method, params, options.signal);
      }
      throw error;
    }
  }

  private async requestOnce<T>(
    method: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
    const socket = await this.ensureConnected();
    if (signal?.aborted) {
      throw createAbortError(signal);
    }
    const id = `vdem_${++this.seq}`;
    const line = `${JSON.stringify({ id, method, params })}\n`;

    return await new Promise<T>((resolve, reject) => {
      const cleanup = () => {
        signal?.removeEventListener("abort", onAbort);
      };
      const resolveRequest = (value: unknown) => {
        cleanup();
        resolve(value as T);
      };
      const rejectRequest = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onAbort = () => {
        if (!this.pending.delete(id)) return;
        rejectRequest(createAbortError(signal!));
      };
      this.pending.set(id, {
        resolve: resolveRequest,
        reject: rejectRequest,
      });
      signal?.addEventListener("abort", onAbort, { once: true });
      socket.write(line, (error) => {
        if (error == null) return;
        if (!this.pending.delete(id)) return;
        rejectRequest(error);
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
    socket.on("error", (error) => {
      if (this.socket === socket) {
        this.socket = null;
      }
      this.rejectAll(error);
    });
    socket.on("end", () => {
      if (this.socket === socket) {
        this.socket = null;
      }
      this.rejectAll(new Error("herdr socket closed"));
    });
    socket.on("close", () => {
      if (this.socket === socket) {
        this.socket = null;
      }
      this.rejectAll(new Error("herdr socket closed"));
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

const isRecoverableConnectionError = (error: unknown): error is Error & { code?: string } => {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: string }).code;
  return (
    code === "EPIPE" ||
    code === "ECONNRESET" ||
    code === "ERR_STREAM_DESTROYED" ||
    error.message.includes("socket has been ended") ||
    error.message.includes("herdr socket closed") ||
    error.message.includes("write EPIPE")
  );
};

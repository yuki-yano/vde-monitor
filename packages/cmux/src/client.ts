import { type Socket, createConnection } from "node:net";

import { CMUX_METHODS } from "./methods";
import type { CmuxRequestOptions, CmuxRequester } from "./types";

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

type PendingEntry = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  cleanupSignal: () => void;
};

type CmuxResponse = {
  id?: unknown;
  ok?: unknown;
  result?: unknown;
  error?: {
    code?: unknown;
    message?: unknown;
    data?: unknown;
  };
};

export type CmuxClientOptions = {
  password?: string | null;
  requestTimeoutMs?: number;
};

export class CmuxClientError extends Error {
  override readonly name = "CmuxClientError";

  constructor(
    readonly code: string,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
  }
}

const isUsableSocket = (socket: Socket | null): socket is Socket =>
  socket != null &&
  !socket.destroyed &&
  !socket.closed &&
  !socket.readableEnded &&
  !socket.writableEnded;

const normalizeTimeout = (value: number | undefined, fallback: number): number => {
  if (value == null) return fallback;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new CmuxClientError("invalid_timeout", "cmux timeout must be a positive integer");
  }
  return value;
};

const createAbortError = (signal: AbortSignal): Error => {
  if (signal.reason instanceof Error) return signal.reason;
  return new CmuxClientError("aborted", "cmux request aborted");
};

const waitFor = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> => {
  if (signal?.aborted) throw createAbortError(signal);

  return await new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = (): void => finish(() => reject(createAbortError(signal!)));
    const timer = setTimeout(
      () =>
        finish(() =>
          reject(new CmuxClientError("timeout", `cmux request timed out after ${timeoutMs}ms`)),
        ),
      timeoutMs,
    );
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(normalizeClientError(error))),
    );
  });
};

const normalizeClientError = (error: unknown): Error => {
  if (error instanceof CmuxClientError) return error;
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (
      code === "EPIPE" ||
      code === "ECONNRESET" ||
      code === "ECONNABORTED" ||
      code === "ERR_STREAM_DESTROYED"
    ) {
      return new CmuxClientError("connection_closed", error.message);
    }
    return new CmuxClientError("connection_failed", error.message);
  }
  return new CmuxClientError("internal", "cmux request failed");
};

export class CmuxClient implements CmuxRequester {
  private buffer = "";
  private closed = false;
  private connecting: Promise<Socket> | null = null;
  private connectingSocket: Socket | null = null;
  private seq = 0;
  private socket: Socket | null = null;
  private readonly pending = new Map<string, PendingEntry>();
  private readonly password: string | null;
  private readonly requestTimeoutMs: number;

  constructor(
    private readonly socketPath: string,
    options: CmuxClientOptions = {},
  ) {
    if (socketPath.trim().length === 0) {
      throw new CmuxClientError("invalid_socket_path", "cmux socket path is required");
    }
    this.password = options.password ?? null;
    this.requestTimeoutMs = normalizeTimeout(options.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
  }

  async request<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    options: CmuxRequestOptions = {},
  ): Promise<T> {
    if (this.closed) throw new CmuxClientError("client_closed", "cmux client is closed");
    const timeoutMs = normalizeTimeout(options.timeoutMs, this.requestTimeoutMs);
    const startedAt = Date.now();
    const socket = await waitFor(this.ensureConnected(), timeoutMs, options.signal);
    const remainingMs = Math.max(1, timeoutMs - (Date.now() - startedAt));
    return await this.requestOnSocket<T>(socket, method, params, remainingMs, options.signal);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const socket = this.socket;
    const connectingSocket = this.connectingSocket;
    this.socket = null;
    this.connecting = null;
    this.connectingSocket = null;
    this.buffer = "";
    this.rejectAll(new CmuxClientError("client_closed", "cmux client closed"));
    socket?.destroy();
    if (connectingSocket !== socket) connectingSocket?.destroy();
  }

  private async ensureConnected(): Promise<Socket> {
    if (this.closed) throw new CmuxClientError("client_closed", "cmux client is closed");
    if (isUsableSocket(this.socket)) return this.socket;
    if (this.connecting != null) return await this.connecting;

    const connecting = this.connectAndAuthenticate();
    this.connecting = connecting;
    try {
      return await connecting;
    } finally {
      if (this.connecting === connecting) this.connecting = null;
    }
  }

  private async connectAndAuthenticate(): Promise<Socket> {
    const socket = await this.connectSocket();
    if (this.closed) {
      socket.destroy();
      throw new CmuxClientError("client_closed", "cmux client is closed");
    }
    this.socket = socket;
    this.buffer = "";

    if (this.password == null) return socket;

    try {
      await this.requestOnSocket(
        socket,
        CMUX_METHODS.authLogin,
        { password: this.password },
        this.requestTimeoutMs,
      );
      return socket;
    } catch (error) {
      if (this.socket === socket) this.socket = null;
      socket.destroy();
      throw this.redactPassword(normalizeClientError(error));
    }
  }

  private async connectSocket(): Promise<Socket> {
    return await new Promise<Socket>((resolve, reject) => {
      const socket = createConnection(this.socketPath);
      this.connectingSocket = socket;
      socket.setEncoding("utf8");

      let settled = false;
      const finish = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.off("connect", onConnect);
        socket.off("error", onConnectError);
        socket.off("close", onPrematureClose);
        if (this.connectingSocket === socket) this.connectingSocket = null;
        callback();
      };
      const onConnect = (): void => finish(() => resolve(socket));
      const onConnectError = (error: Error): void =>
        finish(() => {
          socket.destroy();
          reject(new CmuxClientError("connection_failed", error.message));
        });
      const onPrematureClose = (): void =>
        finish(() =>
          reject(
            new CmuxClientError(
              this.closed ? "client_closed" : "connection_closed",
              this.closed ? "cmux client is closed" : "cmux socket closed before connecting",
            ),
          ),
        );
      const timer = setTimeout(
        () =>
          finish(() => {
            socket.destroy();
            reject(
              new CmuxClientError(
                "connection_timeout",
                `cmux connection timed out after ${this.requestTimeoutMs}ms`,
              ),
            );
          }),
        this.requestTimeoutMs,
      );

      socket.on("data", (chunk: string) => this.onData(socket, chunk));
      socket.on("error", (error) => this.onSocketFailure(socket, error));
      socket.on("end", () =>
        this.onSocketFailure(
          socket,
          new CmuxClientError("connection_closed", "cmux socket closed"),
        ),
      );
      socket.on("close", () =>
        this.onSocketFailure(
          socket,
          new CmuxClientError("connection_closed", "cmux socket closed"),
        ),
      );
      socket.once("connect", onConnect);
      socket.once("error", onConnectError);
      socket.once("close", onPrematureClose);
    });
  }

  private async requestOnSocket<T>(
    socket: Socket,
    method: string,
    params: Record<string, unknown>,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<T> {
    if (signal?.aborted) throw createAbortError(signal);
    if (!isUsableSocket(socket)) {
      throw new CmuxClientError("connection_closed", "cmux socket is not connected");
    }

    const id = `vdem_${++this.seq}`;
    const line = `${JSON.stringify({ id, method, params })}\n`;

    return await new Promise<T>((resolve, reject) => {
      const cleanupSignal = (): void => signal?.removeEventListener("abort", onAbort);
      const rejectPending = (error: Error): void => {
        const entry = this.pending.get(id);
        if (entry == null) return;
        this.pending.delete(id);
        clearTimeout(entry.timer);
        entry.cleanupSignal();
        reject(error);
      };
      const onAbort = (): void => rejectPending(createAbortError(signal!));
      const timer = setTimeout(
        () =>
          rejectPending(
            new CmuxClientError("timeout", `cmux request timed out after ${timeoutMs}ms`),
          ),
        timeoutMs,
      );

      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
        cleanupSignal,
      });
      signal?.addEventListener("abort", onAbort, { once: true });
      socket.write(line, (error) => {
        if (error == null) return;
        rejectPending(new CmuxClientError("write_failed", error.message));
      });
    });
  }

  private onData(socket: Socket, chunk: string): void {
    if (this.socket !== socket) return;
    this.buffer += chunk;
    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line.trim().length > 0 && !this.dispatch(line)) {
        this.onSocketFailure(
          socket,
          new CmuxClientError("protocol_error", "cmux returned an invalid JSON response"),
        );
        socket.destroy();
        return;
      }
      newlineIndex = this.buffer.indexOf("\n");
    }
  }

  private dispatch(line: string): boolean {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return false;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return false;
    const message = parsed as CmuxResponse;

    if (typeof message.id !== "string" && typeof message.id !== "number") return true;
    const id = String(message.id);
    const entry = this.pending.get(id);
    if (entry == null) return true;
    this.pending.delete(id);
    clearTimeout(entry.timer);
    entry.cleanupSignal();

    if (message.ok !== true) {
      const code = typeof message.error?.code === "string" ? message.error.code : "request_error";
      const messageText =
        typeof message.error?.message === "string" ? message.error.message : "cmux request failed";
      entry.reject(
        this.redactPassword(new CmuxClientError(code, messageText, message.error?.data)),
      );
      return true;
    }

    entry.resolve(message.result);
    return true;
  }

  private onSocketFailure(socket: Socket, error: Error): void {
    if (this.socket !== socket) return;
    this.socket = null;
    this.buffer = "";
    this.rejectAll(normalizeClientError(error));
  }

  private rejectAll(error: Error): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.cleanupSignal();
      entry.reject(error);
    }
    this.pending.clear();
  }

  private redactPassword(error: Error): Error {
    if (
      this.password == null ||
      this.password.length === 0 ||
      !error.message.includes(this.password)
    ) {
      return error;
    }
    if (error instanceof CmuxClientError) {
      return new CmuxClientError(error.code, error.message.replaceAll(this.password, "[REDACTED]"));
    }
    return new Error(error.message.replaceAll(this.password, "[REDACTED]"));
  }
}

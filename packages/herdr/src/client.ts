import { type Socket, createConnection } from "node:net";

import { HERDR_METHODS } from "./methods";

export const HERDR_REQUEST_TIMEOUT_MS = 5000;

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
  socket: Socket;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  cleanupSignal: () => void;
};

type HerdrResponse = {
  id?: unknown;
  result?: unknown;
  error?: {
    code?: unknown;
    message?: unknown;
  };
};

export type HerdrRequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type HerdrClientOptions = {
  requestTimeoutMs?: number;
};

export class HerdrClientError extends Error {
  override readonly name = "HerdrClientError";

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const RETRY_SAFE_METHODS = new Set<string>([
  HERDR_METHODS.ping,
  HERDR_METHODS.workspaceList,
  HERDR_METHODS.tabList,
  HERDR_METHODS.paneList,
  HERDR_METHODS.paneGet,
  HERDR_METHODS.paneProcessInfo,
  HERDR_METHODS.paneRead,
]);

const isUsableSocket = (socket: Socket | null): socket is Socket =>
  socket != null &&
  !socket.destroyed &&
  !socket.closed &&
  !socket.readableEnded &&
  !socket.writableEnded;

const normalizeTimeout = (value: number | undefined, fallback: number): number => {
  if (value == null) return fallback;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new HerdrClientError("invalid_timeout", "herdr timeout must be a positive integer");
  }
  return value;
};

const createAbortError = (signal: AbortSignal): Error => {
  if (signal.reason instanceof Error) return signal.reason;
  return new HerdrClientError("aborted", "herdr request aborted");
};

const createConnectionClosedError = (message = "herdr socket closed"): HerdrClientError =>
  new HerdrClientError("connection_closed", message);

const createTimeoutError = (timeoutMs: number): HerdrClientError =>
  new HerdrClientError("timeout", `herdr request timed out after ${timeoutMs}ms`);

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
    const timer = setTimeout(() => finish(() => reject(createTimeoutError(timeoutMs))), timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) =>
        finish(() => reject(error instanceof Error ? error : new Error("herdr request failed"))),
    );
  });
};

export class HerdrClient {
  private closed = false;
  private connecting: Promise<Socket> | null = null;
  private connectingSocket: Socket | null = null;
  private seq = 0;
  private socket: Socket | null = null;
  private readonly buffers = new Map<Socket, string>();
  private readonly pending = new Map<string, PendingEntry>();
  private readonly requestTimeoutMs: number;
  private requestTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly socketPath: string,
    options: HerdrClientOptions = {},
  ) {
    this.requestTimeoutMs = normalizeTimeout(options.requestTimeoutMs, HERDR_REQUEST_TIMEOUT_MS);
  }

  async request<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    options: HerdrRequestOptions = {},
  ): Promise<T> {
    if (this.closed) {
      throw new HerdrClientError("client_closed", "herdr client is closed");
    }
    const timeoutMs = normalizeTimeout(options.timeoutMs, this.requestTimeoutMs);
    const startedAt = Date.now();
    const previous = this.requestTail;
    let release: () => void = () => undefined;
    const completion = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.requestTail = previous.then(() => completion);

    try {
      await waitFor(previous, timeoutMs, options.signal);
      return await this.runRequest<T>(method, params, timeoutMs, startedAt, options.signal);
    } catch (error) {
      if (
        !RETRY_SAFE_METHODS.has(method) ||
        !isRecoverableConnectionError(error) ||
        options.signal?.aborted ||
        this.closed
      ) {
        throw error;
      }
      return await this.runRequest<T>(method, params, timeoutMs, startedAt, options.signal);
    } finally {
      release();
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const socket = this.socket;
    const connectingSocket = this.connectingSocket;
    this.socket = null;
    this.connecting = null;
    this.connectingSocket = null;
    this.rejectAll(new HerdrClientError("client_closed", "herdr client closed"));
    this.buffers.clear();
    socket?.destroy();
    if (connectingSocket !== socket) connectingSocket?.destroy();
  }

  private async runRequest<T>(
    method: string,
    params: Record<string, unknown>,
    timeoutMs: number,
    startedAt: number,
    signal?: AbortSignal,
  ): Promise<T> {
    const beforeConnectMs = timeoutMs - (Date.now() - startedAt);
    if (beforeConnectMs <= 0) throw createTimeoutError(timeoutMs);
    let socket: Socket;
    try {
      socket = await waitFor(this.ensureConnected(), beforeConnectMs, signal);
    } catch (error) {
      this.connectingSocket?.destroy();
      throw error;
    }
    const remainingMs = timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) throw createTimeoutError(timeoutMs);
    return await this.requestOnSocket<T>(socket, method, params, remainingMs, timeoutMs, signal);
  }

  private async ensureConnected(): Promise<Socket> {
    if (this.closed) {
      throw new HerdrClientError("client_closed", "herdr client is closed");
    }
    if (isUsableSocket(this.socket)) return this.socket;
    if (this.connecting != null) return await this.connecting;

    const connecting = this.connectSocket();
    this.connecting = connecting;
    try {
      return await connecting;
    } finally {
      if (this.connecting === connecting) this.connecting = null;
    }
  }

  private async connectSocket(): Promise<Socket> {
    return await new Promise<Socket>((resolve, reject) => {
      const socket = createConnection(this.socketPath);
      this.connectingSocket = socket;
      this.buffers.set(socket, "");
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
      const failConnection = (error: Error): void =>
        finish(() => {
          this.buffers.delete(socket);
          socket.destroy();
          reject(error);
        });
      const onConnect = (): void =>
        finish(() => {
          if (this.closed) {
            socket.destroy();
            reject(new HerdrClientError("client_closed", "herdr client is closed"));
            return;
          }
          this.socket = socket;
          resolve(socket);
        });
      const onConnectError = (error: Error): void => failConnection(error);
      const onPrematureClose = (): void => failConnection(createConnectionClosedError());
      const timer = setTimeout(
        () =>
          failConnection(
            new HerdrClientError(
              "connection_timeout",
              `herdr connection timed out after ${this.requestTimeoutMs}ms`,
            ),
          ),
        this.requestTimeoutMs,
      );

      socket.on("data", (chunk: string) => this.onData(socket, chunk));
      socket.on("error", (error) => this.onSocketFailure(socket, error));
      socket.on("end", () => this.onSocketFailure(socket, createConnectionClosedError()));
      socket.on("close", () => this.onSocketFailure(socket, createConnectionClosedError()));
      socket.once("connect", onConnect);
      socket.once("error", onConnectError);
      socket.once("close", onPrematureClose);
    });
  }

  private async requestOnSocket<T>(
    socket: Socket,
    method: string,
    params: Record<string, unknown>,
    remainingMs: number,
    totalTimeoutMs: number,
    signal?: AbortSignal,
  ): Promise<T> {
    if (signal?.aborted) throw createAbortError(signal);
    if (!isUsableSocket(socket)) throw createConnectionClosedError();

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
        this.retireSocket(socket);
        reject(error);
      };
      const onAbort = (): void => rejectPending(createAbortError(signal!));
      const timer = setTimeout(
        () => rejectPending(createTimeoutError(totalTimeoutMs)),
        remainingMs,
      );

      this.pending.set(id, {
        socket,
        resolve: (value) => resolve(value as T),
        reject,
        timer,
        cleanupSignal,
      });
      signal?.addEventListener("abort", onAbort, { once: true });
      socket.write(line, (error) => {
        if (error == null) return;
        rejectPending(error);
        this.onSocketFailure(socket, error);
        socket.destroy();
      });
    });
  }

  private onData(socket: Socket, chunk: string): void {
    if (this.socket !== socket) return;
    let buffer = (this.buffers.get(socket) ?? "") + chunk;
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.trim().length > 0 && !this.dispatch(socket, line)) {
        const error = new HerdrClientError(
          "protocol_error",
          "herdr returned an invalid JSON response",
        );
        this.onSocketFailure(socket, error);
        socket.destroy();
        return;
      }
      newlineIndex = buffer.indexOf("\n");
    }
    if (this.socket === socket) {
      this.buffers.set(socket, buffer);
    }
  }

  private dispatch(socket: Socket, line: string): boolean {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return false;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return false;
    const message = parsed as HerdrResponse;
    if (typeof message.id !== "string" && typeof message.id !== "number") return true;

    const id = String(message.id);
    const entry = this.pending.get(id);
    if (entry == null || entry.socket !== socket) return true;
    if (message.error == null && !Object.hasOwn(message, "result")) return false;

    this.pending.delete(id);
    clearTimeout(entry.timer);
    entry.cleanupSignal();
    this.retireSocket(socket);

    if (message.error != null) {
      const code = typeof message.error.code === "string" ? message.error.code : null;
      const detail = typeof message.error.message === "string" ? message.error.message : null;
      const prefix = code == null ? "herdr error" : `herdr error ${code}`;
      entry.reject(
        new HerdrClientError(
          code ?? "request_error",
          detail == null ? prefix : `${prefix}: ${detail}`,
        ),
      );
      return true;
    }

    entry.resolve(message.result);
    return true;
  }

  private retireSocket(socket: Socket): void {
    if (this.socket === socket) this.socket = null;
    this.buffers.delete(socket);
    socket.destroy();
  }

  private onSocketFailure(socket: Socket, error: Error): void {
    if (this.socket === socket) this.socket = null;
    this.buffers.delete(socket);
    this.rejectForSocket(socket, error);
  }

  private rejectForSocket(socket: Socket, error: Error): void {
    for (const [id, entry] of this.pending) {
      if (entry.socket !== socket) continue;
      this.pending.delete(id);
      clearTimeout(entry.timer);
      entry.cleanupSignal();
      entry.reject(error);
    }
  }

  private rejectAll(error: Error): void {
    for (const [id, entry] of this.pending) {
      this.pending.delete(id);
      clearTimeout(entry.timer);
      entry.cleanupSignal();
      entry.reject(error);
    }
  }
}

const isRecoverableConnectionError = (error: unknown): error is Error & { code?: string } => {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: string }).code;
  return (
    code === "connection_closed" ||
    code === "EPIPE" ||
    code === "ECONNRESET" ||
    code === "ERR_STREAM_DESTROYED" ||
    error.message.includes("socket has been ended") ||
    error.message.includes("herdr socket closed") ||
    error.message.includes("write EPIPE")
  );
};

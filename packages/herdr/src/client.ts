import { type Socket, createConnection } from "node:net";

import { HERDR_METHODS } from "./methods";

export const HERDR_REQUEST_TIMEOUT_MS = 5000;
export const HERDR_MAX_CONCURRENT_REQUESTS = 4;

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

type HerdrResponse = {
  id?: unknown;
  result?: unknown;
  error?: {
    code?: unknown;
    message?: unknown;
  };
};

type SlotRelease = () => void;

type SlotWaiter = {
  signal?: AbortSignal;
  onAbort?: () => void;
  resolve: (release: SlotRelease) => void;
  reject: (error: Error) => void;
};

export type HerdrRequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type HerdrClientOptions = {
  requestTimeoutMs?: number;
  maxConcurrentRequests?: number;
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

const normalizeTimeout = (value: number | undefined, fallback: number): number => {
  if (value == null) return fallback;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new HerdrClientError("invalid_timeout", "herdr timeout must be a positive integer");
  }
  return value;
};

const normalizeConcurrency = (value: number | undefined): number => {
  if (value == null) return HERDR_MAX_CONCURRENT_REQUESTS;
  if (!Number.isSafeInteger(value) || value <= 0 || value > HERDR_MAX_CONCURRENT_REQUESTS) {
    throw new HerdrClientError(
      "invalid_concurrency",
      `herdr max concurrency must be between 1 and ${HERDR_MAX_CONCURRENT_REQUESTS}`,
    );
  }
  return value;
};

const createAbortError = (signal: AbortSignal): Error => {
  if (signal.reason instanceof Error) return signal.reason;
  return new HerdrClientError("aborted", "herdr request aborted");
};

const createClientClosedError = (): HerdrClientError =>
  new HerdrClientError("client_closed", "herdr client closed");

const createConnectionClosedError = (message = "herdr socket closed"): HerdrClientError =>
  new HerdrClientError("connection_closed", message);

const createTimeoutError = (timeoutMs: number): HerdrClientError =>
  new HerdrClientError("timeout", `herdr request timed out after ${timeoutMs}ms`);

export class HerdrClient {
  private activeRequestCount = 0;
  private readonly activeSockets = new Set<Socket>();
  private closed = false;
  private readonly maxConcurrentRequests: number;
  private readonly requestTimeoutMs: number;
  private seq = 0;
  private readonly slotWaiters: SlotWaiter[] = [];

  constructor(
    private readonly socketPath: string,
    options: HerdrClientOptions = {},
  ) {
    this.requestTimeoutMs = normalizeTimeout(options.requestTimeoutMs, HERDR_REQUEST_TIMEOUT_MS);
    this.maxConcurrentRequests = normalizeConcurrency(options.maxConcurrentRequests);
  }

  async request<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    options: HerdrRequestOptions = {},
  ): Promise<T> {
    if (this.closed) throw createClientClosedError();
    const timeoutMs = normalizeTimeout(options.timeoutMs, this.requestTimeoutMs);
    const releaseSlot = await this.acquireSlot(options.signal);
    const startedAt = Date.now();

    try {
      try {
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
      }
    } finally {
      releaseSlot();
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const error = createClientClosedError();
    for (const waiter of this.slotWaiters.splice(0)) {
      this.cleanupWaiter(waiter);
      waiter.reject(error);
    }
    for (const socket of this.activeSockets) {
      socket.destroy(error);
    }
  }

  private async runRequest<T>(
    method: string,
    params: Record<string, unknown>,
    timeoutMs: number,
    startedAt: number,
    signal?: AbortSignal,
  ): Promise<T> {
    const remainingMs = timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) throw createTimeoutError(timeoutMs);
    return await this.requestOnce<T>(method, params, remainingMs, timeoutMs, signal);
  }

  private async requestOnce<T>(
    method: string,
    params: Record<string, unknown>,
    remainingMs: number,
    totalTimeoutMs: number,
    signal?: AbortSignal,
  ): Promise<T> {
    if (this.closed) throw createClientClosedError();
    if (signal?.aborted) throw createAbortError(signal);

    const id = `vdem_${++this.seq}`;
    const line = `${JSON.stringify({ id, method, params })}\n`;

    return await new Promise<T>((resolve, reject) => {
      const socket = createConnection(this.socketPath);
      this.activeSockets.add(socket);
      socket.setEncoding("utf8");

      let buffer = "";
      let settled = false;
      const cleanup = (): void => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        socket.off("connect", onConnect);
        socket.off("data", onData);
        socket.off("error", onError);
        socket.off("end", onEnd);
        socket.off("close", onClose);
        this.activeSockets.delete(socket);
      };
      const finish = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        cleanup();
        socket.destroy();
        callback();
      };
      const fail = (error: Error): void => finish(() => reject(error));
      const onAbort = (): void => fail(createAbortError(signal!));
      const onConnect = (): void => {
        if (this.closed) {
          fail(createClientClosedError());
          return;
        }
        socket.write(line, (error) => {
          if (error != null) fail(error);
        });
      };
      const onData = (chunk: string): void => {
        buffer += chunk;
        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex >= 0 && !settled) {
          const responseLine = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          this.dispatchResponse(
            responseLine,
            id,
            (value) => finish(() => resolve(value as T)),
            fail,
          );
          newlineIndex = buffer.indexOf("\n");
        }
      };
      const onError = (error: Error): void => fail(error);
      const onEnd = (): void => fail(createConnectionClosedError());
      const onClose = (): void => fail(createConnectionClosedError());
      const timer = setTimeout(() => fail(createTimeoutError(totalTimeoutMs)), remainingMs);

      signal?.addEventListener("abort", onAbort, { once: true });
      socket.once("connect", onConnect);
      socket.on("data", onData);
      socket.once("error", onError);
      socket.once("end", onEnd);
      socket.once("close", onClose);
    });
  }

  private dispatchResponse(
    line: string,
    expectedId: string,
    resolve: (value: unknown) => void,
    reject: (error: Error) => void,
  ): void {
    if (line.trim().length === 0) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      reject(new HerdrClientError("protocol_error", "herdr returned an invalid JSON response"));
      return;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      reject(new HerdrClientError("protocol_error", "herdr returned an invalid JSON response"));
      return;
    }

    const message = parsed as HerdrResponse;
    if (typeof message.id !== "string" && typeof message.id !== "number") {
      reject(new HerdrClientError("protocol_error", "herdr response has no valid id"));
      return;
    }
    if (String(message.id) !== expectedId) {
      reject(new HerdrClientError("protocol_error", "herdr response id does not match request"));
      return;
    }
    if (message.error == null && !Object.hasOwn(message, "result")) {
      reject(new HerdrClientError("protocol_error", "herdr response has no result or error"));
      return;
    }
    if (message.error != null) {
      const code = typeof message.error.code === "string" ? message.error.code : "request_error";
      const detail = typeof message.error.message === "string" ? message.error.message : null;
      const prefix = code === "request_error" ? "herdr error" : `herdr error ${code}`;
      reject(new HerdrClientError(code, detail == null ? prefix : `${prefix}: ${detail}`));
      return;
    }
    resolve(message.result);
  }

  private async acquireSlot(signal?: AbortSignal): Promise<SlotRelease> {
    if (this.closed) throw createClientClosedError();
    if (signal?.aborted) throw createAbortError(signal);
    if (this.activeRequestCount < this.maxConcurrentRequests) {
      this.activeRequestCount += 1;
      return this.createSlotRelease();
    }

    return await new Promise<SlotRelease>((resolve, reject) => {
      const waiter: SlotWaiter = { resolve, reject, signal };
      waiter.onAbort = () => {
        const index = this.slotWaiters.indexOf(waiter);
        if (index < 0) return;
        this.slotWaiters.splice(index, 1);
        this.cleanupWaiter(waiter);
        reject(createAbortError(signal!));
      };
      this.slotWaiters.push(waiter);
      signal?.addEventListener("abort", waiter.onAbort, { once: true });
    });
  }

  private createSlotRelease(): SlotRelease {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeRequestCount -= 1;
      this.releaseNextWaiter();
    };
  }

  private releaseNextWaiter(): void {
    while (this.slotWaiters.length > 0) {
      const waiter = this.slotWaiters.shift()!;
      this.cleanupWaiter(waiter);
      if (waiter.signal?.aborted) {
        waiter.reject(createAbortError(waiter.signal));
        continue;
      }
      if (this.closed) {
        waiter.reject(createClientClosedError());
        continue;
      }
      this.activeRequestCount += 1;
      waiter.resolve(this.createSlotRelease());
      return;
    }
  }

  private cleanupWaiter(waiter: SlotWaiter): void {
    if (waiter.onAbort != null) {
      waiter.signal?.removeEventListener("abort", waiter.onAbort);
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

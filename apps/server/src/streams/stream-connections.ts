/**
 * Registry of active SSE connections.
 * Each connection registers a `close` callback; `closeAll` is called on token
 * rotation and graceful shutdown to terminate all open streams.
 */
export const createStreamConnections = () => {
  const connections = new Map<symbol, () => void>();

  /**
   * Register a close callback for one connection.
   * Returns a deregister function that removes the entry without calling close.
   */
  const add = (close: () => void): (() => void) => {
    const id = Symbol();
    connections.set(id, close);
    return () => connections.delete(id);
  };

  /**
   * Call every registered close callback and clear the registry.
   */
  const closeAll = (): void => {
    for (const close of connections.values()) {
      try {
        close();
      } catch {
        // ignore individual close errors
      }
    }
    connections.clear();
  };

  return { add, closeAll };
};

export type StreamConnections = ReturnType<typeof createStreamConnections>;

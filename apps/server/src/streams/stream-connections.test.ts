import { describe, expect, it, vi } from "vitest";

import { createStreamConnections } from "./stream-connections";

describe("createStreamConnections", () => {
  it("deregisters individual connections and closes the remaining connections only once", () => {
    const connections = createStreamConnections();
    const removed = vi.fn();
    const first = vi.fn();
    const second = vi.fn();
    const deregister = connections.add(removed);
    connections.add(first);
    connections.add(second);

    deregister();
    deregister();
    expect(removed).not.toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();

    connections.closeAll();
    expect(removed).not.toHaveBeenCalled();
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();

    connections.closeAll();
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it("closeAll tolerates errors thrown by a close callback", () => {
    const connections = createStreamConnections();
    const throwing = vi.fn(() => {
      throw new Error("boom");
    });
    const safe = vi.fn();

    connections.add(throwing);
    connections.add(safe);

    expect(() => connections.closeAll()).not.toThrow();
    expect(safe).toHaveBeenCalledOnce();
  });
});

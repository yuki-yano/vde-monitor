import { describe, expect, it, vi } from "vitest";

import { createStreamConnections } from "./stream-connections";

describe("createStreamConnections", () => {
  it("registers a close callback and returns a deregister function", () => {
    const connections = createStreamConnections();
    const close = vi.fn();

    const deregister = connections.add(close);
    expect(typeof deregister).toBe("function");
    expect(close).not.toHaveBeenCalled();

    // deregister removes the entry without calling close
    deregister();
    connections.closeAll();
    expect(close).not.toHaveBeenCalled();
  });

  it("closeAll calls every registered close callback", () => {
    const connections = createStreamConnections();
    const close1 = vi.fn();
    const close2 = vi.fn();
    const close3 = vi.fn();

    connections.add(close1);
    connections.add(close2);
    connections.add(close3);

    connections.closeAll();

    expect(close1).toHaveBeenCalledOnce();
    expect(close2).toHaveBeenCalledOnce();
    expect(close3).toHaveBeenCalledOnce();
  });

  it("closeAll clears the registry so a second call is a no-op", () => {
    const connections = createStreamConnections();
    const close = vi.fn();

    connections.add(close);
    connections.closeAll();
    connections.closeAll();

    expect(close).toHaveBeenCalledOnce();
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

  it("deregister is idempotent", () => {
    const connections = createStreamConnections();
    const close = vi.fn();

    const deregister = connections.add(close);
    deregister();
    deregister(); // second call should not throw

    connections.closeAll();
    expect(close).not.toHaveBeenCalled();
  });
});

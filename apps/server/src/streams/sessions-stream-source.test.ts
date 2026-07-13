import { describe, expect, it, vi } from "vitest";

import { createSessionRegistry } from "../session-registry";
import type { createSessionRegistry as CreateSessionRegistry } from "../session-registry";
import { createSessionsStreamSource } from "./sessions-stream-source";

type Registry = ReturnType<typeof CreateSessionRegistry>;

const makeDetail = (paneId = "pane-1") => ({
  paneId,
  sessionId: "session",
  sessionName: "session",
  windowId: "window-0",
  windowIndex: 0,
  paneIndex: 0,
  paneActive: true,
  currentCommand: null,
  currentPath: "/tmp",
  paneTty: "tty1",
  title: null,
  customTitle: null,
  repoRoot: null,
  agent: "codex" as const,
  state: "RUNNING" as const,
  stateReason: "reason",
  lastMessage: null,
  lastOutputAt: null,
  lastEventAt: null,
  lastInputAt: null,
  paneDead: false,
  alternateOn: false,
  pipeAttached: false,
  pipeConflict: false,
  startCommand: null,
  panePid: null,
  completion: null,
});

const makeRegistry = (): Registry => {
  const registry = createSessionRegistry();
  return registry;
};

describe("createSessionsStreamSource", () => {
  it("snapshot returns current registry state with id=0 when no events have been pushed", () => {
    const registry = makeRegistry();
    registry.update(makeDetail("pane-1"));
    const source = createSessionsStreamSource({ registry });

    const { id, event } = source.snapshot();

    expect(id).toBe(0);
    expect(event.type).toBe("snapshot");
    if (event.type === "snapshot") {
      expect(event.sessions).toHaveLength(1);
      expect(event.sessions[0]?.paneId).toBe("pane-1");
    }

    source.dispose();
  });

  it("snapshot id reflects the last buffered event id", () => {
    const registry = makeRegistry();
    const source = createSessionsStreamSource({ registry });

    // Push 2 events (upsert via registry.update).
    registry.update(makeDetail("pane-1"));
    registry.update(makeDetail("pane-2"));

    const { id } = source.snapshot();
    expect(id).toBe(2);

    source.dispose();
  });

  it("onChanged triggers an upsert event that is pushed to buffer and subscribers", () => {
    const registry = makeRegistry();
    const source = createSessionsStreamSource({ registry });
    const listener = vi.fn();
    source.subscribe(listener);

    registry.update(makeDetail("pane-1"));

    expect(listener).toHaveBeenCalledOnce();
    const entry = listener.mock.calls[0]?.[0];
    expect(entry).toBeDefined();
    expect(entry.id).toBe(1);
    expect(entry.event.type).toBe("upsert");
    if (entry.event.type === "upsert") {
      expect(entry.event.session.paneId).toBe("pane-1");
    }

    source.dispose();
  });

  it("onRemoved triggers a remove event that is pushed to buffer and subscribers", () => {
    const registry = makeRegistry();
    registry.update(makeDetail("pane-1"));
    registry.update(makeDetail("pane-2"));
    const source = createSessionsStreamSource({ registry });
    const listener = vi.fn();
    source.subscribe(listener);

    // Remove pane-2 by making only pane-1 active.
    registry.removeMissing(new Set(["pane-1"]));

    expect(listener).toHaveBeenCalledOnce();
    const entry = listener.mock.calls[0]?.[0];
    expect(entry).toBeDefined();
    expect(entry.event.type).toBe("remove");
    if (entry.event.type === "remove") {
      expect(entry.event.paneId).toBe("pane-2");
    }

    source.dispose();
  });

  it("subscribe returns an unsubscribe function that stops future delivery", () => {
    const registry = makeRegistry();
    const source = createSessionsStreamSource({ registry });
    const listener = vi.fn();

    const unsubscribe = source.subscribe(listener);
    unsubscribe();

    registry.update(makeDetail("pane-1"));

    expect(listener).not.toHaveBeenCalled();

    source.dispose();
  });

  it("replaySince returns all events with id > lastEventId", () => {
    const registry = makeRegistry();
    const source = createSessionsStreamSource({ registry });

    registry.update(makeDetail("pane-1")); // id=1
    registry.update(makeDetail("pane-2")); // id=2
    registry.update(makeDetail("pane-3")); // id=3

    const replay = source.replaySince(1);
    expect(replay).not.toBeNull();
    expect(replay!.map((e) => e.id)).toEqual([2, 3]);

    source.dispose();
  });

  it("replaySince(0) returns all buffered events", () => {
    const registry = makeRegistry();
    const source = createSessionsStreamSource({ registry });

    registry.update(makeDetail("pane-1")); // id=1
    registry.update(makeDetail("pane-2")); // id=2

    const replay = source.replaySince(0);
    expect(replay).not.toBeNull();
    expect(replay!.map((e) => e.id)).toEqual([1, 2]);

    source.dispose();
  });

  it("replaySince returns empty array when no new events since lastEventId", () => {
    const registry = makeRegistry();
    const source = createSessionsStreamSource({ registry });

    registry.update(makeDetail("pane-1")); // id=1

    const replay = source.replaySince(1);
    expect(replay).toEqual([]);

    source.dispose();
  });

  it("replaySince returns null when lastEventId is older than buffer", () => {
    const registry = makeRegistry();
    const source = createSessionsStreamSource({ registry });

    // Push more than RING_BUFFER_LIMIT events by simulating via many updates.
    // We test the logic by checking that when lastEventId is < (oldestId - 1),
    // null is returned. We can fake this by pushing events to exhaust the buffer.
    // For a unit test, simulate it directly: push 2 events then check id=-1.
    registry.update(makeDetail("pane-1")); // id=1
    registry.update(makeDetail("pane-2")); // id=2

    // lastEventId = -1 is before oldest (id=1), and -1 < 1-1 = 0 → should be null.
    const replay = source.replaySince(-1);
    expect(replay).toBeNull();

    source.dispose();
  });

  it("replaySince returns empty array when buffer is empty", () => {
    const registry = makeRegistry();
    const source = createSessionsStreamSource({ registry });

    const replay = source.replaySince(0);
    expect(replay).toEqual([]);

    source.dispose();
  });

  it("monotonically increasing event ids", () => {
    const registry = makeRegistry();
    const source = createSessionsStreamSource({ registry });
    const entries: number[] = [];
    source.subscribe((entry) => entries.push(entry.id));

    registry.update(makeDetail("pane-1"));
    registry.update(makeDetail("pane-1")); // no change → no event
    registry.removeMissing(new Set());

    // pane-1 was upserted (id=1) and removed (id=2).
    // Second update with same data produces no event (registry dedup).
    expect(entries).toEqual([1, 2]);

    source.dispose();
  });

  it("dispose unsubscribes from registry listeners and clears subscribers", () => {
    const registry = makeRegistry();
    const source = createSessionsStreamSource({ registry });
    const listener = vi.fn();
    source.subscribe(listener);

    source.dispose();

    // Events after dispose should not reach subscriber.
    registry.update(makeDetail("pane-1"));
    expect(listener).not.toHaveBeenCalled();
  });
});

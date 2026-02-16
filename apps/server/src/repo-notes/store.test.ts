import { describe, expect, it } from "vitest";

import { createRepoNotesStore } from "./store";

const createSequentialNow = (timestamps: string[]) => {
  let index = 0;
  const fallback = timestamps[timestamps.length - 1] ?? new Date(0).toISOString();
  return () => {
    const timestamp = timestamps[index] ?? fallback;
    index += 1;
    return timestamp;
  };
};

describe("repo-notes store", () => {
  it("creates notes and returns them in updatedAt-desc order", () => {
    const store = createRepoNotesStore({
      now: createSequentialNow(["2026-02-10T00:00:00.000Z", "2026-02-10T00:00:01.000Z"]),
      createId: (() => {
        let sequence = 0;
        return () => `note-${++sequence}`;
      })(),
    });

    const first = store.create("/repo/a", { title: " First ", body: "body-1" });
    const second = store.create("/repo/a", { title: null, body: "body-2" });

    expect(first.title).toBe("First");
    expect(second.title).toBeNull();
    expect(store.list("/repo/a").map((item) => item.id)).toEqual(["note-2", "note-1"]);
  });

  it("updates a note and keeps list ordering", () => {
    const store = createRepoNotesStore({
      now: createSequentialNow([
        "2026-02-10T00:00:00.000Z",
        "2026-02-10T00:00:01.000Z",
        "2026-02-10T00:00:02.000Z",
      ]),
      createId: (() => {
        let sequence = 0;
        return () => `note-${++sequence}`;
      })(),
    });

    const first = store.create("/repo/a", { title: "one", body: "body-1" });
    const second = store.create("/repo/a", { title: "two", body: "body-2" });
    const updated = store.update("/repo/a", first.id, { title: "  ", body: "body-1-updated" });

    expect(updated).toMatchObject({
      id: first.id,
      body: "body-1-updated",
      title: null,
      updatedAt: "2026-02-10T00:00:02.000Z",
    });
    expect(store.list("/repo/a").map((item) => item.id)).toEqual([first.id, second.id]);
  });

  it("removes notes per repository and returns false when target does not exist", () => {
    const store = createRepoNotesStore({
      now: () => "2026-02-10T00:00:00.000Z",
      createId: (() => {
        let sequence = 0;
        return () => `note-${++sequence}`;
      })(),
    });

    const note = store.create("/repo/a", { title: "note", body: "body" });

    expect(store.remove("/repo/a", "missing")).toBe(false);
    expect(store.remove("/repo/a", note.id)).toBe(true);
    expect(store.list("/repo/a")).toEqual([]);
  });

  it("serializes and restores persisted notes while filtering invalid entries", () => {
    const store = createRepoNotesStore();
    store.restore({
      "/repo/a": [
        {
          id: "note-1",
          repoRoot: "/repo/a",
          title: "valid",
          body: "body",
          createdAt: "2026-02-10T00:00:00.000Z",
          updatedAt: "2026-02-10T00:00:00.000Z",
        },
        {
          id: "invalid",
          repoRoot: "/repo/a",
          title: "invalid",
          body: 1 as unknown as string,
          createdAt: "2026-02-10T00:00:00.000Z",
          updatedAt: "2026-02-10T00:00:00.000Z",
        },
      ],
      "/repo/b": [],
    });

    const serialized = store.serialize();

    expect(Object.keys(serialized)).toEqual(["/repo/a"]);
    expect(serialized["/repo/a"]).toHaveLength(1);
    expect(serialized["/repo/a"]?.[0]?.id).toBe("note-1");
  });
});

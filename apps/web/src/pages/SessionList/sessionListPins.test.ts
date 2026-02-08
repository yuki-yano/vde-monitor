// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import type { SessionListPins } from "./sessionListPins";
import {
  createRepoPinKey,
  readStoredSessionListPins,
  storeSessionListPins,
  touchSessionListPin,
} from "./sessionListPins";

const STORAGE_KEY = "vde-monitor-session-list-pins";

describe("sessionListPins", () => {
  it("returns defaults when storage is empty or invalid", () => {
    window.localStorage.removeItem(STORAGE_KEY);
    expect(readStoredSessionListPins()).toEqual({
      repos: {},
    } satisfies SessionListPins);

    window.localStorage.setItem(STORAGE_KEY, "invalid-json");
    expect(readStoredSessionListPins()).toEqual({
      repos: {},
    } satisfies SessionListPins);
  });

  it("stores and restores pin values", () => {
    const pins: SessionListPins = {
      repos: { "repo:/Users/test/repo": 1234 },
    };
    storeSessionListPins(pins);

    expect(readStoredSessionListPins()).toEqual(pins);
  });

  it("touches pin updatedAt and does not toggle", () => {
    const next = touchSessionListPin(
      {
        repos: {},
      },
      "repos",
      "repo:/Users/test/repo",
      1000,
    );
    expect(next.repos).toEqual({ "repo:/Users/test/repo": 1000 });

    const updated = touchSessionListPin(next, "repos", "repo:/Users/test/repo", 2000);
    expect(updated.repos).toEqual({ "repo:/Users/test/repo": 2000 });
  });

  it("creates stable keys and migrates legacy array format", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        repos: ["repo:/Users/test/repo"],
      }),
    );

    expect(readStoredSessionListPins()).toEqual({
      repos: { "repo:/Users/test/repo": 1 },
    } satisfies SessionListPins);

    expect(createRepoPinKey("/Users/test/repo")).toBe("repo:/Users/test/repo");
    expect(createRepoPinKey(null)).toBe("repo:__NO_REPO__");
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateVAPIDKeys: vi.fn(() => ({
    publicKey: "public-key",
    privateKey: "private-key",
  })),
}));

vi.mock("web-push", () => ({
  default: {
    generateVAPIDKeys: mocks.generateVAPIDKeys,
  },
}));

import { createVapidStore } from "./vapid-store";

const tempDirs: string[] = [];

const createTempPath = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vde-monitor-vapid-"));
  tempDirs.push(dir);
  return path.join(dir, "push-vapid.json");
};

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
  mocks.generateVAPIDKeys.mockClear();
});

describe("createVapidStore", () => {
  it("generates and persists keys when file does not exist", () => {
    const filePath = createTempPath();
    const store = createVapidStore({
      filePath,
      now: () => "2026-02-20T00:00:00.000Z",
      resolveSubject: () => "mailto:test@example.com",
    });

    const keys = store.ensureKeys();

    expect(mocks.generateVAPIDKeys).toHaveBeenCalledTimes(1);
    expect(keys).toEqual({
      publicKey: "public-key",
      privateKey: "private-key",
      subject: "mailto:test@example.com",
    });
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as { subject: string; publicKey: string };
    expect(parsed.subject).toBe("mailto:test@example.com");
    expect(parsed.publicKey).toBe("public-key");
  });

  it("reuses existing keys without regeneration", () => {
    const filePath = createTempPath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      `${JSON.stringify(
        {
          version: 1,
          publicKey: "existing-public",
          privateKey: "existing-private",
          subject: "mailto:existing@example.com",
          createdAt: "2026-02-20T00:00:00.000Z",
          updatedAt: "2026-02-20T00:00:00.000Z",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const store = createVapidStore({ filePath });
    const keys = store.ensureKeys();

    expect(mocks.generateVAPIDKeys).not.toHaveBeenCalled();
    expect(keys.publicKey).toBe("existing-public");
    expect(keys.privateKey).toBe("existing-private");
    expect(keys.subject).toBe("mailto:existing@example.com");
  });

  it("migrates legacy localhost subject to default subject", () => {
    const filePath = createTempPath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      `${JSON.stringify(
        {
          version: 1,
          publicKey: "existing-public",
          privateKey: "existing-private",
          subject: "mailto:vde-monitor@localhost.localdomain",
          createdAt: "2026-02-20T00:00:00.000Z",
          updatedAt: "2026-02-20T00:00:00.000Z",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const store = createVapidStore({ filePath });
    const keys = store.ensureKeys();

    expect(mocks.generateVAPIDKeys).not.toHaveBeenCalled();
    expect(keys.publicKey).toBe("existing-public");
    expect(keys.privateKey).toBe("existing-private");
    expect(keys.subject).toBe("mailto:vde-monitor@example.com");
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as { subject: string; createdAt: string };
    expect(parsed.subject).toBe("mailto:vde-monitor@example.com");
    expect(parsed.createdAt).toBe("2026-02-20T00:00:00.000Z");
  });
});

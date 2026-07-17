import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  homedir: vi.fn<() => string>(),
}));

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    default: { ...actual, homedir: mocks.homedir },
    homedir: mocks.homedir,
  };
});

import { ensureToken, generateToken, saveToken } from "./token-store";

let homeDir: string;

const tokenPath = () => path.join(homeDir, ".vde-monitor", "token.json");

beforeEach(() => {
  homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "vde-monitor-token-test-"));
  mocks.homedir.mockReturnValue(homeDir);
});

afterEach(() => {
  fs.rmSync(homeDir, { recursive: true, force: true });
});

describe("generateToken", () => {
  it("returns a 64-character hex token", () => {
    const token = generateToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(generateToken()).not.toBe(token);
  });
});

describe("ensureToken", () => {
  it("creates and persists a new token when no file exists", () => {
    const token = ensureToken();

    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const persisted = JSON.parse(fs.readFileSync(tokenPath(), "utf8")) as { token: string };
    expect(persisted.token).toBe(token);
  });

  it("returns the persisted token on subsequent calls", () => {
    const first = ensureToken();
    const second = ensureToken();

    expect(second).toBe(first);
  });

  it("regenerates the token when the file contains invalid JSON", () => {
    fs.mkdirSync(path.dirname(tokenPath()), { recursive: true });
    fs.writeFileSync(tokenPath(), "{not json");

    const token = ensureToken();

    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const persisted = JSON.parse(fs.readFileSync(tokenPath(), "utf8")) as { token: string };
    expect(persisted.token).toBe(token);
  });

  it("regenerates the token when the persisted token is empty or blank", () => {
    fs.mkdirSync(path.dirname(tokenPath()), { recursive: true });
    fs.writeFileSync(tokenPath(), `${JSON.stringify({ token: "   " })}\n`);

    const token = ensureToken();

    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(token.trim()).toBe(token);
  });

  it("regenerates the token when the token field has a wrong type", () => {
    fs.mkdirSync(path.dirname(tokenPath()), { recursive: true });
    fs.writeFileSync(tokenPath(), `${JSON.stringify({ token: 123 })}\n`);

    const token = ensureToken();

    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("saveToken", () => {
  it("round-trips a saved token through ensureToken", () => {
    saveToken("manual-token");

    expect(ensureToken()).toBe("manual-token");
  });
});

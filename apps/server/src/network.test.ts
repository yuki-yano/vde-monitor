import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execaSync: vi.fn(),
  networkInterfaces: vi.fn(),
}));

vi.mock("execa", () => ({
  execaSync: mocks.execaSync,
}));

vi.mock("node:os", () => ({
  default: { networkInterfaces: mocks.networkInterfaces },
  networkInterfaces: mocks.networkInterfaces,
}));

import { getLocalIP, getTailscaleIP, isTailscaleIP } from "./network";

type InterfaceInfo = {
  address: string;
  family: string;
  internal: boolean;
};

const iface = (address: string, options?: Partial<InterfaceInfo>): InterfaceInfo => ({
  address,
  family: options?.family ?? "IPv4",
  internal: options?.internal ?? false,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.networkInterfaces.mockReturnValue({});
});

describe("isTailscaleIP", () => {
  it("returns true for the tailscale CGNAT range", () => {
    expect(isTailscaleIP("100.64.0.1")).toBe(true);
    expect(isTailscaleIP("100.127.255.255")).toBe(true);
  });

  it("returns false outside tailscale range or for invalid IPv4", () => {
    expect(isTailscaleIP("100.63.0.1")).toBe(false);
    expect(isTailscaleIP("100.128.0.1")).toBe(false);
    expect(isTailscaleIP("192.168.0.1")).toBe(false);
    expect(isTailscaleIP("not-an-ip")).toBe(false);
  });
});

describe("getTailscaleIP", () => {
  it("prefers CLI result when valid tailscale address is returned", () => {
    mocks.execaSync.mockReturnValueOnce({
      exitCode: 0,
      stdout: "100.88.1.2\n",
    });

    const ip = getTailscaleIP();

    expect(ip).toBe("100.88.1.2");
    expect(mocks.execaSync).toHaveBeenCalledTimes(1);
    expect(mocks.execaSync).toHaveBeenCalledWith(
      "tailscale",
      ["ip", "-4"],
      expect.objectContaining({ timeout: 2000, reject: false }),
    );
  });

  it("falls back to network interfaces when CLI output is not usable", () => {
    mocks.execaSync
      .mockReturnValueOnce({ exitCode: 0, stdout: "192.168.0.10\n" })
      .mockReturnValueOnce({ exitCode: 1, stdout: "" });
    mocks.networkInterfaces.mockReturnValue({
      utun9: [iface("100.101.102.103")],
      en0: [iface("192.168.1.5")],
    });

    const ip = getTailscaleIP();

    expect(ip).toBe("100.101.102.103");
    expect(mocks.execaSync).toHaveBeenCalledTimes(2);
  });

  it("tries alternate CLI binary when primary tailscale command throws", () => {
    mocks.execaSync
      .mockImplementationOnce(() => {
        throw new Error("missing command");
      })
      .mockReturnValueOnce({ exitCode: 0, stdout: "100.70.1.9\n" });

    const ip = getTailscaleIP();

    expect(ip).toBe("100.70.1.9");
    expect(mocks.execaSync).toHaveBeenNthCalledWith(
      2,
      "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
      ["ip", "-4"],
      expect.objectContaining({ timeout: 2000, reject: false }),
    );
  });
});

describe("getLocalIP", () => {
  it("prefers private IPv4 over public candidates", () => {
    mocks.networkInterfaces.mockReturnValue({
      en0: [iface("8.8.8.8"), iface("192.168.1.23"), iface("100.99.10.10")],
      lo0: [iface("127.0.0.1", { internal: true })],
    });

    expect(getLocalIP()).toBe("192.168.1.23");
  });

  it("uses first non-private IPv4 when private address is unavailable", () => {
    mocks.networkInterfaces.mockReturnValue({
      en0: [iface("8.8.8.8"), iface("100.101.1.1")],
      en1: [iface("1.1.1.1")],
    });

    expect(getLocalIP()).toBe("8.8.8.8");
  });

  it("returns localhost when no usable IPv4 address exists", () => {
    mocks.networkInterfaces.mockReturnValue({
      lo0: [iface("127.0.0.1", { internal: true })],
      utun9: [iface("100.80.1.1")],
      en0: [iface("fe80::1", { family: "IPv6" })],
    });

    expect(getLocalIP()).toBe("localhost");
  });
});

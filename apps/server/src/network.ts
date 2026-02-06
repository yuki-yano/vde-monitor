import { networkInterfaces } from "node:os";

import { execaSync } from "execa";

const isValidOctets = (parts: number[]) => {
  return parts.every((value) => !Number.isNaN(value) && value >= 0 && value <= 255);
};

type IPv4Octets = [number, number, number, number];

const parseIPv4Octets = (address: string): IPv4Octets | null => {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || !isValidOctets(parts)) {
    return null;
  }
  return parts as IPv4Octets;
};

const isPrivateIP = (address: string) => {
  const octets = parseIPv4Octets(address);
  if (!octets) {
    return false;
  }
  const [first, second] = octets;
  if (first === 10) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  return first === 192 && second === 168;
};

export const isTailscaleIP = (address: string) => {
  const octets = parseIPv4Octets(address);
  if (!octets) {
    return false;
  }
  const [first, second] = octets;
  return first === 100 && second >= 64 && second <= 127;
};

const getTailscaleFromCLI = () => {
  const candidates = ["tailscale", "/Applications/Tailscale.app/Contents/MacOS/Tailscale"];
  for (const bin of candidates) {
    try {
      const result = execaSync(bin, ["ip", "-4"], {
        encoding: "utf8",
        timeout: 2000,
        stdio: ["pipe", "pipe", "ignore"],
        reject: false,
      });
      if (result.exitCode !== 0) {
        continue;
      }
      const ip = result.stdout.trim();
      if (ip && isTailscaleIP(ip)) {
        return ip;
      }
    } catch {
      // ignore
    }
  }
  return null;
};

const getTailscaleFromInterfaces = () => {
  const interfaces = networkInterfaces();
  const addresses = Object.values(interfaces)
    .flat()
    .filter((info): info is NonNullable<typeof info> => Boolean(info));
  const match = addresses.find((info) => info.family === "IPv4" && isTailscaleIP(info.address));
  return match?.address ?? null;
};

export const getTailscaleIP = () => {
  return getTailscaleFromCLI() ?? getTailscaleFromInterfaces();
};

export const getLocalIP = () => {
  const interfaces = networkInterfaces();
  const addresses = Object.values(interfaces)
    .flat()
    .filter((info): info is NonNullable<typeof info> => Boolean(info));
  const candidates = addresses.filter(
    (info) => info.family === "IPv4" && !info.internal && !isTailscaleIP(info.address),
  );
  const privateMatch = candidates.find((info) => isPrivateIP(info.address));
  if (privateMatch) {
    return privateMatch.address;
  }
  return candidates[0]?.address ?? "localhost";
};

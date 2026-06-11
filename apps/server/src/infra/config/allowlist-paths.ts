import { isPlainObject } from "./config-io";

export type AllowlistNode = true | { [key: string]: AllowlistNode };

export const collectAllowlistLeafPaths = (
  allowlist: AllowlistNode,
  prefix: string[] = [],
): string[] => {
  if (allowlist === true) {
    return [prefix.join(".")];
  }
  return Object.entries(allowlist).flatMap(([key, nestedAllowlist]) =>
    collectAllowlistLeafPaths(nestedAllowlist, [...prefix, key]),
  );
};

export const collectMissingAllowlistLeafPaths = (
  source: unknown,
  allowlist: AllowlistNode,
  prefix: string[] = [],
): string[] => {
  if (allowlist === true) {
    return [];
  }
  if (!isPlainObject(source)) {
    return collectAllowlistLeafPaths(allowlist, prefix);
  }
  const missingPaths: string[] = [];
  for (const [key, nestedAllowlist] of Object.entries(allowlist)) {
    const nextPrefix = [...prefix, key];
    if (!Object.hasOwn(source, key)) {
      missingPaths.push(...collectAllowlistLeafPaths(nestedAllowlist, nextPrefix));
      continue;
    }
    if (nestedAllowlist === true) {
      continue;
    }
    missingPaths.push(
      ...collectMissingAllowlistLeafPaths(source[key], nestedAllowlist, nextPrefix),
    );
  }
  return missingPaths;
};

export const collectExtraAllowlistLeafPaths = (
  source: unknown,
  allowlist: AllowlistNode,
  prefix: string[] = [],
): string[] => {
  if (!isPlainObject(source) || allowlist === true) {
    return [];
  }
  const extras: string[] = [];
  for (const [key, nestedValue] of Object.entries(source)) {
    const nextAllowlist = allowlist[key];
    const nextPrefix = [...prefix, key];
    if (nextAllowlist == null) {
      extras.push(nextPrefix.join("."));
      continue;
    }
    if (nextAllowlist === true) {
      continue;
    }
    extras.push(...collectExtraAllowlistLeafPaths(nestedValue, nextAllowlist, nextPrefix));
  }
  return extras;
};

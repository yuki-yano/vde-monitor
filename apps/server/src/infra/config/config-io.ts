import fs from "node:fs";

export const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value == null || typeof value !== "object") {
    return false;
  }
  return Object.getPrototypeOf(value) === Object.prototype;
};

export const deepMerge = (baseValue: unknown, overrideValue: unknown): unknown => {
  if (typeof overrideValue === "undefined") {
    return baseValue;
  }
  if (Array.isArray(overrideValue)) {
    return [...overrideValue];
  }
  if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
    const merged: Record<string, unknown> = { ...baseValue };
    Object.keys(overrideValue).forEach((key) => {
      merged[key] = deepMerge(baseValue[key], overrideValue[key]);
    });
    return merged;
  }
  if (isPlainObject(overrideValue)) {
    const merged: Record<string, unknown> = {};
    Object.keys(overrideValue).forEach((key) => {
      merged[key] = deepMerge(undefined, overrideValue[key]);
    });
    return merged;
  }
  return overrideValue;
};

export const ensureDir = (dir: string) => {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
};

const resolveAtomicTempPath = (filePath: string) => {
  const randomToken = Math.random().toString(36).slice(2, 10);
  return `${filePath}.tmp-${process.pid}-${Date.now()}-${randomToken}`;
};

export const writeFileAtomic = (filePath: string, data: string) => {
  const tempPath = resolveAtomicTempPath(filePath);
  try {
    fs.writeFileSync(tempPath, data, { encoding: "utf8", mode: 0o600 });
    try {
      fs.chmodSync(tempPath, 0o600);
    } catch {
      // ignore
    }
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // ignore cleanup errors
    }
    throw error;
  }
};

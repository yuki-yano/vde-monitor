import type { RepoNote } from "./types";

export const dedupeStrings = <T extends string>(values: T[]) => {
  const seen = new Set<string>();
  const output: T[] = [];
  values.forEach((value) => {
    if (!seen.has(value)) {
      seen.add(value);
      output.push(value);
    }
  });
  return output;
};

export const isObject = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object";

export const sortNotesDesc = (notes: RepoNote[]) =>
  [...notes].sort((a, b) => {
    const updatedAtDiff = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    if (updatedAtDiff !== 0) {
      return updatedAtDiff;
    }
    if (a.updatedAt !== b.updatedAt) {
      return b.updatedAt.localeCompare(a.updatedAt);
    }
    return b.id.localeCompare(a.id);
  });

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

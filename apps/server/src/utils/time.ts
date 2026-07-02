export const nowIso = () => new Date().toISOString();

export const parseIsoToMs = (value: unknown): number | null => {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

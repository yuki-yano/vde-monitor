export const toNullableBoolean = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

export const toNullableString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

export const toNullableNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

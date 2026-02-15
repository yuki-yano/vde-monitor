export type SessionListPinScope = "repos";

export type SessionListPinValues = Record<string, number>;

export type SessionListPins = Record<SessionListPinScope, SessionListPinValues>;

const SESSION_LIST_PINS_STORAGE_KEY = "vde-monitor-session-list-pins";

const EMPTY_PINS: SessionListPins = {
  repos: {},
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const normalizePinValues = (value: unknown): SessionListPinValues => {
  if (value == null || typeof value !== "object") {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<SessionListPinValues>(
    (acc, [key, rawUpdatedAt]) => {
      if (key.length === 0) {
        return acc;
      }
      if (!isFiniteNumber(rawUpdatedAt) || rawUpdatedAt <= 0) {
        return acc;
      }
      acc[key] = Math.floor(rawUpdatedAt);
      return acc;
    },
    {},
  );
};

const normalizePins = (value: unknown): SessionListPins => {
  if (value == null || typeof value !== "object") {
    return { ...EMPTY_PINS };
  }
  const raw = value as Record<string, unknown>;
  return {
    repos: normalizePinValues(raw.repos),
  };
};

export const createRepoPinKey = (repoRoot: string | null) => `repo:${repoRoot ?? "__NO_REPO__"}`;

export const readStoredSessionListPins = (): SessionListPins => {
  if (typeof window === "undefined") {
    return EMPTY_PINS;
  }
  const stored = window.localStorage.getItem(SESSION_LIST_PINS_STORAGE_KEY);
  if (!stored) {
    return EMPTY_PINS;
  }
  try {
    const parsed = JSON.parse(stored) as unknown;
    return normalizePins(parsed);
  } catch {
    return EMPTY_PINS;
  }
};

export const storeSessionListPins = (pins: SessionListPins) => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(SESSION_LIST_PINS_STORAGE_KEY, JSON.stringify(normalizePins(pins)));
};

export const touchSessionListPin = (
  pins: SessionListPins,
  scope: SessionListPinScope,
  key: string,
  updatedAt = Date.now(),
): SessionListPins => {
  if (key.length === 0) {
    return pins;
  }
  const safeUpdatedAt =
    isFiniteNumber(updatedAt) && updatedAt > 0 ? Math.floor(updatedAt) : Date.now();
  return {
    ...pins,
    [scope]: {
      ...pins[scope],
      [key]: safeUpdatedAt,
    },
  };
};

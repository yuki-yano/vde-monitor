const MIN_SHARED_PREFIX_TO_TRIM = 4;
const GROUP_LABEL_MAX_LENGTH = 4;
const LEADING_SEPARATOR_PATTERN = /^[\s\-_/.:]+/u;

export const normalizeSessionGroupName = (sessionName: string | null | undefined): string => {
  const normalized = sessionName?.trim();
  if (normalized == null || normalized.length === 0) {
    return "inactive";
  }
  return normalized;
};

const resolveSharedPrefixLength = (left: string, right: string): number => {
  const maxLength = Math.min(left.length, right.length);
  let index = 0;
  while (index < maxLength && left.charCodeAt(index) === right.charCodeAt(index)) {
    index += 1;
  }
  return index;
};

const resolveTrimmedLabelSource = (name: string, sharedPrefixLength: number): string => {
  if (sharedPrefixLength < MIN_SHARED_PREFIX_TO_TRIM) {
    return name;
  }
  const trimmed = name.slice(sharedPrefixLength).replace(LEADING_SEPARATOR_PATTERN, "");
  if (trimmed.length > 0) {
    return trimmed;
  }
  return name;
};

export const buildSessionGroupLabelByName = (sessionNames: string[]): Map<string, string> => {
  const uniqueNames = [...new Set(sessionNames.map((name) => normalizeSessionGroupName(name)))];
  const maxSharedPrefixLengthByName = new Map(uniqueNames.map((name) => [name, 0]));

  for (let i = 0; i < uniqueNames.length; i += 1) {
    for (let j = i + 1; j < uniqueNames.length; j += 1) {
      const left = uniqueNames[i];
      const right = uniqueNames[j];
      if (left == null || right == null) {
        continue;
      }
      const sharedPrefixLength = resolveSharedPrefixLength(left, right);
      if (sharedPrefixLength < MIN_SHARED_PREFIX_TO_TRIM) {
        continue;
      }
      maxSharedPrefixLengthByName.set(
        left,
        Math.max(maxSharedPrefixLengthByName.get(left) ?? 0, sharedPrefixLength),
      );
      maxSharedPrefixLengthByName.set(
        right,
        Math.max(maxSharedPrefixLengthByName.get(right) ?? 0, sharedPrefixLength),
      );
    }
  }

  return new Map(
    uniqueNames.map((name) => {
      const trimmedSource = resolveTrimmedLabelSource(
        name,
        maxSharedPrefixLengthByName.get(name) ?? 0,
      );
      const label = trimmedSource.slice(0, GROUP_LABEL_MAX_LENGTH).toUpperCase();
      return [name, label.length > 0 ? label : "SESS"] as const;
    }),
  );
};

type SessionGroupLabelEntry = {
  key: string;
  name: string | null | undefined;
};

const compareStableKeys = (left: string, right: string): number => {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};

export const buildSessionGroupLabelByKey = (
  entries: SessionGroupLabelEntry[],
): Map<string, string> => {
  const nameByKey = new Map<string, string>();
  for (const entry of entries) {
    if (!nameByKey.has(entry.key)) {
      nameByKey.set(entry.key, normalizeSessionGroupName(entry.name));
    }
  }

  const labelByName = buildSessionGroupLabelByName([...nameByKey.values()]);
  const keysByName = new Map<string, string[]>();
  for (const [key, name] of nameByKey) {
    const keys = keysByName.get(name);
    if (keys == null) {
      keysByName.set(name, [key]);
    } else {
      keys.push(key);
    }
  }

  const labelByKey = new Map<string, string>();
  for (const [name, keys] of keysByName) {
    const baseLabel = labelByName.get(name) ?? name.slice(0, GROUP_LABEL_MAX_LENGTH).toUpperCase();
    const sortedKeys = [...keys].sort(compareStableKeys);
    sortedKeys.forEach((key, index) => {
      labelByKey.set(key, sortedKeys.length === 1 ? baseLabel : `${baseLabel}·${index + 1}`);
    });
  }
  return labelByKey;
};

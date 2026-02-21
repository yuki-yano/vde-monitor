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

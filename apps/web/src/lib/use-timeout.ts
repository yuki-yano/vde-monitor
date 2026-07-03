import { useCallback, useEffect, useMemo, useRef } from "react";

/**
 * Manages a single delayed callback. `set` replaces any pending timer with a
 * new one; `cancel` discards a pending timer. Unmount clears it automatically.
 */
export const useTimeout = () => {
  const timerRef = useRef<number | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const set = useCallback(
    (callback: () => void, delayMs: number) => {
      cancel();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        callback();
      }, delayMs);
    },
    [cancel],
  );

  useEffect(() => cancel, [cancel]);

  return useMemo(() => ({ set, cancel }), [set, cancel]);
};

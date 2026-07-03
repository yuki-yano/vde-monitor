import { useCallback, useEffect, useMemo, useRef } from "react";

/**
 * Manages a single delayed callback with imperative `set`/`cancel` control.
 *
 * - `set` clears any pending timer and schedules a new one.
 * - `cancel` clears a pending timer without running the callback.
 * - The pending timer is cleared automatically on unmount.
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

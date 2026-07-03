import { useCallback, useEffect, useMemo, useRef } from "react";

type DebouncedFunction<A extends unknown[]> = ((...args: A) => void) & {
  cancel: () => void;
};

/**
 * Wraps `callback` so repeated invocations collapse into a single call after
 * `delayMs` of inactivity. Each call resets the pending timer; the latest
 * arguments win.
 *
 * The returned function exposes `.cancel()` to discard a pending call (e.g.
 * when the triggering condition changes before the delay elapses). The
 * pending call is also cleared automatically on unmount.
 */
export const useDebouncedCallback = <A extends unknown[]>(
  callback: (...args: A) => void,
  delayMs: number,
): DebouncedFunction<A> => {
  const timerRef = useRef<number | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const cancel = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => cancel, [cancel]);

  const run = useCallback(
    (...args: A) => {
      cancel();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        callbackRef.current(...args);
      }, delayMs);
    },
    [cancel, delayMs],
  );

  return useMemo(() => Object.assign(run, { cancel }), [run, cancel]);
};

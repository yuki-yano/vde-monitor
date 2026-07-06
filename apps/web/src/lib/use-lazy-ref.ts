import { type MutableRefObject, useRef } from "react";

export const useLazyRef = <T>(factory: () => T): MutableRefObject<T> => {
  const ref = useRef<T | null>(null);
  const initializedRef = useRef(false);
  if (!initializedRef.current) {
    ref.current = factory();
    initializedRef.current = true;
  }
  return ref as MutableRefObject<T>;
};

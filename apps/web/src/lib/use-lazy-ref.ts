import { type MutableRefObject, useRef } from "react";

export const useLazyRef = <T>(factory: () => T): MutableRefObject<T> => {
  const ref = useRef<T | null>(null);
  if (ref.current == null) {
    ref.current = factory();
  }
  return ref as MutableRefObject<T>;
};

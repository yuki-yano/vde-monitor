import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef } from "react";

type PointerDragOptions<T> = {
  cursor?: string;
  onMove: (event: PointerEvent, context: T) => void;
  onEnd?: (context: T) => void;
};

export const usePointerDrag = <T>({ cursor, onMove, onEnd }: PointerDragOptions<T>) => {
  const dragContextRef = useRef<T | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handlePointerMove = (event: PointerEvent) => {
      if (!dragContextRef.current) return;
      onMove(event, dragContextRef.current);
    };

    const stopDrag = () => {
      if (!dragContextRef.current) return;
      const context = dragContextRef.current;
      dragContextRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      onEnd?.(context);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
      stopDrag();
    };
  }, [onEnd, onMove]);

  const startDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>, context: T) => {
      dragContextRef.current = context;
      document.body.style.userSelect = "none";
      document.body.style.cursor = cursor ?? "col-resize";
    },
    [cursor],
  );

  return { startDrag };
};

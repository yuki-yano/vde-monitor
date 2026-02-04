import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef } from "react";

type PointerDragOptions<T> = {
  cursor?: string;
  onMove: (event: PointerEvent, context: T) => void;
  onEnd?: (context: T) => void;
};

export const usePointerDrag = <T>({ cursor, onMove, onEnd }: PointerDragOptions<T>) => {
  const dragContextRef = useRef<T | null>(null);
  const onMoveRef = useRef(onMove);
  const onEndRef = useRef(onEnd);
  const cursorRef = useRef(cursor);

  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

  useEffect(() => {
    onEndRef.current = onEnd;
  }, [onEnd]);

  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handlePointerMove = (event: PointerEvent) => {
      if (!dragContextRef.current) return;
      onMoveRef.current(event, dragContextRef.current);
    };

    const stopDrag = () => {
      if (!dragContextRef.current) return;
      const context = dragContextRef.current;
      dragContextRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      onEndRef.current?.(context);
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
  }, []);

  const startDrag = useCallback((_event: ReactPointerEvent<HTMLElement>, context: T) => {
    dragContextRef.current = context;
    document.body.style.userSelect = "none";
    document.body.style.cursor = cursorRef.current ?? "col-resize";
  }, []);

  return { startDrag };
};

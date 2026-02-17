import { useLocalStorage } from "@mantine/hooks";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useRef } from "react";

import { usePointerDrag } from "./use-pointer-drag";

type SplitRatioOptions = {
  storageKey: string;
  defaultRatio?: number;
  minRatio?: number;
  maxRatio?: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const useSplitRatio = ({
  storageKey,
  defaultRatio = 0.56,
  minRatio = 0.4,
  maxRatio = 0.7,
}: SplitRatioOptions) => {
  const [ratio, setRatio] = useLocalStorage<number>({
    key: storageKey,
    defaultValue: defaultRatio,
    getInitialValueInEffect: false,
    deserialize: (value) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        return defaultRatio;
      }
      return clamp(parsed, minRatio, maxRatio);
    },
    serialize: (value) => String(clamp(value, minRatio, maxRatio)),
  });
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { startDrag } = usePointerDrag<{ startX: number; startRatio: number; width: number }>({
    onMove: (event, context) => {
      const { startX, startRatio, width } = context;
      if (width <= 0) return;
      const delta = event.clientX - startX;
      const next = clamp((startRatio * width + delta) / width, minRatio, maxRatio);
      setRatio(next);
    },
  });

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container) return;
      if (event.button !== 0 && event.pointerType !== "touch") return;
      const rect = container.getBoundingClientRect();
      startDrag(event, { startX: event.clientX, startRatio: ratio, width: rect.width });
    },
    [ratio, startDrag],
  );

  return {
    ratio,
    containerRef,
    handlePointerDown,
  };
};

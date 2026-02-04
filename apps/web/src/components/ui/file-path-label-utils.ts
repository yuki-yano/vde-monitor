import type { RefObject } from "react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

export const normalizePath = (value: string) => value.replace(/\\/g, "/");

export const buildFullDir = (value: string) => {
  const normalized = normalizePath(value);
  const segments = normalized.split("/").filter(Boolean);
  segments.pop();
  return segments.join("/");
};

export const buildPathInfo = (value: string, tailSegments: number) => {
  const normalized = normalizePath(value);
  const segments = normalized.split("/").filter(Boolean);
  const base = segments.pop() ?? normalized;
  if (segments.length === 0) {
    return { base, hint: "" };
  }
  const tail = segments.slice(-tailSegments).join("/");
  const prefix = segments.length > tailSegments ? ".../" : "";
  return { base, hint: `${prefix}${tail}` };
};

const buildSegmentedLabel = (segments: string[], count: number) => {
  if (segments.length === 0) return "";
  const body = segments.slice(-count).join("/");
  if (!body) return "";
  return count < segments.length ? `.../${body}` : body;
};

export const useOverflowTruncate = (text: string) => {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [truncate, setTruncate] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!text) {
      setTruncate(false);
      return;
    }
    const measure = () => {
      const isOverflow = el.scrollWidth > el.clientWidth;
      setTruncate(isOverflow);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);

  return { ref, truncate };
};

export const useSegmentTruncate = ({
  text,
  segments,
  reservePx,
  containerRef,
  fallbackRef,
}: {
  text: string;
  segments: string[];
  reservePx: number;
  containerRef: RefObject<HTMLElement | null>;
  fallbackRef?: RefObject<HTMLElement | null>;
}) => {
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const [label, setLabel] = useState(text);
  const segmentsKey = useMemo(() => segments.join("/"), [segments]);
  const retryRef = useRef(0);

  useLayoutEffect(() => {
    const primary = containerRef.current;
    const fallback = fallbackRef?.current;
    const container = primary ?? fallback;
    const measureEl = measureRef.current;
    if (!container || !measureEl) return;

    let rafId: number | null = null;
    let timeoutId: number | null = null;
    const update = () => {
      if (!text || segments.length === 0) {
        setLabel("");
        return;
      }
      const primaryWidth = primary?.getBoundingClientRect().width || primary?.clientWidth || 0;
      const fallbackWidth = fallback?.getBoundingClientRect().width || fallback?.clientWidth || 0;
      const containerWidth = Math.max(primaryWidth, fallbackWidth);
      if (!containerWidth) {
        if (retryRef.current < 5) {
          retryRef.current += 1;
          timeoutId = window.setTimeout(update, 60);
        }
        return;
      }
      retryRef.current = 0;
      const available = Math.max(0, containerWidth - reservePx);
      const measureWidth = () =>
        measureEl.getBoundingClientRect().width || measureEl.scrollWidth || measureEl.clientWidth;
      measureEl.textContent = text;
      const fullWidth = measureWidth();
      if (!fullWidth) {
        if (retryRef.current < 5) {
          retryRef.current += 1;
          timeoutId = window.setTimeout(update, 60);
        }
        return;
      }
      if (fullWidth <= available) {
        setLabel(text);
        return;
      }
      let next = buildSegmentedLabel(segments, 1);
      for (let count = segments.length; count >= 1; count -= 1) {
        const candidate = buildSegmentedLabel(segments, count);
        measureEl.textContent = candidate;
        if (measureWidth() <= available) {
          next = candidate;
          break;
        }
      }
      setLabel(next);
    };

    const schedule = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(update);
    };

    schedule();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(schedule);
    if (primary) observer.observe(primary);
    if (fallback && fallback !== primary) observer.observe(fallback);
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(schedule).catch(() => undefined);
    }
    return () => {
      observer.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [containerRef, fallbackRef, reservePx, segments, segments.length, segmentsKey, text]);

  return { measureRef, label };
};

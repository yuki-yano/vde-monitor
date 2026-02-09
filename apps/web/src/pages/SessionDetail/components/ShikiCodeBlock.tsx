import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Button, Callout } from "@/components/ui";
import { cn } from "@/lib/cn";
import { highlightCode, resetShikiHighlighter } from "@/lib/shiki/highlighter";
import type { Theme } from "@/lib/theme";

type ShikiCodeBlockProps = {
  code: string;
  language: string | null;
  theme: Theme;
  flush?: boolean;
  showLineNumbers?: boolean;
  className?: string;
};

export const ShikiCodeBlock = ({
  code,
  language,
  theme,
  flush = false,
  showLineNumbers = false,
  className,
}: ShikiCodeBlockProps) => {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const normalizedCode = useMemo(() => code.replace(/\n$/, ""), [code]);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const horizontalScrollRef = useRef(0);
  const verticalScrollRef = useRef(0);

  const handleScroll = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    horizontalScrollRef.current = scroller.scrollLeft;
    verticalScrollRef.current = scroller.scrollTop;
  }, []);

  useEffect(() => {
    let alive = true;
    horizontalScrollRef.current = 0;
    verticalScrollRef.current = 0;
    const scroller = scrollerRef.current;
    if (scroller) {
      scroller.scrollLeft = 0;
      scroller.scrollTop = 0;
    }
    setError(null);
    setHtml(null);
    void highlightCode({
      code: normalizedCode,
      lang: language,
      theme,
    })
      .then((result) => {
        if (!alive) {
          return;
        }
        setHtml(result.html);
      })
      .catch((cause) => {
        if (!alive) {
          return;
        }
        void cause;
        setError("Failed to initialize syntax highlighting. Showing plain text.");
      });
    return () => {
      alive = false;
    };
  }, [language, normalizedCode, retryToken, theme]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    if (horizontalScrollRef.current > 0) {
      scroller.scrollLeft = horizontalScrollRef.current;
    }
    if (verticalScrollRef.current > 0) {
      scroller.scrollTop = verticalScrollRef.current;
    }
  }, [error, html]);

  const containerClassName = flush
    ? "text-latte-text custom-scrollbar min-h-0 flex-1 overflow-auto overscroll-contain"
    : "text-latte-text bg-latte-crust/80 custom-scrollbar min-h-0 flex-1 overflow-auto overscroll-contain rounded-xl";

  const shikiClassName = flush
    ? "min-h-full [&_.shiki]:m-0 [&_.shiki]:min-h-full [&_.shiki]:w-max [&_.shiki]:min-w-full [&_.shiki]:overflow-visible [&_.shiki]:rounded-none [&_.shiki]:px-2 [&_.shiki]:py-1.5 [&_.shiki]:font-mono [&_.shiki]:text-xs [&_.shiki]:leading-5"
    : "min-h-full [&_.shiki]:m-0 [&_.shiki]:min-h-full [&_.shiki]:w-max [&_.shiki]:min-w-full [&_.shiki]:overflow-visible [&_.shiki]:rounded-xl [&_.shiki]:p-3 [&_.shiki]:font-mono [&_.shiki]:text-xs [&_.shiki]:leading-5";

  const fallbackPreClassName = flush
    ? "m-0 min-h-full w-max min-w-full whitespace-pre px-2 py-1.5 font-mono text-xs leading-5"
    : "m-0 min-h-full w-max min-w-full whitespace-pre p-3 font-mono text-xs leading-5";
  const fallbackLines = useMemo(() => normalizedCode.split("\n"), [normalizedCode]);
  const highlightedHtml = useMemo(() => {
    if (!html) {
      return null;
    }
    if (!showLineNumbers) {
      return html;
    }
    return html
      .replace(/<\/span>\n<span class="line">/g, '</span><span class="line">')
      .replace(/<\/span>\n<\/code>/g, "</span></code>");
  }, [html, showLineNumbers]);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", error ? "gap-2" : "gap-0", className)}>
      {error ? (
        <Callout tone="warning" size="xs">
          {error}
        </Callout>
      ) : null}
      <div ref={scrollerRef} onScroll={handleScroll} className={containerClassName}>
        {highlightedHtml && !error ? (
          <div
            className={cn(shikiClassName, showLineNumbers ? "vde-shiki-with-line-numbers" : "")}
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        ) : (
          <pre
            className={cn(
              fallbackPreClassName,
              showLineNumbers ? "vde-shiki-with-line-numbers" : "",
            )}
          >
            <code>
              {showLineNumbers
                ? fallbackLines.map((line, index) => (
                    <span key={`${index}:${line}`} className="line">
                      {line || "\u200B"}
                    </span>
                  ))
                : normalizedCode || "\u200B"}
            </code>
          </pre>
        )}
      </div>
      {error ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            resetShikiHighlighter();
            setRetryToken((prev) => prev + 1);
          }}
          className="h-7 self-start text-xs"
        >
          Retry highlight
        </Button>
      ) : null}
    </div>
  );
};

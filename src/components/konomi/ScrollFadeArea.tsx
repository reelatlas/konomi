"use client";

import { useEffect, useRef, useState } from "react";

interface ScrollFadeAreaProps {
  // Tailwind height utility for the fixed-height scroll viewport, e.g. "h-[97px]".
  height: string;
  scrollStep?: number;
  // Pixels to push the top gradient + up-arrow down by, for callers that
  // render their own sticky header(s) inside the scrolled content (see
  // TagPoolSection) — otherwise they'd render at top-0 and sit underneath
  // (visually hidden behind) that header. 0 for callers with no sticky
  // header (e.g. TagScrollArea), which is the common case.
  topInset?: number;
  children: React.ReactNode;
}

const DEFAULT_SCROLL_STEP = 32;

// Shared fixed-height-viewport-with-gradient-fade-and-hover-arrows mechanic,
// used by both TagScrollArea (per-card tags) and the Tag Pool container.
// Watches an inner, intrinsically-sized content div (not the fixed-height
// viewport itself, whose own box never changes size) via ResizeObserver, so
// it correctly detects content growing/shrinking for reasons the viewport
// can't see itself — e.g. a nested CollapsibleSection expanding, not just a
// changed children array.
export function ScrollFadeArea({ height, scrollStep = DEFAULT_SCROLL_STEP, topInset = 0, children }: ScrollFadeAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(true);

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    setHasOverflow(el.scrollHeight > el.clientHeight + 1);
    setAtTop(el.scrollTop <= 0);
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 1);
  };

  useEffect(() => {
    updateScrollState();
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const scrollBy = (direction: 1 | -1) => {
    scrollRef.current?.scrollBy({ top: direction * scrollStep, behavior: "smooth" });
  };

  const showTopGradient = hasOverflow && !atTop;
  const showBottomGradient = hasOverflow && !atBottom;

  return (
    <div className="group/scroll relative">
      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        className={`${height} overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
      >
        <div ref={contentRef}>{children}</div>
      </div>

      {showTopGradient && (
        <div
          className="pointer-events-none absolute inset-x-0 h-[18px] bg-gradient-to-b from-[var(--surface)] to-transparent"
          style={{ top: topInset }}
        />
      )}
      {showBottomGradient && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[18px] bg-gradient-to-t from-[var(--surface)] to-transparent" />
      )}

      {/* text-[8px] here is intentionally below the type scale's smallest
          step (--text-2xs, 10px): these arrow glyphs are functional scroll
          controls, not typographic content, so they don't need to track the
          type scale the way body/label text does. */}
      {showTopGradient && (
        <button
          type="button"
          aria-label="Scroll up"
          onClick={(e) => {
            e.stopPropagation();
            scrollBy(-1);
          }}
          className="absolute left-1/2 -translate-x-1/2 w-[18px] h-[16px] flex items-center justify-center rounded-full border-[length:var(--border-hair)] border-[var(--ink)] bg-[var(--surface)] text-[8px] leading-none text-[var(--ink)] opacity-0 group-hover/scroll:opacity-100 transition-opacity cursor-pointer z-10"
          style={{ top: topInset + 2 }}
        >
          ▲
        </button>
      )}
      {showBottomGradient && (
        <button
          type="button"
          aria-label="Scroll down"
          onClick={(e) => {
            e.stopPropagation();
            scrollBy(1);
          }}
          className="absolute bottom-[2px] left-1/2 -translate-x-1/2 w-[18px] h-[16px] flex items-center justify-center rounded-full border-[length:var(--border-hair)] border-[var(--ink)] bg-[var(--surface)] text-[8px] leading-none text-[var(--ink)] opacity-0 group-hover/scroll:opacity-100 transition-opacity cursor-pointer z-10"
        >
          ▼
        </button>
      )}
    </div>
  );
}

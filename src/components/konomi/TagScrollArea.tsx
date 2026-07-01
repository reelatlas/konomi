"use client";

import { useEffect, useRef, useState } from "react";
import { TagChip } from "./TagChip";

interface TagScrollAreaProps {
  tags: string[];
  selectedTags: string[];
  onChipToggle: (tag: string) => void;
}

// Exact rendered height of 3 rows of small tag chips (27px chip + 6px gap,
// three times over, plus box-model rounding) — measured directly against the
// live component, not estimated. This is the fixed height for every card's
// tag area: content up to 3 rows needs no scrolling at all; 4+ rows becomes
// internally scrollable at this same height, so the card itself never grows
// or clips.
const TAG_AREA_HEIGHT = "h-[97px]";
const SCROLL_STEP = 32;

export function TagScrollArea({ tags, selectedTags, onChipToggle }: TagScrollAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
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
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tags.join(",")]);

  const scrollBy = (direction: 1 | -1) => {
    scrollRef.current?.scrollBy({ top: direction * SCROLL_STEP, behavior: "smooth" });
  };

  const showTopGradient = hasOverflow && !atTop;
  const showBottomGradient = hasOverflow && !atBottom;

  return (
    <div className="group/tags relative">
      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        className={`${TAG_AREA_HEIGHT} overflow-y-auto overflow-x-hidden flex flex-wrap content-start gap-[var(--space-sm)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
      >
        {tags.map((tag) => (
          <TagChip key={tag} name={tag} size="small" active={selectedTags.includes(tag)} onToggle={onChipToggle} />
        ))}
      </div>

      {showTopGradient && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[18px] bg-gradient-to-b from-[var(--surface)] to-transparent" />
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
          aria-label="Scroll tags up"
          onClick={(e) => {
            e.stopPropagation();
            scrollBy(-1);
          }}
          className="absolute top-[2px] left-1/2 -translate-x-1/2 w-[18px] h-[16px] flex items-center justify-center rounded-full border-[length:var(--border-hair)] border-[var(--ink)] bg-[var(--surface)] text-[8px] leading-none text-[var(--ink)] opacity-0 group-hover/tags:opacity-100 transition-opacity cursor-pointer z-10"
        >
          ▲
        </button>
      )}
      {showBottomGradient && (
        <button
          type="button"
          aria-label="Scroll tags down"
          onClick={(e) => {
            e.stopPropagation();
            scrollBy(1);
          }}
          className="absolute bottom-[2px] left-1/2 -translate-x-1/2 w-[18px] h-[16px] flex items-center justify-center rounded-full border-[length:var(--border-hair)] border-[var(--ink)] bg-[var(--surface)] text-[8px] leading-none text-[var(--ink)] opacity-0 group-hover/tags:opacity-100 transition-opacity cursor-pointer z-10"
        >
          ▼
        </button>
      )}
    </div>
  );
}

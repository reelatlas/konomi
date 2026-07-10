"use client";

import { useEffect, useRef, useState } from "react";
import type { LevelKey } from "@/lib/konomi/types";
import { FilterIcon, SortIcon, TagIcon } from "./icons";
import { IconButton } from "./IconButton";
import { LevelSelector } from "./LevelSelector";
import { SortSelect } from "./SortSelect";
import { setSortPref, useLevel, useSort } from "./tagPoolPrefs";

interface ResultsFilterButtonProps {
  // Persisting Level also prunes any selected tag the new level hides —
  // that extra step lives in KonomiApp's handleLevelChange, threaded down
  // through ResultsHeader, the same prop MixerBar used to receive directly
  // before Level/Sort lived here instead. Sort has no such cascade, so
  // setSortPref (tagPoolPrefs.ts) is called directly below, matching
  // MixerBar's own old pattern.
  onLevelChange: (level: LevelKey) => void;
}

// Tag Density (Level) and Sort used to live in MixerBar's own resize-handle
// row. They moved here — a popover off a Filter icon inline with the
// Recommendations header — so MixerBar's edit sheet no longer needs a row
// of its own just for them (see MixerBar.tsx's own top comment). The
// underlying state (useLevel/useSort/setSortPref, tagPoolPrefs.ts) is
// untouched by the move: TagPoolBody and ResultCard keep reading it
// directly and independently, exactly as before.
export function ResultsFilterButton({ onLevelChange }: ResultsFilterButtonProps) {
  const level = useLevel();
  const sort = useSort();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Closes on any outside pointerdown or Escape — the same two patterns
  // already proven this session for LevelSelector's collapsed hint and
  // MixerBar's own edit-mode dialog, not a new mechanism.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (wrapperRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    // data-results-filter: lets MixerBar's own click-outside-closes-edit-mode
    // listener allowlist this trigger and its popover via the same
    // closest() check it already uses for data-clear-results (ResultsHeader's
    // own Clear button) — without it, opening this popover while Tag Pool's
    // edit mode happens to be open would close edit mode as an unrelated
    // side effect, the identical footgun Clear was already protected
    // against for the same reason.
    //
    // z-[var(--z-raised)]: confirmed live as a real bug without it, the
    // identical one ResultsHeader's Clear ✕ already has this exact fix
    // for (see that file's own comment) — once results exist, the
    // carousel's own ScrollFadeArea wrappers (RecommendationsBody.tsx)
    // carry invisible pt-40px flip-bulge padding that geometrically
    // overlaps this row's own bottom edge, and without an explicit
    // z-index this button loses the hit-test to that empty padding,
    // silently swallowing every click once a result set is present.
    <div ref={wrapperRef} data-results-filter className="relative z-[var(--z-raised)]">
      <IconButton
        size="sm"
        border="base"
        shadow="elev-2"
        backgroundColor="transparent"
        title="Filters"
        aria-label="Filters"
        onClick={() => setOpen((o) => !o)}
      >
        <FilterIcon className="text-[var(--ink)]" />
      </IconButton>
      {open && (
        <div
          role="dialog"
          aria-label="Filters"
          // @container: Level/Sort's own label-hide/collapse breakpoints
          // below key off this container's width, not the old MixerBar
          // cardRef's — the old @min-[480px]/@max-[352px] numbers were
          // calibrated against that much wider box and can't be reused
          // here (this popover is always far narrower), see this file's
          // own git history/DESIGN_SYSTEM.md for the live-bisected values
          // actually used.
          //
          // w-[min(340px,calc(100vw-3rem))], not w-max — confirmed live as
          // a real bug with w-max: a `container-type: inline-size` element
          // (what Tailwind's `@container` sets) can't size itself from its
          // own descendants' content when those descendants' own rendered
          // content depends on querying that same container (exactly what
          // the label/collapse spans below do) — a circular sizing
          // dependency browsers resolve by collapsing the container down
          // to a near-zero width instead. A definite width formula (a
          // fixed px figure clamped against the viewport, no content
          // sizing involved) sidesteps the circularity entirely, the same
          // reason the old MixerBar cardRef (this pattern's origin) was
          // already a definite-width box (max-w-[1280px] mx-auto), never
          // an intrinsically-sized one.
          className="@container absolute right-0 top-full mt-[var(--space-sm)] z-[var(--z-overlay)] w-[min(340px,calc(100vw-3rem))] border-[length:var(--border-base)] border-[var(--ink)] bg-[var(--surface)] shadow-[var(--elev-2)] p-[var(--space-lg)] flex flex-col"
        >
          {/* pb-[24px]: reserves clearance for LevelSelector's own hover/tap
              hint, which renders *below* the control via absolute
              positioning (see LevelSelector.tsx's own comment) — without
              this, the hint would visually overlap the Sort row directly
              beneath it in this stacked layout, rather than the horizontal
              row this control used to share with Sort in MixerBar, which
              had no row below it to collide with. */}
          <div className="flex items-center justify-end gap-[var(--space-sm)] pb-[24px]">
            <span className="hidden @min-[220px]:inline font-mono font-bold text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] uppercase whitespace-nowrap">
              Tag Density
            </span>
            <TagIcon className="text-[var(--ink)]" />
            <div className="@max-[180px]:hidden">
              <LevelSelector value={level} onChange={onLevelChange} />
            </div>
            <div className="hidden @max-[180px]:block">
              <LevelSelector value={level} onChange={onLevelChange} collapsed />
            </div>
          </div>
          <div className="flex items-center justify-end gap-[var(--space-sm)]">
            <span className="hidden @min-[220px]:inline font-mono font-bold text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] uppercase whitespace-nowrap">
              Sort
            </span>
            <SortIcon className="text-[var(--ink)]" />
            <div className="@max-[180px]:hidden">
              <SortSelect value={sort} onChange={setSortPref} />
            </div>
            <div className="hidden @max-[180px]:block">
              <SortSelect value={sort} onChange={setSortPref} collapsed />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

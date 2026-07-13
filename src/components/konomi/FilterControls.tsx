"use client";

import type { LevelKey } from "@/lib/konomi/types";
import { SortIcon, TagIcon } from "./icons";
import { LevelSelector } from "./LevelSelector";
import { SortSelect } from "./SortSelect";
import { setSortPref, useLevel, useSort } from "./tagPoolPrefs";

interface FilterControlsProps {
  // Level's change also prunes any tag the new level hides — that cascade
  // lives in KonomiApp's handleLevelChange, threaded down through whichever
  // host renders this (ResultsFilterButton's popover, or the empty-state box).
  // Sort has no such cascade, so setSortPref (tagPoolPrefs.ts) is called
  // directly below.
  onLevelChange: (level: LevelKey) => void;
  className?: string;
}

// The Tag Density + Tag Sort filter fields (label + icon + control). Shared by
// BOTH the ResultsFilterButton popover (shown in the results header once there
// are results) and the empty-state box (RecommendationsBody, shown when there
// are none) so the two render the identical controls from one source, rather
// than the empty state re-implementing them. Lifted verbatim out of
// ResultsFilterButton — same @container collapse breakpoints, same
// LevelSelector/SortSelect expanded+collapsed dual-render, same wiring.
//
// @container lives on THIS root (it used to sit on the popover dialog): the
// collapse breakpoints below query this element's own width, so it must be a
// definite-width query container in every host. Callers give it that width —
// `w-full` inside the popover's own definite-width dialog, or a definite-width
// wrapper in the empty state — never a content-sized width (w-max), which is
// circular with the content-querying children (see ResultsFilterButton's own
// width comment for the full reasoning).
export function FilterControls({ onLevelChange, className }: FilterControlsProps) {
  const level = useLevel();
  const sort = useSort();
  return (
    <div className={["@container flex flex-col", className ?? ""].join(" ")}>
      {/* pb-[24px]: reserves clearance for LevelSelector's own hover/tap hint,
          which renders below the control via absolute positioning (see
          LevelSelector.tsx) — without this it would overlap the Sort row
          directly beneath it. */}
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
          Tag Sort
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
  );
}

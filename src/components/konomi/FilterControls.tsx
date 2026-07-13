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
  // "stacked" (default): the two fields stack vertically, each row full-width
  // and right-aligned — the ResultsFilterButton popover's shape, a narrow
  // column. "inline": the two fields sit side by side on ONE line, centred —
  // the empty-state box's shape. The two differ enough (flex direction, and
  // the @container widths at which labels/controls step down) that they're
  // parameterised here rather than duplicated. Everything else — the actual
  // LevelSelector/SortSelect controls, labels, icons, dual-render — is shared.
  layout?: "stacked" | "inline";
  className?: string;
}

// The Tag Density + Tag Sort filter fields (label + icon + control). Shared by
// BOTH the ResultsFilterButton popover (results header) and the empty-state box
// (RecommendationsBody) so the two render the identical controls from one
// source rather than re-implementing them.
//
// @container lives on this root: the label-hide/collapse breakpoints below
// query this element's own width, so it must be a definite-width query
// container in every host. Callers give it that width — `w-full` inside the
// popover's own definite-width dialog, or a definite-width wrapper in the empty
// state — never content-sized (w-max), which is circular with the content-
// querying children (see ResultsFilterButton's own width comment).
//
// Progressive reduction (both layouts, same idea as MixerBar's own Min Match
// cluster — keep it to as few lines as possible, drop an element before ever
// wrapping): full (label + icon + expanded control) → drop the label (icon +
// expanded) → single-segment collapsed control (icon + collapsed) → only then,
// if it still doesn't fit, wrap. The @container widths differ per layout
// because "inline" holds BOTH fields on one line (so its thresholds are ~2x
// wider than "stacked", which only ever has one field's width to fit).
export function FilterControls({ onLevelChange, layout = "stacked", className }: FilterControlsProps) {
  const level = useLevel();
  const sort = useSort();
  const inline = layout === "inline";

  // Label shows above these widths; expanded control shows above the collapse
  // width, the collapsed single-segment control at/below it. Inline's numbers
  // are measured from the real piece widths (full ≈ 510 / no-label ≈ 372 one
  // line) plus a cross-engine margin so labels drop / controls collapse a hair
  // before the row would actually have to wrap. Stacked keeps the popover's own
  // long-standing single-field thresholds.
  const labelShow = inline ? "hidden @min-[530px]:inline" : "hidden @min-[220px]:inline";
  const expandedHide = inline ? "@max-[390px]:hidden" : "@max-[180px]:hidden";
  const collapsedShow = inline ? "hidden @max-[390px]:block" : "hidden @max-[180px]:block";

  // Inline: flex-wrap so the LAST resort (below the single-segment width) is a
  // wrap to a second row; gap-y-2xl gives a wrapped second row clearance for
  // LevelSelector's own hover hint (which renders absolutely below its control).
  // Stacked: a plain vertical column; the density row carries pb-[24px] for that
  // same hint, since the Sort row sits directly beneath it there.
  const root = inline
    ? "@container flex flex-row flex-wrap items-center justify-center gap-x-[var(--space-xl)] gap-y-[var(--space-2xl)]"
    : "@container flex flex-col";
  const fieldBase = "flex items-center gap-[var(--space-sm)]";
  const densityField = inline ? `${fieldBase} shrink-0` : `${fieldBase} justify-end pb-[24px]`;
  const sortField = inline ? `${fieldBase} shrink-0` : `${fieldBase} justify-end`;
  const labelClass = `${labelShow} font-mono font-bold text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] uppercase whitespace-nowrap`;

  return (
    <div className={[root, className ?? ""].join(" ")}>
      <div className={densityField}>
        <span className={labelClass}>Tag Density</span>
        <TagIcon className="text-[var(--ink)]" />
        <div className={expandedHide}>
          <LevelSelector value={level} onChange={onLevelChange} />
        </div>
        <div className={collapsedShow}>
          <LevelSelector value={level} onChange={onLevelChange} collapsed />
        </div>
      </div>
      <div className={sortField}>
        <span className={labelClass}>Tag Sort</span>
        <SortIcon className="text-[var(--ink)]" />
        <div className={expandedHide}>
          <SortSelect value={sort} onChange={setSortPref} />
        </div>
        <div className={collapsedShow}>
          <SortSelect value={sort} onChange={setSortPref} collapsed />
        </div>
      </div>
    </div>
  );
}

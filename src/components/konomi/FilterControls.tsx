"use client";

import type { ReactNode } from "react";
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
  // "inline": the empty-state box's shape (wide container, @container-driven
  // control collapse). "popover": the ResultsFilterButton popover's shape (a
  // narrow ≤312px dialog, viewport-driven collapse). BOTH now render each field
  // LABEL-ON-TOP (see the field helper) — the layouts differ only in their root
  // container (a centered flex-wrap row vs a right-aligned flex-col) and in what
  // the control's collapse threshold queries (@container vs viewport). The
  // actual controls, icons, labels, and dual-render are shared.
  layout?: "inline" | "popover";
  className?: string;
}

// The Tag Density + Tag Sort filter fields (label + icon + control). Shared by
// BOTH the ResultsFilterButton popover (results header) and the empty-state box
// (RecommendationsBody) so the two render the identical controls from one
// source rather than re-implementing them.
//
// Every field is LABEL-ON-TOP now: the label stacks above its control (left-
// aligned to the control), with the icon to the left, vertically centered on the
// control. This replaced an earlier label-BESIDE layout that both surfaces used
// at wider widths — the empty state flipped to a beside row at @min-[530px], the
// popover was a flat beside row with the label gated at min-[434px]. Those two
// revert points are spelled out on the field helper below in case label-beside
// is ever wanted back.
//
// INLINE puts a @container on this root: the control's collapse breakpoint
// queries this element's own width, so its host must give it a definite width (a
// definite-width wrapper in the empty state) — never content-sized (w-max),
// which is circular with the content-querying children. POPOVER instead reduces
// off the VIEWPORT (plain media queries) precisely so its dialog can be content-
// sized (w-fit) and hug the filters.
//
// Progressive reduction is now just the CONTROL (both layouts): expanded control
// (all segments) → single-tap-cycle collapsed control → wrap. The label no longer
// participates in the reduction (it's always shown, on top). The collapse widths
// differ per layout — see expandedHide/collapsedShow below.
export function FilterControls({ onLevelChange, layout = "popover", className }: FilterControlsProps) {
  const level = useLevel();
  const sort = useSort();
  const inline = layout === "inline";

  // The expanded control shows above the collapse width, the collapsed single-
  // tap-cycle control at/below it. INLINE queries its own @container (the wide
  // empty-state box) via @max-; POPOVER queries the VIEWPORT (plain max-,
  // Tailwind's media variant) — because the dialog hugs its own content (w-fit),
  // so it has no definite width of its own for a container query to read; a
  // container-type box ignores its content for sizing, so hugging + @container
  // are mutually exclusive. The collapse threshold is SHARED by both fields, so
  // Density and Sort drop to single-select together (requested, for
  // consistency). Popover 369px: below it the expanded Density row (3-segment
  // control + the dialog's padding) would exceed the dialog's max-width, so both
  // cut to single-select. Inline 390px: the empty-state box's own equivalent.
  // All live-bisected; re-check on-device.
  const expandedHide = inline ? "@max-[390px]:hidden" : "max-[369px]:hidden";
  const collapsedShow = inline ? "hidden @max-[390px]:block" : "hidden max-[369px]:block";

  // INLINE root: a centered flex-wrap @container row, in the wide, symmetric
  // empty-state box. POPOVER root: a LEFT-aligned flex-COL (items-start) — its
  // two fields always sit on their own rows (Density above Sort), each sized to
  // its own content so the dialog's w-max still hugs the widest of the two; only
  // the alignment within that hug is left, not right (requested — reads more
  // naturally under the on-top labels than the old right-flush). gap-y 2xl clears
  // LevelSelector's own hover hint between the rows / wrapped lines.
  const root = inline
    ? "@container flex flex-row flex-wrap items-center justify-center gap-x-[var(--space-xl)] gap-y-[var(--space-2xl)]"
    : "flex flex-col items-start gap-y-[var(--space-2xl)]";
  const labelBase = "font-mono font-bold text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] uppercase whitespace-nowrap";

  // LABEL-ON-TOP field, used by BOTH surfaces. A 2-column grid; DOM order is
  // [label, icon, control], placed so all three requests hold at once —
  // something a single flex axis can't do:
  //   • label   → col2 / row1 (justify-self-start) → its left edge lines up with
  //               the CONTROL (col2 is shared), NOT the icon (col1).
  //   • icon    → col1 / row2, self-center → vertically centered against the
  //               CONTROL's own row, not the whole label+control column.
  //   • control → col2 / row2.
  // The label is ALWAYS shown (moving it on top is the whole point), never
  // width-gated.
  //
  // REVERT POINTS — to bring the old label-BESIDE layout back:
  //   • Empty-state (inline) previously flipped to a label-beside flex ROW at
  //     @min-[530px]: re-add `@min-[530px]:flex @min-[530px]:items-center` to
  //     THIS grid and `@min-[530px]:contents` to the control wrapper below, and
  //     gate the label span with `hidden @min-[530px]:inline`. 530px was the
  //     inline↔on-top boundary for the empty state.
  //   • Popover was a flat label-beside row (`flex items-center gap-[var(--space-sm)]`)
  //     with the label gated to appear at `min-[434px]`: restore that row + gate.
  const field = (label: string, icon: ReactNode, expanded: ReactNode, collapsed: ReactNode) => (
    <div className="grid grid-cols-[auto_auto] items-center gap-x-[var(--space-sm)] gap-y-[var(--space-sm)] shrink-0">
      <span className={`${labelBase} col-start-2 row-start-1 justify-self-start`}>{label}</span>
      <span className="col-start-1 row-start-2 self-center inline-flex">{icon}</span>
      <div className="col-start-2 row-start-2 justify-self-start">
        <div className={expandedHide}>{expanded}</div>
        <div className={collapsedShow}>{collapsed}</div>
      </div>
    </div>
  );

  return (
    <div className={[root, className ?? ""].join(" ")}>
      {field(
        "Tag Density",
        <TagIcon className="text-[var(--ink)]" />,
        <LevelSelector value={level} onChange={onLevelChange} />,
        <LevelSelector value={level} onChange={onLevelChange} collapsed />,
      )}
      {field(
        "Tag Sort",
        <SortIcon className="text-[var(--ink)]" />,
        <SortSelect value={sort} onChange={setSortPref} />,
        <SortSelect value={sort} onChange={setSortPref} collapsed />,
      )}
    </div>
  );
}

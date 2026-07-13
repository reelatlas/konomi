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
  // "inline": the two fields sit side by side on ONE line, centred — the
  // empty-state box's shape (wide container). "popover": the ResultsFilterButton
  // popover's shape (narrow, ≤312px container) — also a flex-row/wrap, but with
  // its own far tighter @container thresholds AND a single shared collapse point
  // so BOTH controls drop to their single-tap-cycle form together (requested:
  // "if either enters the single-select breakpoint, both do", for visual
  // consistency). flex-wrap then does the rest for free: two EXPANDED controls
  // (~360px combined) never fit the popover's width so they wrap to two rows,
  // while two COLLAPSED single-selects (~228px) fit one row and stay on it until
  // the box is narrow enough to wrap — no explicit "put them on one row" rule
  // needed, wrap is the rule. The two layouts differ enough (thresholds, gaps)
  // to parameterise rather than duplicate; the actual LevelSelector/SortSelect
  // controls, icons, labels, dual-render are shared.
  layout?: "inline" | "popover";
  className?: string;
}

// The Tag Density + Tag Sort filter fields (label + icon + control). Shared by
// BOTH the ResultsFilterButton popover (results header) and the empty-state box
// (RecommendationsBody) so the two render the identical controls from one
// source rather than re-implementing them.
//
// INLINE puts a @container on this root: its label-hide/collapse breakpoints
// query this element's own width, so its host must give it a definite width — a
// definite-width wrapper in the empty state — never content-sized (w-max), which
// is circular with the content-querying children. POPOVER instead reduces off
// the VIEWPORT (plain media queries) precisely so its dialog can be content-
// sized (w-fit) and hug the filters — see the threshold comment below and
// ResultsFilterButton's own width comment.
//
// Progressive reduction (both layouts, same idea as MixerBar's own Min Match
// cluster): full (label + icon + expanded control) → drop the label (icon +
// expanded) → single-tap-cycle collapsed control (icon + collapsed) → wrap. The
// @container widths differ per layout: "inline" keys off the wide (~560px)
// empty-state box; "popover" off the narrow (≤312px) results-header dialog,
// where the two expanded controls can't share one row so they wrap, and both
// collapse together at one shared threshold so the two single-selects then land
// on one row (see the threshold comment below).
export function FilterControls({ onLevelChange, layout = "popover", className }: FilterControlsProps) {
  const level = useLevel();
  const sort = useSort();
  const inline = layout === "inline";

  // Label shows above the first width; the expanded control shows above the
  // collapse width, the collapsed single-tap-cycle control at/below it.
  //
  // The two layouts query DIFFERENT things. INLINE queries its own @container
  // (the wide empty-state box) via @min-/@max-. POPOVER queries the VIEWPORT
  // (plain min-/max-, Tailwind's media variants) instead — because the dialog
  // now hugs its own content (w-fit, see ResultsFilterButton), so it has no
  // definite width of its own for a container query to read; a container-type
  // box ignores its content for sizing, so hugging + @container are mutually
  // exclusive. The popover's own max-width is viewport-derived anyway
  // (min(340px, 100vw-6rem)), so the viewport is the right axis to reduce on.
  // The collapse threshold is SHARED by both fields (same expandedHide/
  // collapsedShow), so Density and Sort drop to single-select together
  // (requested, for consistency) — each on its own row throughout. Popover
  // numbers: 369px — below it the expanded Density row (icon + 3-segment control
  // ~232px + the dialog's padding) would exceed the dialog's max-width, so both
  // cut to single-select; 434px — above it the dialog (max-width min(340px,
  // 100vw-6rem)) is finally wide enough to hold the labelled Density row (~310px
  // + padding = ~334px) WITH its left padding intact. At the earlier 420px labels
  // appeared ~14px too soon, so the "TAG DENSITY" text pressed against the
  // dialog's left edge until it widened out (reported). All live-bisected;
  // re-check on-device.
  const labelShow = inline ? "hidden @min-[530px]:inline" : "hidden min-[434px]:inline";
  const expandedHide = inline ? "@max-[390px]:hidden" : "max-[369px]:hidden";
  const collapsedShow = inline ? "hidden @max-[390px]:block" : "hidden max-[369px]:block";

  // INLINE is a flex-row + flex-wrap @container, centred in the wide, symmetric
  // empty-state box. POPOVER is a flex-COL: its two fields ALWAYS sit on their
  // own rows (Density above Sort), never sharing one — deliberately. Almost no
  // real breakpoint was wide enough to fit both single-selects on a line, and a
  // fixed two-row shape makes the dialog's hug trivial and its padding
  // consistent: there's exactly one widest row to size to, with no wrap-vs-one-
  // row branch (which had also left the dialog stretched at rest just under the
  // collapse point — reported). items-end right-aligns each row flush to the
  // dialog's right edge (its trigger + the results header live there); the fields
  // size to their own content (align-items isn't stretch), so plain w-max on the
  // dialog hugs the WIDEST of the two rows — no JS measurement needed (flex-col
  // max-content is its widest child, unlike a flex-row's which is both fields on
  // one line). gap-y 2xl clears LevelSelector's own hover hint between the rows.
  const root = inline
    ? "@container flex flex-row flex-wrap items-center justify-center gap-x-[var(--space-xl)] gap-y-[var(--space-2xl)]"
    : "flex flex-col items-end gap-y-[var(--space-2xl)]";
  const fieldBase = "flex items-center gap-[var(--space-sm)]";
  const densityField = inline ? `${fieldBase} shrink-0` : fieldBase;
  const sortField = inline ? `${fieldBase} shrink-0` : fieldBase;
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

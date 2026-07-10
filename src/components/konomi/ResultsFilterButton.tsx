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
    // This wrapper's own z-index switches between z-raised and z-popover
    // based on `open`, rather than sitting at one fixed value — the
    // *trigger button* should only ever need to outrank the results
    // carousel behind it (z-raised already covers that, the same fix
    // ResultsHeader's Clear ✕ has for the identical reason — see that
    // file's own comment), not MixerBar's own z-overlay edit sheet, which
    // is free to visually cover this closed button like any other content
    // in its path. Only once the *popover* actually opens does this need
    // to outrank MixerBar too, since the sheet can grow tall enough to
    // reach this row. z-popover only applies while `open`, so the closed
    // trigger never claims priority it doesn't need — requested directly,
    // "the button shouldn't outrank the edit panel, just the popover
    // should, if it's open."
    //
    // Bumping the *whole wrapper* (trigger included) rather than just the
    // popover panel below is still required even though only the popover
    // itself needs to visually win — confirmed live: a nested z-index
    // doesn't escape its own ancestor's stacking context, so giving only
    // the inner popover panel a high z-index has no effect on how this
    // whole component stacks against a sibling subtree like MixerBar's
    // cardRef; that comparison is governed entirely by this outer
    // wrapper's own z-index; the trigger button riding along with it while
    // open is a side effect of that, not a separate ask. z-popover (20,
    // globals.css) is deliberately its own token, not a reused z-overlay:
    // two siblings both claiming the same "floating, on top of everything"
    // tier would leave their relative order decided by DOM position
    // rather than an explicit ranking (see globals.css's own comment on
    // this token for why MixerBar's cardRef, later in the DOM, would
    // otherwise silently win by accident).
    <div ref={wrapperRef} data-results-filter className={["relative", open ? "z-[var(--z-popover)]" : "z-[var(--z-raised)]"].join(" ")}>
      {/* Both states use --primary throughout (icon, border, and fill),
          not --ink — requested directly: a theme-adaptive color
          (Konomi/Tide/Newsprint each define their own --primary) rather
          than the fixed, always-dark neutral every other plain icon
          button in this bar defaults to. Deliberately not --secondary
          either — that's RecommendButton's own accent color
          (DEFAULT_ACCENT, config.ts), and reusing it here would make this
          button read as sharing Recommend's own "primary action" weight
          instead of its own, secondary one. Default: outlined, --primary
          icon/border, transparent fill. Active (while `open`): filled
          --primary with a --surface icon, the same pairing LevelSelector's
          own active segment already uses for an "on" state — reverts the
          instant `open` goes false again, whether that's the trigger
          click, an outside click, or Escape, since all three already just
          flip this same `open` state. borderColor: IconButton.tsx's own
          prop (added alongside backgroundColor/textColor), not a
          className override — every other icon button in this app still
          gets IconButton's own var(--ink) default unchanged. */}
      <IconButton
        size="sm"
        border="base"
        borderColor="var(--primary)"
        backgroundColor={open ? "var(--primary)" : "transparent"}
        title="Filters"
        aria-label="Filters"
        aria-pressed={open}
        onClick={() => setOpen((o) => !o)}
      >
        <FilterIcon className={open ? "text-[var(--surface)]" : "text-[var(--primary)]"} />
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
          //
          // No z-index needed here — the wrapper above already carries
          // z-popover for the whole time this panel exists (it only
          // renders while `open`), and position:absolute alone already
          // paints this above its own static-positioned trigger-button
          // sibling within that same local context.
          className="@container absolute right-0 top-full mt-[var(--space-sm)] w-[min(340px,calc(100vw-3rem))] border-[length:var(--border-base)] border-[var(--ink)] bg-[var(--surface)] shadow-[var(--elev-2)] p-[var(--space-lg)] flex flex-col"
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
      )}
    </div>
  );
}

"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LevelKey } from "@/lib/konomi/types";
import { FilterControls } from "./FilterControls";
import { FilterIcon } from "./icons";
import { IconButton } from "./IconButton";

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
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Size the dialog to HUG its filters. Pure CSS can't: the dialog is
  // position:absolute right-0, so a content width keyword (w-fit) resolves
  // against its ~30px trigger wrapper and collapses to min-content, while w-max
  // stays pinned at the max-width whenever the two fields wrap to two rows —
  // either way leaving a wide empty strip beside the right-aligned filters at
  // small widths (reported). So measure the two fields and set the width
  // imperatively: their one-line sum when it fits the viewport-derived cap, else
  // the wider field alone (the wrapped-two-row case). The field widths are
  // intrinsic (viewport-media-query-driven, independent of the dialog's own
  // width), so this doesn't feed back on itself. useLayoutEffect writes it before
  // paint (no flash), imperatively (no setState → no cascading render); a resize
  // listener re-runs it when the viewport (and thus the reduced form) changes.
  useLayoutEffect(() => {
    if (!open) return;
    const el = popoverRef.current;
    const fields = el?.firstElementChild ? Array.from(el.firstElementChild.children) : [];
    if (!el || fields.length < 2) return;
    const GAP = 12; // FilterControls' own gap-x-lg between the two fields
    const PAD = 24; // this dialog's p-lg, both sides
    function size() {
      const w0 = fields[0].getBoundingClientRect().width;
      const w1 = fields[1].getBoundingClientRect().width;
      const capContent = Math.min(340, window.innerWidth - 96) - PAD; // dialog max-width minus padding
      const oneLine = w0 + GAP + w1;
      const content = oneLine <= capContent ? oneLine : Math.max(w0, w1);
      el!.style.width = `${Math.ceil(content) + PAD}px`;
    }
    size();
    window.addEventListener("resize", size);
    return () => window.removeEventListener("resize", size);
  }, [open]);

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
          ref={popoverRef}
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
          // w-max (max-content) + max-w-[min(340px,calc(100vw-6rem))]: the dialog
          // HUGS its filters rather than stretching to a fixed width — otherwise,
          // right-aligned content in a wide box left a big empty gap on the left
          // at small widths (reported). w-MAX, not w-fit: this dialog is
          // position:absolute, so its containing block is the ~30px trigger
          // wrapper, and fit-content resolves against THAT (near-min-content →
          // everything wraps to its own row). max-content ignores available width
          // and gives the one-line width, which max-w then wraps only when it
          // truly exceeds the viewport-fit bound — so the two filters share a row
          // when they fit and the box shrinks to exactly their width otherwise.
          // Hugging is only possible because FilterControls' popover layout
          // reduces off the VIEWPORT (plain media queries), NOT a @container: a
          // container-type box ignores its own content for sizing, so a
          // content-sized container query would collapse to zero — mutually
          // exclusive (which is why this used to be a fixed w-[…]).
          //
          // The max-width's viewport term is 6rem, not the 3rem for the two page
          // gutters alone: this dialog is absolute right-0 against the FILTER
          // button, which sits LEFT of the Clear ✕ (not at the content column's
          // right edge), so it opens leftward from a point already inset ~66px
          // from the viewport's right (Clear button + gap + right gutter). At
          // 3rem the leftward extent ran it off the left edge of the screen on
          // phones (left edge −18px at 320–375px wide); 6rem (~96px) reserves
          // that inset plus the left gutter, keeping the dialog fully on-screen
          // while leaving the 340px cap untouched above ~436px. A coupled
          // constant tied to the Clear ✕ width — re-derive if that changes.
          //
          // No z-index needed here — the wrapper above already carries
          // z-popover for the whole time this panel exists (it only
          // renders while `open`), and position:absolute alone already
          // paints this above its own static-positioned trigger-button
          // sibling within that same local context.
          className="absolute right-0 top-full mt-[var(--space-sm)] w-max max-w-[min(340px,calc(100vw-6rem))] border-[length:var(--border-base)] border-[var(--ink)] bg-[var(--surface)] shadow-[var(--elev-2)] p-[var(--space-lg)]"
        >
          <FilterControls onLevelChange={onLevelChange} />
        </div>
      )}
    </div>
  );
}

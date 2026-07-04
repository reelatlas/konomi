"use client";

import { useEffect, useRef, useState } from "react";
import type { LevelKey, MatchKey, MixerError, Slot, TagInfo } from "@/lib/konomi/types";
import { ActionButton } from "./ActionButton";
import { GreaterEqualIcon, SortIcon, TagIcon } from "./icons";
import { LevelSelector } from "./LevelSelector";
import { MatchSelector } from "./MatchSelector";
import { RecommendButton } from "./RecommendButton";
import { SortSelect } from "./SortSelect";
import {
  clampPoolPanelHeight,
  setPoolPanelHeightPref,
  setSortPref,
  useDefaultPoolPanelHeight,
  useLevel,
  usePoolPanelHeight,
  usePoolPanelMaxHeight,
  useSort,
} from "./tagPoolPrefs";
import { TagPoolBody } from "./TagPoolBody";
import { TagSlot } from "./TagSlot";

interface MixerBarProps {
  slots: Slot[];
  dragOverIndex: number;
  minMatch: MatchKey;
  lockedLabel: string;
  filledCount: number;
  onSlotDragOver: (index: number) => void;
  onSlotDragLeave: () => void;
  onSlotDrop: (index: number, tag: string) => void;
  onSlotClick: (index: number) => void;
  onSetMatch: (key: MatchKey) => void;
  onRandomTags: () => void;
  onClearSlots: () => void;
  onRecommend: () => void;
  error: MixerError;
  editMode: boolean;
  onOpenEditMode: () => void;
  onCloseEditMode: () => void;
  allTags: TagInfo[];
  selectedTags: string[];
  totalSeriesCount: number;
  onLevelChange: (level: LevelKey) => void;
  onChipToggle: (tag: string) => void;
}

// Formerly MixerSection — now the app's one bottom-anchored bar, always
// present in a compact "browse" form (title/badge, slots, controls) that
// expands in place into a taller "edit" form instead of a second overlay
// replacing it. See DESIGN_SYSTEM.md's "MixerBar" section for the full
// rationale — this comment covers only the mechanics.
//
// Edit mode's row order, top to bottom: resize handle (desktop only) →
// title → pool panel → slots → controls. Title, slots, and controls are
// FIXED — they never scroll, never resize, and never move, in either mode.
// The pool panel is the only part of this bar that ever changes size, and
// the only part that ever scrolls internally (via TagPoolBody's own
// ScrollFadeArea, unchanged). This is a hard invariant, not a preference:
// the bar's own outer container carries no scroll/overflow behavior at
// all anymore — see the clamp math below for how that's guaranteed safe
// rather than just hoped for.
//
// Pool panel sits directly below the title, above the slots — not
// between the slots and controls. Opening/closing edit mode then only
// ever inserts/removes this one block in a single spot, rather than
// making the slots row itself shift position too (which the previous
// row order did — pool panel used to sit *below* the slots, so toggling
// edit mode moved both the pool panel's own space *and* pushed the slots'
// neighbor, the controls row, down twice-removed). One block appearing/
// disappearing in one place reads as calmer than that.
//
// `@container` moves to an inner wrapper (not the fixed root) deliberately:
// once the root is `position:fixed inset-x-0`, its own inline-size becomes
// the raw viewport width, which would silently shift the `@min-[480px]`
// breakpoint below relative to what it measured back when this box was
// laid out in-flow inside the page's own max-w-[1280px] wrapper. Keeping
// that same max-w/mx-auto treatment on the inner @container element keeps
// the breakpoint meaning what it always has.
//
// The pool panel (Level/Sort + TagPoolBody, which itself owns
// SectionTabStrip + the chip area) is always mounted, never conditionally
// rendered — toggled via max-h-0 overflow-hidden keyed off `editMode`, the
// same trick the retired TagPoolRecommendationsPanel used for tab-
// switching, generalized from two tab keys to one boolean. This is
// required, not stylistic: TagPoolBody's own activeSectionKey state and
// every ScrollFadeArea scroll position inside it have no persistence
// outside the live DOM, so unmounting this subtree on every close would
// reset both every time — see TagPoolBody.tsx's own top comment, unchanged
// from before, for why it already relies on exactly this guarantee.
//
// Esc, click-outside, and the resize handle all work at every breakpoint —
// none of the three is gated to desktop/pointer specifically.

// Combined height of the Level/Sort row + SectionTabStrip + the gaps
// between them and the chip area, inside the pool panel — subtracted from
// the user's chosen pool-panel height before it's passed down as
// TagPoolBody's chipAreaHeightPx, so the panel's *total* rendered height
// (filters + tabs + chips) matches what was actually dragged to, rather
// than the chip area alone matching it with filters/tabs added on top.
// Measured live against the real rendered component (filters row 85px,
// wraps to 2 lines — Level then Sort — below ~480px container width; +8px
// mb-md gap to TagPoolBody; +12px TagPoolBody's own internal STRIP_GAP;
// +30px SectionTabStrip = 135px total); retune by hand if
// LevelSelector/SortSelect/SectionTabStrip's own heights, wrap behavior,
// or any of these gaps change.
const FILTERS_AND_TABS_HEIGHT = 135;
// Floor for the chip area specifically, independent of POOL_HEIGHT_MIN
// (which bounds the *pool panel's* total height) — guards against
// FILTERS_AND_TABS_HEIGHT ever producing a negative or unusably tiny chip
// area if the two constants drift out of sync.
const CHIP_AREA_MIN = 60;
export function MixerBar({
  slots,
  dragOverIndex,
  minMatch,
  lockedLabel,
  filledCount,
  onSlotDragOver,
  onSlotDragLeave,
  onSlotDrop,
  onSlotClick,
  onSetMatch,
  onRandomTags,
  onClearSlots,
  onRecommend,
  error,
  editMode,
  onOpenEditMode,
  onCloseEditMode,
  allTags,
  selectedTags,
  totalSeriesCount,
  onLevelChange,
  onChipToggle,
}: MixerBarProps) {
  // Read-path/write-path for level intentionally differ: read live via
  // useLevel() here (matching how RecommendationsBody/TagPoolBody already
  // read tagPoolPrefs directly rather than via prop), but the *setter*
  // still has to reach back into KonomiApp's pruneTags cascade, so that
  // direction stays a prop. Not an inconsistency — two different concerns.
  const level = useLevel();
  const sort = useSort();

  // Tapping an empty slot opens edit mode instead of the no-op CLEAR_SLOT
  // dispatch it used to trigger; a filled slot still clears as before. This
  // decision has to live here (not in TagSlot or the reducer) since "open
  // edit mode" is UI state the reducer deliberately doesn't own.
  function handleSlotClick(index: number) {
    if (slots[index]) {
      onSlotClick(index);
    } else {
      onOpenEditMode();
    }
  }

  const barRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Esc and click-outside close edit mode on every device — mobile,
  // desktop, all of them, not gated to any one input type. No explicit
  // pointer/viewport check is needed either way: a real Esc keypress or an
  // outside click/tap both naturally produce the browser events this
  // listens for regardless of device. A ref for the close callback (not a
  // dependency) keeps this from re-subscribing on every MixerBar
  // re-render — with slots/dragOverIndex among the props, that would mean
  // every dragover tick while dragging a chip, not just real edit-mode
  // toggles.
  const onCloseEditModeRef = useRef(onCloseEditMode);
  useEffect(() => {
    onCloseEditModeRef.current = onCloseEditMode;
  });

  useEffect(() => {
    if (!editMode) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseEditModeRef.current();
    }
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (barRef.current?.contains(target)) return;
      // Any click inside the main page content column (theme switcher,
      // results header/Clear, every result card — tags, swap/lock, flip)
      // has its own meaningful action and shouldn't also close edit mode
      // as a side effect — only a click truly outside both this bar and
      // that whole column (the page's own background/gutters) counts as
      // "outside" here. See KonomiApp.tsx's data-konomi-content comment.
      const mainContent = document.querySelector("[data-konomi-content]");
      if (mainContent?.contains(target)) return;
      onCloseEditModeRef.current();
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [editMode]);

  // Visually modal, not behaviorally trapped (no Tab-cycle constraint) —
  // an accepted v1 gap, see DESIGN_SYSTEM.md. This still moves focus in on
  // open and back to whatever triggered it on close, which is the cheap,
  // uncontroversial half of dialog focus management.
  useEffect(() => {
    if (editMode) {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      dialogRef.current?.focus();
    } else {
      previouslyFocused.current?.focus();
    }
  }, [editMode]);

  // Desktop drag-resize for the pool panel — see tagPoolPrefs.ts for the
  // persistence/clamping half of this. `dragHeightPx` is live-drag-only
  // (component state, not persisted) so the panel tracks the pointer
  // smoothly; the committed value is written to localStorage once on
  // release, not on every mousemove.
  const persistedHeightPx = usePoolPanelHeight();
  const [dragHeightPx, setDragHeightPx] = useState<number | null>(null);
  // "50% of the current viewport" — only meant to establish where a
  // first-ever open lands (not a continuously-tracked live value; that
  // would make the panel silently change size mid-session with no drag
  // involved, contradicting "only the handle changes this"), so this
  // never needs to update again after its first real read. See
  // useDefaultPoolPanelHeight's own comment in tagPoolPrefs.ts for why
  // that first read has to go through useSyncExternalStore rather than a
  // plain `useState(() => window.innerHeight * 0.5)` lazy initializer —
  // the latter was tried first and produced a real hydration mismatch,
  // not just a hoped-for non-issue.
  const defaultPoolHeightPx = useDefaultPoolPanelHeight();
  // The viewport-dependent ceiling clampPoolPanelHeight bounds against —
  // read via its own hook (not inline `window.innerHeight` math) for the
  // same hydration-safety reason useDefaultPoolPanelHeight exists: see
  // usePoolPanelMaxHeight's own comment in tagPoolPrefs.ts.
  const poolPanelMaxHeight = usePoolPanelMaxHeight();
  // clampPoolPanelHeight applies uniformly to every source (default,
  // persisted, or actively dragging) — one clamp, not "clamp the persisted
  // value on read, then separately clamp drags" — so the guarantee (fixed
  // rows are never pushed below the fold) holds regardless of where this
  // number came from.
  const effectiveHeightPx = clampPoolPanelHeight(dragHeightPx ?? persistedHeightPx ?? defaultPoolHeightPx, poolPanelMaxHeight);
  // Reduced by the space Level/Sort + SectionTabStrip need, so the pool
  // panel's *total* rendered height (filters + tabs + chips) matches
  // effectiveHeightPx, rather than the chip area alone matching it with
  // filters/tabs added on top of that. See TagPoolBody's chipAreaHeightPx
  // doc comment.
  const chipAreaHeightPx = Math.max(CHIP_AREA_MIN, effectiveHeightPx - FILTERS_AND_TABS_HEIGHT);

  // Mouse AND touch — this has to work at every breakpoint, not just
  // desktop/pointer. Mirrors the same dual mouse+touch handling
  // ScrollFadeArea's own press-and-hold arrows already use, rather than
  // introducing a new (e.g. Pointer Events) pattern for just this one
  // control.
  function handleResizeStart(e: React.MouseEvent | React.TouchEvent) {
    const startHeight = effectiveHeightPx;
    const startY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const liveHeightRef = { current: startHeight };
    function handleMove(ev: MouseEvent | TouchEvent) {
      // preventDefault on the touch path only: a touch-drag on this handle
      // must not also scroll the page behind it, the way a native
      // vertical swipe normally would. touch-none (className below)
      // already tells the browser not to generate its own default touch
      // scrolling for this element, but the listener itself still needs
      // { passive: false } for preventDefault to actually take effect.
      const clientY = "touches" in ev ? ev.touches[0].clientY : ev.clientY;
      if ("touches" in ev) ev.preventDefault();
      // Dragging up (finger/mouse Y decreases) grows the panel — matches
      // the physical "pull the sheet's ceiling up to make it taller"
      // model. The handle itself sits above the title row, but what it
      // actually resizes is still just the pool panel: title/slots/
      // controls are fixed, so growing the *total* bar can only ever be
      // absorbed by the one flexible region.
      const delta = startY - clientY;
      const next = clampPoolPanelHeight(startHeight + delta, poolPanelMaxHeight);
      liveHeightRef.current = next;
      setDragHeightPx(next);
    }
    function handleEnd() {
      setPoolPanelHeightPref(liveHeightRef.current);
      setDragHeightPx(null);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchend", handleEnd);
    }
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchend", handleEnd);
  }

  return (
    <div
      ref={barRef}
      className={[
        // Transparent positioning wrapper only — no bg/border/shadow here
        // anymore, those live on the capped card below. px-[var(--space-2xl)]
        // still lives here (not on the max-w-[1280px] card below, and not
        // both) for the same reason it always has: it has to mirror
        // KonomiApp's own root-div-then-max-w structure exactly (padding
        // applied *before* the max-w box centers within it, never padding
        // *inside* an already-centered max-w box) or the two columns'
        // left/right edges only coincidentally match below ~1328px viewport
        // width and silently diverge by a full 24px above it, once the
        // page's own max-w box starts centering with margin beyond the
        // root's padding instead of just filling it. Confirmed live: at
        // 1400px this was a real, visible mismatch, not a false concern —
        // see DESIGN_SYSTEM.md's "MixerBar" section.
        //
        // pb-[var(--space-2xl)] is new: the bottom gutter that lets page
        // background show *below* the card too, now that the card is a
        // contained floating object rather than flush-to-viewport-bottom
        // full-bleed chrome. Matches KonomiApp's own pt-[var(--space-2xl)]
        // at the top of the page — same token, so the gap below the
        // floating card mirrors the gap above the masthead. Flat at every
        // breakpoint, same reasoning as px above.
        //
        // No overflow/max-h here at all, in either mode — title, slots,
        // and controls must never scroll, and the pool panel's own height
        // is already clamped (clampPoolPanelHeight) so the whole bar can
        // never exceed the viewport in the first place. See this file's
        // top comment.
        "fixed inset-x-0 bottom-0 z-[var(--z-overlay)] px-[var(--space-2xl)] pb-[var(--space-2xl)]",
      ].join(" ")}
    >
      <div
        className={[
          // The visible floating card — capped width, centered, matching
          // the app's other card chrome (square corners, standard border,
          // hard offset shadow). elev-4 matches ResultCard's card-level
          // elevation, not Masthead's elev-5 — Masthead's heavier shadow is
          // paired with its one-off rotate flourish, not the app's default
          // "flat card" treatment this bar should match instead.
          //
          // @container stays on this box, not the transparent wrapper
          // above — see this file's top comment for why (measuring the raw
          // viewport width instead of this capped width would silently
          // shift the @min-[480px] breakpoint below).
          //
          // px here is new and *additional* to the wrapper's own
          // px-[var(--space-2xl)] above — this box's content now needs its
          // own breathing room from its own border, which the wrapper's
          // padding no longer provides now that the border lives here
          // instead of on the wrapper. space-2xl (24px) — the standard card
          // padding this app already uses (Masthead's own px-[var(--space-2xl)])
          // — not a smaller mobile-specific value: a couple of earlier
          // passes tried shrinking this (down to space-lg, even space-xs)
          // specifically to avoid tipping the controls row's wrap at 390px
          // from 2 lines to 3, but real, standard card padding (in both
          // browse and edit mode alike, same box) matters more than
          // preserving the exact old wrap count.
          //
          // Deliberately flat at every breakpoint — no min-[993px] step to
          // a larger desktop value, unlike the alignment-critical wrapper
          // padding above (which has no choice — it must match KonomiApp's
          // root padding exactly at every width). This one stays constant
          // from smallest to largest viewport; revisit by hand later if it
          // reads as too generous on narrow mobile once tested live.
          //
          // The controls row wrapping to a 3rd line (Recommend drops below
          // Random/Clear) at 390px is an accepted, minor consequence of
          // this — see EDIT_MODE_FIXED_ROWS_HEIGHT and MIXER_BAR_SPACER,
          // both re-measured live against this.
          "@container max-w-[1280px] mx-auto px-[var(--space-2xl)] py-[var(--space-xl)] border-[length:var(--border-base)] border-[var(--ink)] bg-[var(--surface)] shadow-[var(--elev-4)]",
        ].join(" ")}
      >
        {/* Resize handle — above the title row, at the very top of the
            edit surface, not between the slots and the pool panel. Usable
            at every breakpoint (mouse *and* touch, see handleResizeStart) —
            an earlier version hid this below 993px, leaving mobile with no
            way to resize at all; that gate is gone. No keyboard equivalent
            yet (an accepted gap, same spirit as the no-focus-trap one —
            not solved in this pass). Dragging it only ever visibly resizes
            the pool panel below (title/slots/controls are fixed), but it's
            positioned as if it controls the whole sheet's height, since
            that's the more natural mental model for the user — "pull this
            to make the panel bigger." */}
        {editMode && (
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Drag to resize edit panel"
            onMouseDown={handleResizeStart}
            onTouchStart={handleResizeStart}
            className="flex items-center justify-center h-[14px] mb-[var(--space-sm)] cursor-ns-resize select-none touch-none"
          >
            <div className="w-[48px] h-[length:var(--border-thin)] bg-[var(--muted)]" />
          </div>
        )}

        {/* Row 1: title (mode-dependent) + filled-count badge, same shape
            the old Mixer section title row used. Fixed — never resizes,
            never scrolls. */}
        <div className="flex items-end justify-between mb-[var(--space-lg)]">
          <div className="flex items-center gap-[var(--space-md)]">
            <h2 className="font-display text-[length:var(--text-xl)] leading-[var(--leading-display)] m-0 uppercase tracking-[var(--tracking-sm)]">
              {editMode ? "Edit Tags" : "Mixer"}
            </h2>
            <span className="font-body font-bold leading-[var(--leading-tight)] text-[var(--primary)] text-[length:var(--text-md)]">
              {editMode ? "タグ編集" : "ミックス"}
            </span>
          </div>
          <span
            className={[
              "font-mono font-bold text-[length:var(--text-sm)] border-[length:var(--border-thin)] border-[var(--ink)] px-[var(--space-md)] py-[var(--space-xs)]",
              filledCount === 0 ? "bg-[var(--slot-empty)] text-[var(--disabled-text)]" : "bg-[var(--fill)] text-[var(--ink)]",
            ].join(" ")}
          >
            {lockedLabel}
          </span>
        </div>

        {/* Row 2: the pool panel — always mounted (see file-top comment).
            The only part of this bar that resizes or scrolls. Deliberately
            no explicit height + overflow-hidden on THIS wrapper — only the
            chip area inside TagPoolBody gets a fixed height
            (chipAreaHeightPx). This wrapper's natural height is just
            (Level/Sort row) + (TagPoolBody's own rendered height), which
            sums to ~effectiveHeightPx by construction since
            chipAreaHeightPx was already reduced by FILTERS_AND_TABS_HEIGHT
            below. Explicit height + overflow-hidden was tried here first
            and reverted: a flex-col container whose explicit height is
            *smaller* than its natural content height clips from the START
            (top) under overflow:hidden, not the end — confirmed live via
            getBoundingClientRect (the filters row measured *above* its own
            parent's top edge once clipped), which is exactly backwards
            from what's wanted here (filters/tabs should stay visible;
            chips are what should ever be the clipped/scrolled part).

            Sits directly below the header, above the slots — not between
            the slots and controls, where an earlier version placed it.
            Placing it here means opening/closing edit mode only ever
            inserts/removes this one block in a single spot (right after
            the header), rather than also shifting the slots row itself
            down and back — everything below the header before this panel
            existed (nothing) stays exactly where it was; only what comes
            after shifts, same as before, just with one less row appearing
            to "jump" past. */}
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Edit tags"
          tabIndex={-1}
          className={editMode ? "flex flex-col mb-[var(--space-lg)] outline-none" : "max-h-0 overflow-hidden"}
        >
          <div className="flex items-center gap-[var(--space-lg)] flex-wrap mb-[var(--space-md)]">
            <div className="flex items-center gap-[var(--space-sm)]">
              <TagIcon className="text-[var(--ink)]" />
              <LevelSelector value={level} onChange={onLevelChange} />
            </div>
            <div className="flex items-center gap-[var(--space-sm)]">
              <SortIcon className="text-[var(--ink)]" />
              <SortSelect value={sort} onChange={setSortPref} />
            </div>
          </div>
          <TagPoolBody
            allTags={allTags}
            selectedTags={selectedTags}
            totalSeriesCount={totalSeriesCount}
            level={level}
            onChipToggle={onChipToggle}
            chipAreaHeightPx={chipAreaHeightPx}
          />
        </div>

        {/* Row 3: the 3 tag slots. Fixed — never resizes, never scrolls,
            regardless of how tall the pool panel above gets dragged. */}
        <div className="flex gap-[var(--space-lg)] mb-[var(--space-lg)]">
          {slots.map((tag, index) => (
            <TagSlot
              key={index}
              index={index}
              tag={tag}
              isDragOver={dragOverIndex === index}
              onDragOver={onSlotDragOver}
              onDragLeave={onSlotDragLeave}
              onDrop={onSlotDrop}
              onClick={handleSlotClick}
            />
          ))}
        </div>

        {/* Row 4: MIN TAG MATCH, Random/Clear, Recommend — unchanged from
            the old Mixer controls row, plus Done (edit mode only). */}
        <div className="flex flex-wrap items-center gap-x-[var(--space-lg)] gap-y-[var(--space-lg)]">
          <div className="flex items-center gap-[var(--space-sm)]">
            <span className="hidden @min-[480px]:inline font-mono font-bold text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] uppercase whitespace-nowrap">
              Min Tag Match
            </span>
            <TagIcon className="text-[var(--ink)]" />
            <GreaterEqualIcon className="text-[var(--ink)]" />
            <MatchSelector value={minMatch} onChange={onSetMatch} />
          </div>
          <div className="ml-auto flex items-center gap-[var(--space-lg)]">
            <ActionButton variant="filled" onClick={onRandomTags}>
              Random ×3
            </ActionButton>
            <ActionButton variant="outline" onClick={onClearSlots}>
              Clear ✕
            </ActionButton>
          </div>
          <div className="hidden min-[993px]:block ml-[calc(var(--space-xl)_+_2px)] mr-[var(--space-xl)] w-[length:var(--border-thin)] h-[32px] bg-[var(--ink)]" />
          <div className="min-[686px]:max-[993px]:ml-[var(--space-lg)] max-[674px]:ml-auto">
            <RecommendButton filledCount={filledCount} onRecommend={onRecommend} error={error} />
          </div>
          {editMode && (
            <ActionButton variant="outline" onClick={onCloseEditMode}>
              Done ✓
            </ActionButton>
          )}
        </div>
      </div>
    </div>
  );
}

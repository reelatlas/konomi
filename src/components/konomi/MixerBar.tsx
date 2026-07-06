"use client";

import { useEffect, useRef, useState } from "react";
import type { LevelKey, MatchKey, MixerError, Slot, TagInfo } from "@/lib/konomi/types";
import { ActionButton } from "./ActionButton";
import { ArrowUpHalfIcon, ArrowUpIcon, CheckIcon, DiceIcon, EraserIcon, GreaterEqualIcon, ResetIcon, SortIcon, TagIcon, TagPoolIcon } from "./icons";
import { IconButton } from "./IconButton";
import { LevelSelector } from "./LevelSelector";
import { MatchSelector } from "./MatchSelector";
import { RecommendButton } from "./RecommendButton";
import { ScrollFadeArea } from "./ScrollFadeArea";
import { SortSelect } from "./SortSelect";
import {
  clampPoolPanelHeight,
  EDIT_MODE_FIXED_ROWS_HEIGHT,
  POOL_HEIGHT_MIN,
  setPoolPanelHeightPref,
  setSortPref,
  useLevel,
  usePoolPanelHeight,
  usePoolPanelMaxHeight,
  useSort,
} from "./tagPoolPrefs";
import { TagPoolBody } from "./TagPoolBody";
import { TagSlot } from "./TagSlot";
import { TitleWithSubtitle } from "./TitleWithSubtitle";

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

// Combined height of SectionTabStrip + the gap above it inside the pool
// panel — subtracted from the user's chosen pool-panel height before it's
// passed down as TagPoolBody's chipAreaHeightPx, so the panel's *total*
// rendered height (tabs + chips) matches what was actually dragged to,
// rather than the chip area alone matching it with tabs added on top.
// Named TABS_HEIGHT, not FILTERS_AND_TABS_HEIGHT: Level/Sort used to live
// in this same pool panel and count toward this constant (135px total,
// filters row + gaps + tabs) — they moved up into Row 1 above (always
// visible now, not edit-mode-only; see that row's own comment), so this is
// just TagPoolBody's own internal STRIP_GAP (12px) + SectionTabStrip
// (30px) = 42px now. Retune by hand if TagPoolBody's own STRIP_GAP or
// SectionTabStrip's height changes.
const TABS_HEIGHT = 42;
// Floor for the chip area specifically, independent of POOL_HEIGHT_MIN
// (which bounds the *pool panel's* total height) — guards against
// TABS_HEIGHT ever producing a negative or unusably tiny chip
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
  // The Tag Density/Sort filters' own ScrollFadeArea, in Row 1 — outside
  // dialogRef (which only wraps the pool panel below). Needed so
  // blockScrollThrough's own dialogRef exemption (see that effect) can be
  // extended to this second scrollable area too; without it, a genuine
  // trackpad/wheel horizontal scroll gesture here gets preventDefault()'d
  // by that handler before it ever reaches this area's native overflow-x
  // scrolling — confirmed live as a real bug: only the arrow buttons (a
  // separate, non-wheel click→scrollBy path) worked, trackpad swipe didn't.
  const filtersScrollRef = useRef<HTMLDivElement>(null);
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

  // Wheel/touch scroll anywhere over this bar — collapsed or expanded,
  // desktop or mobile — must never fall through to scroll the page behind
  // it: this bar reads as its own fixed surface sitting on top of the
  // page, not a transparent window onto it scrolling underneath. The one
  // exception is the pool panel's own chip area (TagPoolBody's
  // ScrollFadeArea, inside dialogRef), which must keep scrolling
  // internally exactly as before — dialogRef.contains(target) is that
  // exclusion, checked once here rather than duplicated per gesture type.
  //
  // Row 1's own filters ScrollFadeArea (filtersScrollRef, Tag Density/Sort)
  // needs a second, narrower exclusion — narrower because unlike dialogRef,
  // it isn't a modal surface with nothing of its own below it; it's a thin
  // strip sitting directly above page content, so only a genuinely
  // horizontal gesture should be let through. A vertical gesture over it
  // must still fall through to preventDefault below, exactly like anywhere
  // else on the bar — otherwise it'd scroll-chain to the page, the same
  // leak this whole handler exists to plug. Direction is derived, not
  // assumed: WheelEvent carries deltaX/deltaY directly, but TouchEvent's
  // touchmove doesn't, so the touch case tracks the gesture's start point
  // (touchstart, below) and locks an axis off the first touchmove that
  // clears a small noise threshold, holding that lock for the rest of the
  // gesture rather than re-deciding every event (a gesture that starts
  // diagonal would otherwise flip between "let through" and "block" as it
  // settles).
  //
  // Both wheel and touchmove are native, non-passive addEventListener
  // calls, not JSX onWheel/onTouchMove props — confirmed live this is
  // required, not just extra caution: React registers its own delegated
  // listener for *both* event types as passive by default (a deliberate
  // perf default matching browser guidance, since most handlers for
  // either never call preventDefault), so a JSX prop's preventDefault()
  // call is silently a no-op regardless of what the synthetic layer built
  // on top of it tries to do — an actual console error
  // ("Unable to preventDefault inside passive event listener invocation")
  // the first time this was tried as plain onWheel/onTouchMove props. The
  // resize handle above already had to work around the identical gotcha
  // for its own touchmove handling, for the same reason. Always active
  // (not gated to editMode) since browse mode's collapsed bar has the same
  // "don't let scroll leak to the page" expectation as the expanded one —
  // there's just nothing inside dialogRef to exclude yet in that state
  // (it's max-h-0).
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    let touchStart: { x: number; y: number } | null = null;
    let touchAxis: "horizontal" | "vertical" | null = null;

    function handleTouchStart(e: TouchEvent) {
      const target = e.target as Node;
      if (filtersScrollRef.current?.contains(target)) {
        const t = e.touches[0];
        touchStart = { x: t.clientX, y: t.clientY };
        touchAxis = null;
      } else {
        touchStart = null;
        touchAxis = null;
      }
    }

    function blockScrollThrough(e: WheelEvent | TouchEvent) {
      const target = e.target as Node;
      if (dialogRef.current?.contains(target)) return;

      if (filtersScrollRef.current?.contains(target)) {
        if (e instanceof WheelEvent) {
          if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        } else {
          const t = e.touches[0];
          if (touchAxis === null && touchStart) {
            const dx = t.clientX - touchStart.x;
            const dy = t.clientY - touchStart.y;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
              touchAxis = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
            }
          }
          if (touchAxis === "horizontal") return;
        }
      }

      e.preventDefault();
    }
    bar.addEventListener("wheel", blockScrollThrough, { passive: false });
    bar.addEventListener("touchstart", handleTouchStart, { passive: true });
    bar.addEventListener("touchmove", blockScrollThrough, { passive: false });
    return () => {
      bar.removeEventListener("wheel", blockScrollThrough);
      bar.removeEventListener("touchstart", handleTouchStart);
      bar.removeEventListener("touchmove", blockScrollThrough);
    };
  }, []);

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
  // First-ever open (before the user has ever dragged) lands at
  // POOL_HEIGHT_MIN — the same floor a drag could take it to — so the
  // sheet reads as "already at minimum, expand if you want more" rather
  // than opening pre-expanded. A plain constant, not a hook: see its own
  // comment in tagPoolPrefs.ts.
  const defaultPoolHeightPx = POOL_HEIGHT_MIN;
  // Live-measured height of everything in the edit sheet that ISN'T the
  // pool panel (resize handle, title/slots/controls rows, card border +
  // padding, the wrapper's bottom gutter) at the CURRENT breakpoint —
  // replaces a single hardcoded worst-case constant (still kept as
  // EDIT_MODE_FIXED_ROWS_HEIGHT, used only as the bootstrap value below
  // until the first real measurement lands) so the resize ceiling reflects
  // each breakpoint's real row heights instead of always reserving
  // mobile's tallest 3-line-wrap case, which left desktop with ~200px of
  // dead space it could never grow into. Reads barRef and dialogRef's
  // (the pool panel's own wrapper, already used for focus/scroll above)
  // *actual rendered heights* straight from the DOM inside one measure
  // callback, rather than diffing against a React-state copy of the pool
  // panel's height — a ref synced from effectiveHeightPx via a second
  // effect was tried first and lost a mount-order race (whichever effect
  // React happened to flush first saw a stale value), confirmed live as a
  // real bug: desktop capped the sheet ~100px short of its true ceiling on
  // the very first resize after opening. Reading both elements' current
  // getBoundingClientRect() together sidesteps that ordering entirely —
  // nothing here depends on which render or effect ran last.
  const [fixedOverheadPx, setFixedOverheadPx] = useState<number | null>(null);
  useEffect(() => {
    if (!editMode) return;
    const bar = barRef.current;
    const dialog = dialogRef.current;
    if (!bar || !dialog) return;
    function measure() {
      const overhead = bar!.getBoundingClientRect().height - dialog!.getBoundingClientRect().height;
      setFixedOverheadPx(Math.max(0, overhead));
    }
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    observer.observe(dialog);
    measure();
    return () => observer.disconnect();
  }, [editMode]);
  // The viewport-dependent ceiling clampPoolPanelHeight bounds against —
  // read via its own hook (not inline `window.innerHeight` math) for the
  // same hydration-safety reason described in usePoolPanelMaxHeight's own
  // comment in tagPoolPrefs.ts.
  const poolPanelMaxHeight = usePoolPanelMaxHeight(fixedOverheadPx ?? EDIT_MODE_FIXED_ROWS_HEIGHT);
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
  const chipAreaHeightPx = Math.max(CHIP_AREA_MIN, effectiveHeightPx - TABS_HEIGHT);

  // Quick-resize buttons in the resize-handle row — 50%/100% are both
  // fractions of the SAME reference, poolPanelMaxHeight (the live-measured
  // ceiling the drag handle itself already respects), not the raw
  // viewport — one consistent basis for the pair rather than two different
  // ones. Clears any in-flight drag too, not just the persisted value, so
  // this is a real, immediate jump even if triggered mid-drag.
  function handleSnapPoolHeight(fraction: number) {
    setDragHeightPx(null);
    setPoolPanelHeightPref(poolPanelMaxHeight * fraction);
  }
  function handleResetPoolHeight() {
    setDragHeightPx(null);
    setPoolPanelHeightPref(POOL_HEIGHT_MIN);
  }
  // Reset only shows once the panel has actually moved off its default —
  // checked against the live effectiveHeightPx (not just the last-saved
  // value) so it appears/disappears in real time during a manual drag too,
  // not only after the 50%/100% buttons or a drag-release. 1px tolerance
  // for float rounding, not an exact equality check.
  const isAtDefaultHeight = Math.abs(effectiveHeightPx - POOL_HEIGHT_MIN) <= 1;

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
            to make the panel bigger."

            The whole row is the drag target (onMouseDown/onTouchStart live
            here, on the outer div, not just around the centered indicator
            bar) — the quick-resize buttons on the right sit inside a
            sub-container that stops mousedown/touchstart from bubbling up
            to this row's own handlers, so clicking a button never also
            starts a resize-drag. size="sm" (30px, ResultCard's own icon
            size) deliberately smaller than this bar's standard size="md"
            icon buttons below — these are quick secondary shortcuts, not
            primary actions. Reset is conditionally rendered (only once the
            panel has actually left its default height — see
            isAtDefaultHeight above) since 50%/100% cover the "I want it
            bigger" cases on their own; Reset exists for "put it back,"
            which only means something once it's already been moved. */}
        {editMode && (
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Drag to resize edit panel"
            onMouseDown={handleResizeStart}
            onTouchStart={handleResizeStart}
            className="relative flex items-center justify-center h-[30px] mb-[var(--space-sm)] cursor-ns-resize select-none touch-none"
          >
            <div className="w-[48px] h-[length:var(--border-thin)] bg-[var(--muted)]" />
            <div
              className="absolute right-0 flex items-center gap-[var(--space-xs)] cursor-auto"
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <IconButton size="sm" title="Resize to 50%" aria-label="Resize to 50%" onClick={() => handleSnapPoolHeight(0.5)}>
                <ArrowUpHalfIcon className="text-[var(--ink)]" />
              </IconButton>
              <IconButton size="sm" title="Resize to 100%" aria-label="Resize to 100%" onClick={() => handleSnapPoolHeight(1)}>
                <ArrowUpIcon className="text-[var(--ink)]" />
              </IconButton>
              {!isAtDefaultHeight && (
                <IconButton
                  size="sm"
                  title="Reset pool panel to default height"
                  aria-label="Reset pool panel to default height"
                  onClick={handleResetPoolHeight}
                >
                  <ResetIcon className="text-[var(--ink)]" />
                </IconButton>
              )}
            </div>
          </div>
        )}

        {/* Row 1: title (mode-dependent) + filled-count badge grouped
            together on the left; Tag Density/Sort filters right-aligned,
            edit mode only — these moved here from the pool panel below,
            but only ever show alongside it (editMode gates both
            identically), unlike an earlier pass that made them always
            visible. Label + icon + selector for each filter mirrors Row 4's
            own "Min Tag Match" treatment exactly (same label classes, same
            hidden-below-@480px responsive behavior) — one consistent
            pattern for every labeled filter control in this bar, not a
            one-off for this row.

            Outer row keeps its original flex-wrap — title/filters still
            split to 2 lines at the same widths as before, unchanged. What's
            different is what happens on the filters' own line once that
            split has already happened: the two filter groups (Tag Density,
            Sort) used to flex-wrap onto a 3rd/4th line of their own at the
            very narrowest widths; now they scroll horizontally instead,
            reusing ScrollFadeArea the same plain way TagScrollArea does
            (no extra ARIA/tablist logic — unlike SectionTabStrip's, these
            are two independent controls, not a tab set, so there's nothing
            for roving-tabindex to manage). min-w-0 on the wrapping div is
            still needed even with the outer wrap restored — without it,
            this flex item defaults to min-width:auto and can't shrink
            below its own content's natural width, which would make
            ScrollFadeArea's overflow detection never trigger (confirmed
            live: an earlier version without it left the scroll area
            stretching the whole row wider instead of scrolling). */}
        <div className="flex items-end justify-between flex-wrap gap-x-[var(--space-lg)] gap-y-[var(--space-sm)] mb-[var(--space-lg)]">
          <div className="flex items-center gap-[var(--space-md)]">
            <TitleWithSubtitle title={editMode ? "Super Mixer" : "Mixer"} subtitle={editMode ? "ショウリュウケン" : "フレーバー"} />
            <span
              className={[
                "font-mono font-bold text-[length:var(--text-sm)] border-[length:var(--border-thin)] border-[var(--ink)] px-[var(--space-md)] py-[var(--space-xs)]",
                filledCount === 0 ? "bg-[var(--slot-empty)] text-[var(--disabled-text)]" : "bg-[var(--fill)] text-[var(--ink)]",
              ].join(" ")}
            >
              {lockedLabel}
            </span>
          </div>
          {editMode && (
            // -mb-[26px]/-mr-[4px] here exactly cancel the pb-[26px]/pr-[4px]
            // on the scrollable content below — pad-then-cancel, not
            // pad-and-let-grow (ResultsHeader's min-h fix used the latter,
            // correctly, since that row had no alignment to protect; this
            // one does: Row 1's items-end bottom-aligns this wrapper against
            // the title, and letting the padding show through here inflated
            // this wrapper's own box by the same 26px/4px, which visibly
            // dropped the *visible* filter controls below the title's own
            // baseline even though the boxes' bottoms technically still
            // lined up — confirmed live: 62.5px wrapper height vs the
            // title's 30px). Applying the negative margin out here, not on
            // the padded div itself, is what makes this work — canceling it
            // on the *same* element that has the padding would also shrink
            // ScrollFadeArea's own internal viewport back down, reopening
            // the exact clipping bug the padding exists to fix. Net effect:
            // zero extra row space from Row 1's perspective, matching how
            // every other hover-subtext in this app (ThemeSwitcher,
            // LevelSelector elsewhere) already costs nothing — the padding
            // only ever mattered to ScrollFadeArea's own internal
            // overflow-hidden boundary, never to this outer layout.
            <div ref={filtersScrollRef} className="min-w-0 w-fit -mb-[26px] -mr-[4px]">
              <ScrollFadeArea orientation="horizontal" scrollStep={140} fadeSize={12}>
                {/* pb-[26px]/pr-[4px]: ScrollFadeArea's horizontal viewport
                    is unconditionally overflow-y-hidden — with
                    LevelSelector/SortSelect now living inside it (a genuinely
                    new usage; every prior ScrollFadeArea caller's content
                    had nothing bleeding past its own box), their
                    shadow-[var(--elev-2)] (3px right/bottom bleed) and
                    LevelSelector's own absolute hover-subtext hint (further
                    below, past the shadow) both started getting hard-clipped
                    instead of just visually fading — same root cause
                    DESIGN_SYSTEM.md already documents for the results
                    carousel's card shadows. This padding is canceled by an
                    equal negative margin on the outer wrapper above (not
                    "let it grow" — see that comment) so it costs nothing
                    from Row 1's perspective. 26px covers the hover-subtext's
                    worst case (control bottom + mt-space-sm + its own
                    text-xs line height) — not pixel-exact, and that's fine
                    per explicit request: visible now, perfect spacing is a
                    later triage, not a blocker. 4px covers the shadow's 3px
                    bleed at the scrollable content's trailing edge. */}
                <div className="flex items-center gap-[var(--space-lg)] flex-nowrap pb-[26px] pr-[4px]">
                  <div className="flex items-center gap-[var(--space-sm)] shrink-0">
                    <span className="hidden @min-[480px]:inline font-mono font-bold text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] uppercase whitespace-nowrap">
                      Tag Density
                    </span>
                    <TagIcon className="text-[var(--ink)]" />
                    <LevelSelector value={level} onChange={onLevelChange} />
                  </div>
                  <div className="flex items-center gap-[var(--space-sm)] shrink-0">
                    <span className="hidden @min-[480px]:inline font-mono font-bold text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] uppercase whitespace-nowrap">
                      Sort
                    </span>
                    <SortIcon className="text-[var(--ink)]" />
                    <SortSelect value={sort} onChange={setSortPref} />
                  </div>
                </div>
              </ScrollFadeArea>
            </div>
          )}
        </div>

        {/* Row 2: the pool panel — always mounted (see file-top comment).
            The only part of this bar that resizes or scrolls. Deliberately
            no explicit height + overflow-hidden on THIS wrapper — only the
            chip area inside TagPoolBody gets a fixed height
            (chipAreaHeightPx). This wrapper's natural height is just
            TagPoolBody's own rendered height, which sums to
            ~effectiveHeightPx by construction since chipAreaHeightPx was
            already reduced by TABS_HEIGHT below (Level/Sort used to live in
            here too and count toward that reduction — they moved up into
            Row 1 above, always-visible now instead of edit-mode-only, so
            this panel is just TagPoolBody directly). Explicit height +
            overflow-hidden was tried here first and reverted: a flex-col
            container whose explicit height is *smaller* than its natural
            content height clips from the START (top) under overflow:hidden,
            not the end — confirmed live via getBoundingClientRect (the tab
            strip measured *above* its own parent's top edge once clipped),
            which is exactly backwards from what's wanted here (tabs should
            stay visible; chips are what should ever be the clipped/scrolled
            part).

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
            the old Mixer controls row — plus a persistent Tag Pool
            open/close toggle, replacing both the old edit-mode-only
            "Done ✓" button here and the standalone "+ Tag Pool" affordance
            that used to sit in the page's main content column (removed
            from KonomiApp.tsx — see its own git history). One button now
            covers both directions: closed state opens edit mode (same as
            tapping an empty slot), open state closes it, same as Done
            always did. Random/Clear/this toggle are icon-only IconButtons
            now (TagPoolIcon/CheckIcon here) — RECOMMEND is the one control in
            this row still a labeled text button, deliberately: it's the
            hero action, not icon-ified alongside the others. */}
        <div className="flex flex-wrap items-center gap-x-[var(--space-lg)] gap-y-[var(--space-lg)]">
          <div className="flex items-center gap-[var(--space-sm)]">
            <span className="hidden @min-[480px]:inline font-mono font-bold text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] uppercase whitespace-nowrap">
              Min Tag Match
            </span>
            {/* Dropped below max-[474px] (the same width this row's own
                Tag Pool+RECOMMEND wrap threshold uses) only — GreaterEqualIcon
                (≥) is what actually communicates "minimum match," this tag
                glyph is just reinforcement, so it's the cheapest thing to
                give up first when space is genuinely tight. Kept at every
                wider breakpoint, unchanged. */}
            <TagIcon className="max-[474px]:hidden text-[var(--ink)]" />
            <GreaterEqualIcon className="text-[var(--ink)]" />
            <MatchSelector value={minMatch} onChange={onSetMatch} />
          </div>
          {/* Random/Clear render as icon buttons below min-[993px] (the
              same breakpoint the divider right after this group already
              disappears at — reusing it, not inventing a new number, keeps
              "not enough room for the full desktop layout" meaning one
              thing everywhere in this row) and as the original ActionButton
              text buttons at 993px and up — icons exist specifically to
              conserve horizontal space at narrower widths; at the widest
              tier there's room to spare, so the more self-explanatory
              labeled buttons are what should show. Two full sets rendered,
              each hidden/shown via the same breakpoint rather than one
              set whose content swaps, so neither form has to compromise
              its own markup to accommodate the other.
              size="md" + border="base" + shadow="elev-2" on the icon set
              matches ActionButton's own md rendered height/border/shadow
              exactly, so these read as the same button family as RECOMMEND
              (still a labeled ActionButton at every width, deliberately
              not icon-ified — hero action) whichever form is showing.
              backgroundColor on the icon buttons mirrors each one's
              ActionButton variant: Random is "filled" (bg-fill), Clear is
              "outline" (bg-transparent) — same distinction, both forms. */}
          <div className="ml-auto flex items-center gap-[var(--space-lg)]">
            <div className="min-[993px]:hidden flex items-center gap-[var(--space-lg)]">
              <IconButton
                size="md"
                border="base"
                shadow="elev-2"
                backgroundColor="var(--fill)"
                title="Random ×3"
                aria-label="Random ×3"
                onClick={onRandomTags}
              >
                <DiceIcon className="text-[var(--ink)]" />
              </IconButton>
              <IconButton size="md" border="base" shadow="elev-2" backgroundColor="transparent" title="Clear" aria-label="Clear" onClick={onClearSlots}>
                <EraserIcon className="text-[var(--ink)]" />
              </IconButton>
            </div>
            <div className="hidden min-[993px]:flex items-center gap-[var(--space-lg)]">
              <ActionButton variant="filled" onClick={onRandomTags}>
                Random ×3
              </ActionButton>
              <ActionButton variant="outline" onClick={onClearSlots}>
                Clear ✕
              </ActionButton>
            </div>
          </div>
          <div className="hidden min-[993px]:block ml-[calc(var(--space-xl)_+_2px)] mr-[var(--space-xl)] w-[length:var(--border-thin)] h-[32px] bg-[var(--ink)]" />
          {/* Tag Pool + RECOMMEND grouped in one shared flex wrapper, not
              two independent flex-wrap items — confirmed live this was a
              real bug otherwise: flex-wrap breaks strictly by available
              width per top-level item, with no concept of "keep these two
              together," so at some widths Tag Pool stayed on Random/Clear's
              line while RECOMMEND alone wrapped to the next one, splitting
              a pair that reads as one unit (Tag Pool opens the editor
              RECOMMEND then acts on). Nesting them in one wrapper makes the
              *pair* the flex-wrap unit — either both fit on the current
              line or both move to the next one together, never split apart
              or merged into Random/Clear's group.

              The wraps-alone right-alignment (`ml-auto`) threshold was
              674px, but that number went stale once RECOMMEND gained its
              own icon-only fallback below 640px (see RecommendButton.tsx) —
              the icon form is so much narrower that the row stopped
              needing to wrap into 2 lines at all through most of the old
              674-993 range, yet this wrapper's `ml-auto` was still keyed to
              674px and kept firing anyway. That's a real, confirmed-live
              bug, not a hypothetical: with the row genuinely back to one
              line but this `ml-auto` still active, it competed with Random/
              Clear's own `ml-auto` for the *same* line's leftover space —
              CSS splits available space evenly across every auto-margin
              sharing a line, so both groups visibly got pulled toward the
              row's center instead of docking at the right edge (same
              failure mode DESIGN_SYSTEM.md's "Divider and RECOMMEND-wrap
              thresholds" already documents for the pre-grouping version of
              this exact bug). Re-bisected live against the *current*
              (icon-Recommend) content: one line down to 474px, wraps at
              473px — that's the new number, replacing the stale 674.
              min-[686px]:max-[993px]:ml-[space-lg] (breathing room right
              after the divider disappears) is untouched — unaffected by
              the Recommend-icon change, still correct. */}
          <div className="flex items-center gap-[var(--space-lg)] min-[686px]:max-[993px]:ml-[var(--space-lg)] max-[474px]:ml-auto">
            <div>
              {/* min-[993px] icon-below/text-at-desktop split, same as
                  Random/Clear above. Icon-only in both states, not text in
                  one and icon in the other — TagPoolIcon (browse, "open the
                  pool") swaps for CheckIcon (edit mode, "close/confirm")
                  rather than falling back to a text button for Done, so the
                  icon form reads as one consistent icon button regardless
                  of mode; the text form below mirrors that with its own
                  "+ Tag Pool"/"Done ✓" swap, unchanged from before. */}
              <div className="min-[993px]:hidden">
                <IconButton
                  size="md"
                  border="base"
                  shadow="elev-2"
                  backgroundColor="transparent"
                  title={editMode ? "Done" : "Tag Pool"}
                  aria-label={editMode ? "Done" : "Tag Pool"}
                  onClick={editMode ? onCloseEditMode : onOpenEditMode}
                >
                  {editMode ? <CheckIcon className="text-[var(--ink)]" /> : <TagPoolIcon className="text-[var(--ink)]" />}
                </IconButton>
              </div>
              <div className="hidden min-[993px]:block">
                <ActionButton variant="outline" onClick={editMode ? onCloseEditMode : onOpenEditMode}>
                  {editMode ? "Done ✓" : "+ Tag Pool"}
                </ActionButton>
              </div>
            </div>
            <RecommendButton filledCount={filledCount} onRecommend={onRecommend} error={error} />
          </div>
        </div>
      </div>
    </div>
  );
}

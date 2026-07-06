"use client";

import { useEffect, useRef, useState } from "react";
import type { LevelKey, MatchKey, MixerError, Slot, TagInfo } from "@/lib/konomi/types";
import { ActionButton } from "./ActionButton";
import { ArrowDownIcon, ArrowUpHalfIcon, ArrowUpIcon, CheckIcon, DiceIcon, EraserIcon, GreaterEqualIcon, TagIcon, TagPoolIcon } from "./icons";
import { IconButton } from "./IconButton";
import { MatchSelector } from "./MatchSelector";
import { RecommendButton } from "./RecommendButton";
import { clampPoolPanelHeight, EDIT_MODE_FIXED_ROWS_HEIGHT, POOL_HEIGHT_MIN, setPoolPanelHeightPref, usePoolPanelHeight, usePoolPanelMaxHeight } from "./tagPoolPrefs";
import { TagPoolBody } from "./TagPoolBody";
import { TagSlot } from "./TagSlot";

interface MixerBarProps {
  slots: Slot[];
  dragOverIndex: number;
  minMatch: MatchKey;
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
// present in a compact "browse" form (slots, controls) that expands in
// place into a taller "edit" form instead of a second overlay replacing
// it. See DESIGN_SYSTEM.md's "MixerBar" section for the full rationale —
// this comment covers only the mechanics.
//
// No header row in either mode — no title, no JP subtitle, no filled-
// count badge. Both used to occupy their own Row 1 above the pool panel;
// removed entirely (not relocated) as a deliberate simplification, not an
// oversight. Level/Sort (Tag Density/Sort filters) moved down into
// TagPoolBody's own combined tabs+filters row instead of disappearing
// alongside the rest of that header — see TagPoolBody.tsx's own top
// comment for that row's responsive stacking behavior.
//
// Edit mode's row order, top to bottom: resize handle (desktop only) →
// pool panel → slots → controls. Slots and controls are FIXED — they
// never scroll, never resize, and never move, in either mode. The pool
// panel is the only part of this bar that ever changes size, and the
// only part that ever scrolls internally (via TagPoolBody's own
// ScrollFadeArea, unchanged). This is a hard invariant, not a preference:
// the bar's own outer container carries no scroll/overflow behavior at
// all anymore — see the clamp math below for how that's guaranteed safe
// rather than just hoped for.
//
// Pool panel sits directly above the slots — not between the slots and
// controls. Opening/closing edit mode then only ever inserts/removes this
// one block in a single spot, rather than making the slots row itself
// shift position too (which an earlier row order did — pool panel used
// to sit *below* the slots, so toggling edit mode moved both the pool
// panel's own space *and* pushed the slots' neighbor, the controls row,
// down twice-removed). One block appearing/disappearing in one place
// reads as calmer than that.
//
// `@container` moves to an inner wrapper (not the fixed root) deliberately:
// once the root is `position:fixed inset-x-0`, its own inline-size becomes
// the raw viewport width, which would silently shift the `@min-[480px]`
// breakpoint below (now inside TagPoolBody's filters, not this file)
// relative to what it measured back when this box was laid out in-flow
// inside the page's own max-w-[1280px] wrapper. Keeping that same
// max-w/mx-auto treatment on the inner @container element keeps the
// breakpoint meaning what it always has.
//
// The pool panel (TagPoolBody, which now owns its own combined
// SectionTabStrip + Level/Sort row, plus the chip area) is always
// mounted, never conditionally rendered — toggled via max-h-0
// overflow-hidden keyed off `editMode`, the same trick the retired
// TagPoolRecommendationsPanel used for tab-switching, generalized from
// two tab keys to one boolean. This is required, not stylistic:
// TagPoolBody's own activeSectionKey state and every ScrollFadeArea
// scroll position inside it have no persistence outside the live DOM, so
// unmounting this subtree on every close would reset both every time —
// see TagPoolBody.tsx's own top comment, unchanged from before, for why
// it already relies on exactly this guarantee.
//
// Esc, click-outside, and the resize handle all work at every breakpoint —
// none of the three is gated to desktop/pointer specifically.

export function MixerBar({
  slots,
  dragOverIndex,
  minMatch,
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

  // Wheel/touch scroll anywhere over this bar — collapsed or expanded,
  // desktop or mobile — must never fall through to scroll the page behind
  // it: this bar reads as its own fixed surface sitting on top of the
  // page, not a transparent window onto it scrolling underneath. The one
  // exception is the pool panel's own scrollable areas (TagPoolBody's
  // chip area, section tabs, and Level/Sort filters, all inside dialogRef),
  // which must keep scrolling internally exactly as before —
  // dialogRef.contains(target) is that exclusion, checked once here rather
  // than duplicated per gesture type or per scrollable area within it. A
  // narrower, direction-aware exclusion (only letting a genuinely
  // horizontal gesture through, so a vertical one still fell through to
  // preventDefault below) used to be needed specifically for the filters'
  // own ScrollFadeArea, back when it lived in this bar's own now-removed
  // header row — outside dialogRef, and so not covered by this blanket
  // exemption. Now that Level/Sort live inside TagPoolBody (see that
  // file), they're inside dialogRef's subtree like every other scrollable
  // area here, and the same blanket exemption already correctly covers
  // them — confirmed live, matching how SectionTabStrip's own horizontal
  // scroll already worked here without any direction-aware JS: each
  // ScrollFadeArea's own overscroll-contain (see that component) stops a
  // gesture from chaining past its own scroll bounds once native scroll
  // handles it, so there's nothing left for this handler to get wrong by
  // just exempting the whole dialog.
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
    function blockScrollThrough(e: WheelEvent | TouchEvent) {
      const target = e.target as Node;
      if (dialogRef.current?.contains(target)) return;
      e.preventDefault();
    }
    bar.addEventListener("wheel", blockScrollThrough, { passive: false });
    bar.addEventListener("touchmove", blockScrollThrough, { passive: false });
    return () => {
      bar.removeEventListener("wheel", blockScrollThrough);
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
  // Fixed, not measured — h-[30px] + mb-[var(--space-sm)] (6px), the whole
  // resize-handle row's own height. Unlike EDIT_MODE_FIXED_ROWS_HEIGHT this
  // never varies by breakpoint/content, so it's safe to hardcode rather
  // than measure.
  const RESIZE_HANDLE_ROW_HEIGHT = 36;
  // Whether the resize-handle row (drag target + 50%/100%/reset shortcuts)
  // is worth showing at all — hidden once poolPanelMaxHeight itself can't
  // clear POOL_HEIGHT_MIN, since at that point nothing the row offers
  // (dragging, snapping to a fraction) can move the panel anywhere
  // clampPoolPanelHeight wouldn't already force it to on its own; see that
  // function. Deliberately NOT `poolPanelMaxHeight > POOL_HEIGHT_MIN`
  // evaluated directly and used to gate the row's own mounting — that was
  // tried first and is a real, confirmed-live bug: fixedOverheadPx is
  // measured from bar/dialog's own rendered rects, which *include* this
  // row's height only while it's mounted, so unmounting it shrinks the
  // measured overhead by exactly RESIZE_HANDLE_ROW_HEIGHT, which raises
  // poolPanelMaxHeight back up, which can push the direct comparison back
  // over the threshold and remount the row — which re-measures the larger
  // overhead, drops the ceiling again, and unmounts it again, forever.
  // Settled during render (React's documented "you can call the setter
  // while rendering" escape hatch — see "Storing information from previous
  // renders" in the useState docs) rather than a useEffect: setState from
  // inside an effect body here would fire synchronously on every
  // poolPanelMaxHeight change, which is exactly the cascading-render shape
  // that pattern warns against, and this repo's lint config flags it. No
  // ref needed to detect "did poolPanelMaxHeight change" first, either —
  // the recomputation below is cheap enough to just run every render, and
  // the `next !== canShowResizeHandleRow` guard already prevents this from
  // looping: once the derived value agrees with the committed state,
  // setState is never called, so no further render is triggered. Each
  // candidate decision is judged against "what the ceiling would be if the
  // row were shown" — reconstructed by adding RESIZE_HANDLE_ROW_HEIGHT back
  // on top of poolPanelMaxHeight whenever the row is currently hidden
  // (since that measurement already excludes it) — rather than whatever
  // poolPanelMaxHeight happens to measure right after the row's last
  // mount-state flip, which is what was oscillating.
  const [canShowResizeHandleRow, setCanShowResizeHandleRow] = useState(true);
  const ceilingIfRowWereShown = canShowResizeHandleRow ? poolPanelMaxHeight : poolPanelMaxHeight - RESIZE_HANDLE_ROW_HEIGHT;
  const nextCanShowResizeHandleRow = ceilingIfRowWereShown > POOL_HEIGHT_MIN;
  if (nextCanShowResizeHandleRow !== canShowResizeHandleRow) {
    setCanShowResizeHandleRow(nextCanShowResizeHandleRow);
  }
  // clampPoolPanelHeight applies uniformly to every source (default,
  // persisted, or actively dragging) — one clamp, not "clamp the persisted
  // value on read, then separately clamp drags" — so the guarantee (fixed
  // rows are never pushed below the fold) holds regardless of where this
  // number came from.
  const effectiveHeightPx = clampPoolPanelHeight(dragHeightPx ?? persistedHeightPx ?? defaultPoolHeightPx, poolPanelMaxHeight);

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
  // 50%/100% only show when their own target is actually reachable — on a
  // short enough viewport, poolPanelMaxHeight itself shrinks small enough
  // that a fraction of it (half, for 50%; the whole ceiling, for 100%)
  // lands at or below POOL_HEIGHT_MIN, the floor clampPoolPanelHeight
  // already enforces on every source (default/persisted/dragged). Without
  // this check, the button would still be tappable but silently do the
  // same thing the floor already guarantees on its own — clamped straight
  // back up to POOL_HEIGHT_MIN, never actually landing at a visibly
  // distinct "half" or "full" — reading as broken rather than just
  // unreachable at this size. Both live (poolPanelMaxHeight is the
  // resize-reactive hook, not a one-time read), so they hide/reappear in
  // step with the same window resizes that make effectiveHeightPx itself
  // re-clamp.
  const canReachHalfHeight = poolPanelMaxHeight * 0.5 > POOL_HEIGHT_MIN;
  const canReachFullHeight = poolPanelMaxHeight > POOL_HEIGHT_MIN;
  // Same "don't show a control that would do nothing" rule as Reset above,
  // applied to 50%/100% themselves — hidden not just when unreachable but
  // also when the panel is already sitting at that exact target (dragged
  // there by hand, or already snapped via the button), reappearing the
  // moment a resize (drag, the other snap button, or the viewport ceiling
  // itself moving) takes it elsewhere. Same 1px float tolerance as
  // isAtDefaultHeight, same reasoning.
  const isAtHalfHeight = Math.abs(effectiveHeightPx - poolPanelMaxHeight * 0.5) <= 1;
  const isAtFullHeight = Math.abs(effectiveHeightPx - poolPanelMaxHeight) <= 1;

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
            which only means something once it's already been moved.

            Whole row gated on canShowResizeHandleRow too, not just editMode
            — once poolPanelMaxHeight drops to/below POOL_HEIGHT_MIN, the
            panel is pinned to that shrunken ceiling regardless of where
            this handle gets dragged to (clampPoolPanelHeight's floor can't
            win once it's Math.min'd against a lower ceiling — see that
            function), so the whole row — drag target and 50%/100%/reset
            shortcuts alike — stops doing anything. Hiding it back reclaims
            its own h-[30px] + mb-[var(--space-sm)] as a few extra px of
            headroom right when the sheet is most squeezed for it, rather
            than leaving a dead control sitting there taking up space.
            canShowResizeHandleRow, not poolPanelMaxHeight > POOL_HEIGHT_MIN
            evaluated directly — see that state's own comment above for why
            (a real, confirmed-live oscillation otherwise: hiding the row
            shrinks the very measurement its own visibility depends on). */}
        {editMode && canShowResizeHandleRow && (
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
              {canReachHalfHeight && !isAtHalfHeight && (
                <IconButton
                  size="sm"
                  border="none"
                  backgroundColor="transparent"
                  title="Resize to 50%"
                  aria-label="Resize to 50%"
                  onClick={() => handleSnapPoolHeight(0.5)}
                >
                  <ArrowUpHalfIcon className="text-[var(--muted)]" />
                </IconButton>
              )}
              {canReachFullHeight && !isAtFullHeight && (
                <IconButton
                  size="sm"
                  border="none"
                  backgroundColor="transparent"
                  title="Resize to 100%"
                  aria-label="Resize to 100%"
                  onClick={() => handleSnapPoolHeight(1)}
                >
                  <ArrowUpIcon className="text-[var(--muted)]" />
                </IconButton>
              )}
              {/* canReachFullHeight, not just !isAtDefaultHeight: once
                  poolPanelMaxHeight itself drops below POOL_HEIGHT_MIN,
                  clampPoolPanelHeight pins effectiveHeightPx to that
                  shrunken ceiling regardless of what's stored (see
                  clampPoolPanelHeight — Math.max(px, MIN) can't win once
                  MIN exceeds the ceiling it's then Math.min'd against), so
                  "not at default" stays true but Reset would write
                  POOL_HEIGHT_MIN and visibly change nothing — a dead
                  button in the exact same squeeze the 50%/100% buttons
                  above already hide themselves for. */}
              {!isAtDefaultHeight && canReachFullHeight && (
                <IconButton
                  size="sm"
                  border="none"
                  backgroundColor="transparent"
                  title="Reset pool panel to default height"
                  aria-label="Reset pool panel to default height"
                  onClick={handleResetPoolHeight}
                >
                  <ArrowDownIcon className="text-[var(--muted)]" />
                </IconButton>
              )}
            </div>
          </div>
        )}

        {/* Row 1 (formerly Row 2 — Row 1 was the title/badge/filters
            header, now removed entirely; see this file's own top comment):
            the pool panel — always mounted (see file-top comment). The
            only part of this bar that resizes or scrolls. Deliberately no
            explicit height + overflow-hidden on THIS wrapper — only the
            chip area inside TagPoolBody gets a fixed height, computed
            internally there now (poolPanelHeightPx in, chipAreaHeightPx
            derived — see TagPoolBody's own top comment for why that
            derivation moved out of this file). This wrapper's natural
            height is just TagPoolBody's own rendered height, which sums to
            ~effectiveHeightPx by construction. Explicit height +
            overflow-hidden was tried here first and reverted: a flex-col
            container whose explicit height is *smaller* than its natural
            content height clips from the START (top) under overflow:hidden,
            not the end — confirmed live via getBoundingClientRect (the tab
            strip measured *above* its own parent's top edge once clipped),
            which is exactly backwards from what's wanted here (tabs should
            stay visible; chips are what should ever be the clipped/scrolled
            part).

            Sits directly above the slots — not between the slots and
            controls, where an earlier version placed it. Placing it here
            means opening/closing edit mode only ever inserts/removes this
            one block in a single spot, rather than also shifting the
            slots row itself down and back. */}
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
            onLevelChange={onLevelChange}
            onChipToggle={onChipToggle}
            poolPanelHeightPx={effectiveHeightPx}
          />
        </div>

        {/* Row 2: the 3 tag slots. Fixed — never resizes, never scrolls,
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

        {/* Row 3: MIN TAG MATCH, Random/Clear, Recommend — unchanged from
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
              "outline" (bg-transparent) — same distinction, both forms.

              The label form now carries the same glyph too, label-then-
              icon, not label-only — both "Random ×3" and "Clear ✕" drop
              their trailing decorative glyph ("×3", "✕") in favor of the
              real DiceIcon/EraserIcon in the same spot, so each button
              reads "label, then the icon this same action collapses to
              below 993px" instead of carrying a redundant second symbol
              alongside the real one. */}
          <div className="ml-auto flex items-center gap-[var(--space-lg)]">
            <div className="min-[993px]:hidden flex items-center gap-[var(--space-lg)]">
              <IconButton
                size="md"
                border="base"
                shadow="elev-2"
                backgroundColor="var(--fill)"
                title="Random"
                aria-label="Random"
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
                <span className="inline-flex items-center gap-[var(--space-sm)]">
                  Random
                  <DiceIcon className="text-[var(--ink)]" />
                </span>
              </ActionButton>
              <ActionButton variant="outline" onClick={onClearSlots}>
                <span className="inline-flex items-center gap-[var(--space-sm)]">
                  Clear
                  <EraserIcon className="text-[var(--ink)]" />
                </span>
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
                  "+ Tag Pool"/"Done ✓" swap, unchanged from before.

                  Browse-mode label form only, not edit mode: "+ Tag Pool"
                  drops its decorative "+" and gains TagPoolIcon after the
                  text, label-then-icon like Random/Clear above — the same
                  glyph the icon-only form below 993px already uses, not a
                  new one just for this width. "Done ✓" is left exactly as
                  it was — explicitly NOT given the bigger CheckIcon
                  component alongside its label; that swap only happens in
                  the icon-only form, where CheckIcon *is* the whole
                  button's content rather than sitting beside text sized
                  for it. */}
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
                  {editMode ? (
                    "Done ✓"
                  ) : (
                    <span className="inline-flex items-center gap-[var(--space-sm)]">
                      Tag Pool
                      <TagPoolIcon className="text-[var(--ink)]" />
                    </span>
                  )}
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

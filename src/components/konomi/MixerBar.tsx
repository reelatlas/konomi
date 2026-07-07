"use client";

import { useEffect, useRef, useState } from "react";
import type { LevelKey, MatchKey, MixerError, Slot, TagInfo } from "@/lib/konomi/types";
import { ActionButton } from "./ActionButton";
import {
  ArrowDownIcon,
  ArrowUpHalfIcon,
  ArrowUpIcon,
  CheckIcon,
  DiceIcon,
  EraserIcon,
  GreaterEqualIcon,
  GripHorizontalIcon,
  SortIcon,
  TagIcon,
  TagPoolIcon,
} from "./icons";
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

// Formerly MixerSection — now the app's one mixer bar, always present in a
// compact "browse" form (slots, controls) that expands into a taller "edit"
// form that grows upward in place, instead of a second overlay replacing
// it. See DESIGN_SYSTEM.md's "MixerBar" section for the full rationale —
// this comment covers only the mechanics.
//
// Normal document flow, not position:fixed — the last section inside the
// page's own max-w-[1280px] mx-auto column (see KonomiApp.tsx), sized and
// framed as part of the header+card+mixer "fits one viewport" group rather
// than a floating dock pinned to the viewport bottom. This was un-pinned
// once already, reverted on explicit instruction, then re-approved with the
// edit-mode-growth design below specifically addressing what pinning used
// to guarantee for free: edit mode growing upward without ever pushing
// browse mode's own slots/controls out of place.
//
// One box, always — resize row, pool panel, slots, and controls are all
// ordinary children of the SAME bordered/shadowed element (cardRef, below),
// stacked in normal top-to-bottom flow, the same shape this bar had
// originally under position:fixed. Two other structures were tried and
// reverted before this one: `position:absolute` for the edit-mode content
// (border-color matching, shadow clip-path, and an explicit overlap each
// tried to hide the seam where it met the always-visible card, and each
// left a different artifact there — a hairline, a clipped-background band,
// a border notch — since two independently positioned/composited boxes
// meeting at a boundary is inherently seam-prone); then a flex-col-reverse
// + fixed-height + overflow-visible split (both boxes position:static, no
// compositing-layer risk, but still two separately decorated perimeters
// meeting at one edge — confirmed live to still show a border/shadow
// mismatch there). One box removes the boundary itself: nothing is drawn
// twice, so there's nothing to reconcile. See cardRef's own comment (in
// the component body below) for the marginTop mechanism that still lets
// it grow upward without moving slots/controls.
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
// never scroll, never resize, and never move, in either mode; they're
// what determines this bar's own normal-flow position and height, always.
// The pool panel is the only part of this bar that ever changes size, and
// the only part that ever scrolls internally (via TagPoolBody's own
// ScrollFadeArea, unchanged). This is a hard invariant, not a preference —
// see the clamp math below for how that's guaranteed safe rather than just
// hoped for.
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
// `@container` lives on cardRef itself now, the one box everything is a
// child of — LevelSelector/SortSelect's `@min-[480px]`/`@max-[352px]`
// queries inside the resize-handle row read this same context slots/
// controls would too, if they needed it.
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

  // Read directly (not threaded through TagPoolBody), same split as
  // onLevelChange below: LevelSelector/SortSelect now render here, in the
  // resize-handle row, not inside TagPoolBody — but TagPoolBody still reads
  // its own useLevel()/useSort() independently, to filter/sort the chips
  // that respond to these same values. Two independent reads of the same
  // preference store, not one passed down as a prop — the same pattern
  // TagPoolBody's own top comment already documents for level/sort.
  const level = useLevel();
  const sort = useSort();

  // cardRef is the one bordered/shadowed box — everything (resize row,
  // pool panel, slots, controls) is a normal child of it now. No more
  // separate boxes for "always visible" vs "edit-mode" content: every
  // earlier attempt to make two independently decorated boxes read as one
  // continuous shape at their shared edge (border-color matching, shadow
  // clip-path, a flex-col-reverse split) left a different artifact right
  // at that edge — a hairline seam, a clipped-background band, a border
  // notch — because there were always two separately painted perimeters
  // meeting at a boundary. One box has no boundary to meet at: its
  // border/shadow are drawn once, around whatever its actual total
  // content is, the same guarantee any other card in this app already
  // gets. See the marginTop mechanism below for how this box still grows
  // upward without pushing slots/controls out of place, now that its own
  // height genuinely changes with content instead of being masked behind
  // absolute positioning or a fixed-height overflow trick.
  const cardRef = useRef<HTMLDivElement>(null);
  // Wraps just the resize-handle row + pool panel — unstyled (no border/
  // padding/background of its own), purely so its own rendered height can
  // be measured in one place (see the effect below). Zero height in
  // browse mode (resize row isn't rendered, dialogRef is max-h-0), so the
  // marginTop it drives is correctly 0 there without any special-casing.
  const growableRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // The negative-margin technique that lets cardRef grow upward (edit
  // mode's extra content pushes its own top edge up) without ever moving
  // its own bottom edge (where slots/controls sit): cardRef's natural,
  // unshifted position in the page never changes (nothing before it in
  // the page depends on editMode), and its own height grows by exactly
  // growableRef's own height when editMode adds real content there.
  // Applying marginTop: -growableRef's-height shifts the *whole box* up
  // by that same amount — algebraically, its rendered bottom edge
  // (natural top + own height + marginTop) works out to natural top +
  // (slots + controls + border/padding), a quantity with no dependency
  // on growableRef's own height at all, so it's identical in both modes.
  // This is the same "bottom stays put, top grows upward" guarantee
  // position:fixed used to give this bar for free, reached through the
  // ordinary box model plus one measured number instead of a second
  // positioning scheme.
  //
  // That measured number is deliberately NOT "growableRef's current
  // height, read fresh via ResizeObserver on every change" — that was
  // tried first and confirmed live as a real bug: dragging the resize
  // handle visibly glitched, because every mousemove synchronously
  // updates dragHeightPx/effectiveHeightPx (React state, applied
  // immediately) while a *separate* ResizeObserver watching growableRef
  // only learns the resulting height back asynchronously, after the
  // browser lays it out — two independent updates per drag tick that
  // don't reliably land in the same commit, so the margin lagged one
  // frame behind the height it's supposed to cancel, every single tick.
  // Exactly the "JS measurement decides layout, which changes size,
  // which re-triggers the measurement" pattern this app has hit before
  // (see DESIGN_SYSTEM.md) — the fix here is the same one: stop letting
  // a ResizeObserver sit in the fast-changing path.
  //
  // Instead, this splits growableRef's own height into two parts: the
  // pool panel's own share, which is exactly effectiveHeightPx (already
  // synchronous React state — the *same* value driving the drag, updated
  // in the *same* render, no observer round-trip needed) — and
  // everything else in growableRef (the resize-handle row, if shown, and
  // dialogRef's own small margin), which is measured via ResizeObserver
  // as growableFixedOverheadPx below. That second part only actually
  // changes at real breakpoints (the resize row's own responsive wrap),
  // never during a plain height drag, so it staying a render behind is
  // never visibly wrong — the two terms below always add back up to
  // growableRef's true current height, computed synchronously with
  // effectiveHeightPx instead of waiting on it.
  const [growableFixedOverheadPx, setGrowableFixedOverheadPx] = useState(0);

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
      if (cardRef.current?.contains(target)) return;
      // Explicit allowlist, not "anywhere in the main content column" (an
      // earlier version excluded that whole column via a single
      // data-konomi-content ancestor check) — everything else in that
      // column (the results header text, empty space around the grid,
      // etc.) should close edit mode like any other outside click now;
      // only these specific controls, each with its own real action that
      // shouldn't also dismiss edit mode as a side effect, are exempt:
      // result cards (data-result-card on ResultCard.tsx's own <article> —
      // covers the card body, its lock/dice icon buttons, and its tag
      // chips in one shot, since all three are descendants of that same
      // element), the theme swatches (data-theme-switcher, ThemeSwitcher.tsx),
      // and the results Clear ✕ button (data-clear-results, ResultsHeader.tsx).
      // target is typed as Node (a mousedown's target can in principle be a
      // text node), but .closest() is Element-only — falls back to the
      // nearest element via parentElement for that case.
      const el = target instanceof Element ? target : (target as Node).parentElement;
      if (el?.closest("[data-result-card], [data-theme-switcher], [data-clear-results]")) return;
      onCloseEditModeRef.current();
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [editMode]);

  // The Tag Density/Sort filters' own ScrollFadeArea, in the resize-handle
  // row below — outside dialogRef (a sibling, not a descendant), so it
  // needs its own exclusion from blockScrollThrough below; see that
  // effect's own comment.
  const filtersScrollRef = useRef<HTMLDivElement>(null);

  // Wheel/touch scroll anywhere over this bar — collapsed or expanded,
  // desktop or mobile — must never fall through to scroll the page behind
  // it: hovering/touching this bar (or, in edit mode, the overlay it grows
  // above it) reads as interacting with a self-contained control surface,
  // not a transparent window onto the page scrolling underneath. Kept
  // unconditionally active (not just while the edit-mode overlay visually
  // covers content) since this bar's own non-scrollable rows (slots,
  // controls) never had a reason to let a stray wheel/touch gesture bleed
  // through to the page either, fixed or not. The one exception is the
  // pool panel's own scrollable areas (TagPoolBody's chip
  // area and section tabs, inside dialogRef), which must keep scrolling
  // internally exactly as before — dialogRef.contains(target) is that
  // exclusion, checked once here rather than duplicated per gesture type
  // or per scrollable area within it.
  //
  // The resize-handle row's own filters ScrollFadeArea (filtersScrollRef,
  // Tag Density/Sort) needs a second, narrower exclusion — narrower
  // because unlike dialogRef, it isn't a modal surface with nothing of its
  // own below it; it's a thin strip sitting directly above the pool panel,
  // so only a genuinely horizontal gesture should be let through. A
  // vertical gesture over it must still fall through to preventDefault
  // below, exactly like anywhere else on the bar — otherwise it'd
  // scroll-chain to the page, the same leak this whole handler exists to
  // plug. Direction is derived, not assumed: WheelEvent carries deltaX/
  // deltaY directly, but TouchEvent's touchmove doesn't, so the touch case
  // tracks the gesture's start point (touchstart, below) and locks an axis
  // off the first touchmove that clears a small noise threshold, holding
  // that lock for the rest of the gesture rather than re-deciding every
  // event (a gesture that starts diagonal would otherwise flip between
  // "let through" and "block" as it settles).
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
    const bar = cardRef.current;
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
  //
  // preventScroll: true on both calls — confirmed live as a real bug
  // without it: cardRef's own negative marginTop (see
  // growableFixedOverheadPx's comment) means dialogRef briefly renders
  // partially above the
  // viewport's own top edge the instant it mounts/becomes visible, before
  // the browser has any reason to know that's intentional. A plain
  // .focus() call's default behavior is to scroll whatever it focused
  // into view — the browser doesn't know the margin is deliberately
  // compensating for that box's own growth, only that the newly focused
  // element isn't fully visible, so it scrolled the page by exactly the
  // amount cardRef grew — which reads as this whole bar visibly jumping
  // on open, the exact "never moves" guarantee this file works so hard
  // to provide. slots/controls' own page position never actually
  // changed (confirmed via getBoundingClientRect diffed against the
  // page, not the viewport) — this was purely the browser's own focus-
  // scroll, not a layout bug.
  useEffect(() => {
    if (editMode) {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      dialogRef.current?.focus({ preventScroll: true });
    } else {
      previouslyFocused.current?.focus({ preventScroll: true });
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
  // pool panel (resize handle, card border + padding, slots/controls rows,
  // any dead space below the bar — see the effect below) at the CURRENT
  // breakpoint — replaces a single hardcoded worst-case constant (still
  // kept as EDIT_MODE_FIXED_ROWS_HEIGHT, used only as the bootstrap value
  // below until the first real measurement lands) so the resize ceiling
  // reflects each breakpoint's real row heights instead of always
  // reserving mobile's tallest 3-line-wrap case, which left desktop with
  // ~200px of dead space it could never grow into. Reads every relevant
  // element's *actual rendered* getBoundingClientRect() straight from the
  // DOM inside one measure callback, rather than diffing against a React-
  // state copy of the pool panel's height — a ref synced from
  // effectiveHeightPx via a second effect was tried first and lost a
  // mount-order race (whichever effect React happened to flush first saw a
  // stale value), confirmed live as a real bug: desktop capped the sheet
  // ~100px short of its true ceiling on the very first resize after
  // opening. Reading every element's current getBoundingClientRect()
  // together sidesteps that ordering entirely — nothing here depends on
  // which render or effect ran last.
  const [fixedOverheadPx, setFixedOverheadPx] = useState<number | null>(null);
  // card.height - dialog.height = everything in the edit sheet that ISN'T
  // the pool panel (resize row, slots, controls, cardRef's own border +
  // padding) — now a single subtraction since there's only one box, rather
  // than summing an overlay-region term and a card term separately.
  //
  // + surplusBelow accounts for a case that couldn't happen when this bar
  // was fixed to the viewport bottom (card.bottom was always exactly
  // window.innerHeight): now that the bar sits in normal flow, a tall
  // desktop viewport can leave real dead space *below* the mixer (the
  // "surplus goes to margins, never internal gaps" rule elsewhere in this
  // app's layout). That space isn't available for the pool panel to grow
  // into — it only grows upward from the mixer's own top edge — so
  // folding it into the overhead here correctly lowers the ceiling by
  // exactly that amount rather than overestimating how much room is
  // actually above the bar. Zero whenever the mixer's bottom already sits
  // at the viewport's own bottom edge (every case this measurement used
  // to cover).
  useEffect(() => {
    if (!editMode) return;
    const card = cardRef.current;
    const dialog = dialogRef.current;
    if (!card || !dialog) return;
    function measure() {
      const cardHeight = card!.getBoundingClientRect().height;
      const dialogHeight = dialog!.getBoundingClientRect().height;
      const surplusBelow = Math.max(0, window.innerHeight - card!.getBoundingClientRect().bottom);
      setFixedOverheadPx(Math.max(0, cardHeight - dialogHeight + surplusBelow));
    }
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    observer.observe(dialog);
    measure();
    // Surplus-below depends on window.innerHeight directly, which can
    // change (mobile chrome show/hide, orientation) without any observed
    // element's own size changing — a plain resize listener catches that.
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [editMode]);
  // The viewport-dependent ceiling clampPoolPanelHeight bounds against —
  // read via its own hook (not inline `window.innerHeight` math) for the
  // same hydration-safety reason described in usePoolPanelMaxHeight's own
  // comment in tagPoolPrefs.ts.
  const poolPanelMaxHeight = usePoolPanelMaxHeight(fixedOverheadPx ?? EDIT_MODE_FIXED_ROWS_HEIGHT);
  // Whether the resize-specific controls (drag grip + 50%/100%/reset
  // shortcuts) within the resize-handle row are worth showing at all —
  // hidden once poolPanelMaxHeight itself can't clear POOL_HEIGHT_MIN,
  // since at that point nothing they offer (dragging, snapping to a
  // fraction) can move the panel anywhere clampPoolPanelHeight wouldn't
  // already force it to on its own; see that function.
  //
  // A direct comparison, not the settled-during-render reconstruction this
  // used to need: that machinery existed because hiding these controls
  // used to unmount the *entire* resize-handle row, which shrank
  // fixedOverheadPx (measured from bar/dialog's own rendered rects) by the
  // row's full height, raising poolPanelMaxHeight back up and re-showing
  // the row — an oscillation. Now that the row also carries the Tag
  // Density/Sort filters and stays mounted in edit mode regardless (only
  // these specific controls toggle within it), and the filters are taller
  // than the grip+arrows they sit beside, hiding them doesn't change the
  // row's rendered height at all — fixedOverheadPx never moves as a side
  // effect of this decision, so there's nothing left to oscillate against.
  const canShowResizeHandleRow = poolPanelMaxHeight > POOL_HEIGHT_MIN;
  // clampPoolPanelHeight applies uniformly to every source (default,
  // persisted, or actively dragging) — one clamp, not "clamp the persisted
  // value on read, then separately clamp drags" — so the guarantee (fixed
  // rows are never pushed below the fold) holds regardless of where this
  // number came from.
  const effectiveHeightPx = clampPoolPanelHeight(dragHeightPx ?? persistedHeightPx ?? defaultPoolHeightPx, poolPanelMaxHeight);

  // effectiveHeightPxRef mirrors effectiveHeightPx every render without
  // being a dependency of the effect below — same ref-mirroring pattern
  // onCloseEditModeRef already uses further down, for the identical
  // reason: the effect's own observer setup/teardown must stay stable
  // (not tear down and re-subscribe on every drag tick), while the
  // measure() callback it registers still needs to read the CURRENT
  // effectiveHeightPx whenever it actually runs, not a value frozen from
  // whenever the effect last (re-)ran.
  const effectiveHeightPxRef = useRef(effectiveHeightPx);
  useEffect(() => {
    effectiveHeightPxRef.current = effectiveHeightPx;
  });

  // Measures growableFixedOverheadPx — see that state's own comment
  // (near its declaration) for why this is deliberately NOT the fast-
  // changing path: growableRef.height - effectiveHeightPx is the part of
  // growableRef that ISN'T the pool panel (resize row, dialogRef's own
  // margin), which only actually changes at real breakpoints, never
  // during a plain resize-drag — effectiveHeightPx itself changes every
  // drag tick, but it's subtracted out here specifically so this stored
  // number doesn't have to.
  useEffect(() => {
    if (!editMode) return;
    const growable = growableRef.current;
    if (!growable) return;
    function measure() {
      setGrowableFixedOverheadPx(Math.max(0, growable!.getBoundingClientRect().height - effectiveHeightPxRef.current));
    }
    const observer = new ResizeObserver(measure);
    observer.observe(growable);
    measure();
    return () => observer.disconnect();
  }, [editMode]);

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
    // Normal document flow now, the last section of the page's own
    // max-w-[1280px] mx-auto column (see KonomiApp.tsx) — no longer
    // position:fixed. Un-pinning this (STOP'd once, then re-approved with
    // the edit-mode-growth design below) is what lets the header+card+
    // mixer group read as one uniformly-framed block that simply *is* the
    // bottom of the page, rather than a floating dock the page's own
    // content had to reserve clearance for (KonomiApp's old
    // MIXER_BAR_SPACER calc). No px/pb-[space-2xl] here either, for the
    // same reason: that framing now comes from the shared max-w-[1280px]
    // ancestor (left/right) and KonomiApp's own root pb-[space-2xl]
    // (bottom) — this wrapper adding its own would double-count both.
    //
    // One box now, not two — resize row, pool panel, slots, and controls
    // are all ordinary children of the SAME bordered/shadowed element,
    // stacked in normal top-to-bottom flow (the same shape this bar had
    // originally, before position:fixed was removed). Every earlier
    // attempt to make two separately decorated boxes read as one
    // continuous shape at their shared edge — border-color matching,
    // shadow clip-path, a flex-col-reverse split with two independently
    // styled halves — left a different artifact right at that boundary,
    // because there were always two separate perimeters meeting there.
    // One box has no boundary to meet at: its border and shadow are
    // drawn once, around whatever its actual total content is, the same
    // guarantee any other card in this app already gets.
    //
    // marginTop (inline style, below) is what still lets this box grow
    // upward without ever moving slots/controls — see
    // growableFixedOverheadPx's own comment above (near its declaration)
    // for the exact mechanism.
    // The ternary reads `editMode` directly (not just the measured state
    // variable) so the margin snaps back to 0 the instant editMode goes
    // false, rather than waiting on the measurement effect's own cleanup
    // to catch up.
    <div
      ref={cardRef}
      style={{ marginTop: editMode ? -(growableFixedOverheadPx + effectiveHeightPx) : 0 }}
      // relative z-[var(--z-overlay)] — confirmed live as a real bug
      // without it: this box is otherwise position:static with no
      // z-index, but ResultCard's own front face (ResultCard.tsx) is
      // `position:absolute` with an explicit z-[var(--z-raised)] — per
      // the CSS painting order, any positioned element with an explicit
      // z-index always paints above a plain static element, *regardless
      // of DOM order*, so every result card was painting on top of this
      // box whenever its own (upward-growing) content visually reached
      // into that space, interleaving pool-panel chips with card art
      // showing through. The earlier two-box design didn't have this
      // problem because the old overlay div carried z-[var(--z-overlay)]
      // itself; consolidating into one box dropped that along with the
      // rest of its styling. z-overlay (not z-raised) — needs to
      // outrank ResultCard's own z-raised front face, the same token
      // this bar's own fixed-position era already used for the same
      // "sits on top of everything" requirement.
      className="relative z-[var(--z-overlay)] @container max-w-[1280px] mx-auto px-[var(--space-2xl)] py-[var(--space-xl)] border-[length:var(--border-base)] border-[var(--ink)] bg-[var(--surface)] shadow-[var(--elev-4)]"
    >
      {/* growableRef wraps just the resize-handle row + pool panel — see
          growableFixedOverheadPx's own comment above for why this exists
          purely for measurement, with no border/background/padding of
          its own.
          Sits directly above the slots — not between the slots and
          controls, where an earlier version placed it — so opening/
          closing edit mode only ever inserts/removes this one block in a
          single spot, rather than also shifting the slots row itself
          down and back.

          flow-root — confirmed live as a real bug without it: this div
          has no border/padding of its own, and neither dialogRef's own
          mb-[space-lg] nor the resize row's own mb-xl are contained by
          it as a result — an unbroken parent/child edge lets a margin
          collapse straight through, meaning it takes up real vertical
          space in the page but isn't reflected in THIS element's own
          getBoundingClientRect().height, which is exactly what feeds
          growableFixedOverheadPx (and, added to effectiveHeightPx,
          cardRef's own negative marginTop). Under-measuring by that
          collapsed amount meant the
          margin never fully canceled this box's own contribution —
          slots/controls visibly shifted position by tens of px when
          opening edit mode, the exact regression this whole mechanism
          exists to prevent. flow-root establishes a new block formatting
          context, the same fix RecommendationsBody.tsx already uses for
          an identical collapse-through-the-parent case — margins stop
          escaping this box's own boundary, so its measured height always
          matches its true footprint. */}
      <div ref={growableRef} className="flow-root">
      {/* Resize handle + Tag Density/Sort filters, one row — above the
          pool panel, at the very top of the edit surface. Grip + quick-
          resize shortcuts group on the left, filters on the right; both
          now share this one row instead of filters living inline with
          the section tabs below (see TagPoolBody.tsx's own top comment
          for why that combined row was retired — this is where those
          controls moved). Usable at every breakpoint (mouse *and*
          touch, see handleResizeStart) — an earlier version hid the
          resize handle below 993px, leaving mobile with no way to
          resize at all; that gate is gone. No keyboard equivalent yet
          (an accepted gap, same spirit as the no-focus-trap one — not
          solved in this pass). Dragging only ever visibly resizes the
          pool panel below (slots/controls are fixed), but this row is
          positioned as if it controls the whole sheet's height, since
          that's the more natural mental model for the user — "pull this
          to make the panel bigger."

          Row itself gated on editMode alone, not canShowResizeHandleRow
          too — the filters need to stay reachable even once resizing
          itself stops being useful (a short viewport where
          poolPanelMaxHeight has dropped to/below POOL_HEIGHT_MIN); only
          the grip + 50%/100%/reset sub-elements are conditional on that,
          inside the row. onMouseDown/onTouchStart (the drag-start
          handlers) are attached to the row only when
          canShowResizeHandleRow is true, for the same reason — dragging
          a row that can't actually resize anything shouldn't start a
          drag at all.

          The left group is its own sub-container that stops
          mousedown/touchstart from bubbling up to the row's own drag
          handlers, so clicking a quick-resize button never also starts
          a resize-drag. size="sm" (30px, ResultCard's own icon size)
          deliberately smaller than this bar's standard size="md" icon
          buttons below — these are quick secondary shortcuts, not
          primary actions. Reset is conditionally rendered (only once the
          panel has actually left its default height — see
          isAtDefaultHeight above) since 50%/100% cover the "I want it
          bigger" cases on their own; Reset exists for "put it back,"
          which only means something once it's already been moved. */}
      {editMode && (
        <div
          className={[
            // justify-between — filters group (first in DOM) pins to the
            // row's left edge, the resize cluster (last in DOM) pins to
            // its right edge, with whatever width is left between them.
            // Filters is still min-w-0 (below), so it's still the one
            // that gives way as the row narrows — justify-content only
            // decides how any *leftover* space is distributed when the
            // row isn't squeezed; it doesn't change which side shrinks
            // under pressure.
            //
            // mb-xl (16px) — one step more than the slots-row-to-controls
            // rhythm elsewhere in this bar (space-lg/12px): confirmed
            // live that this row's own content (grip+arrows plus filters,
            // heavier than a plain fixed row) reads better with a bit
            // more separation from the tabs row below it than that
            // baseline rhythm gives.
            //
            // No role/cursor/drag-handlers on this outer row anymore —
            // only the grip icon itself is the drag target now (see its
            // own comment below), not the whole row. Confirmed live this
            // was worth doing: with the whole row draggable, an
            // accidental drag-start from anywhere between the filters
            // and the grip (or from a hover meant for a filter control)
            // was too easy to trigger by mistake.
            "flex items-center justify-between gap-x-[var(--space-lg)] mb-[var(--space-xl)]",
          ].join(" ")}
        >
          {/* Filters group comes FIRST in DOM now (resize cluster is
              second/rightmost — see below), so it's the one that gives
              way as the row narrows: min-w-0 lets this flex item shrink
              below its own content's natural (w-fit/max-content) width
              once the row runs out of room, which is what lets
              ScrollFadeArea's overflow-x-auto viewport actually detect
              real overflow and start scrolling — unaffected by the
              reorder, since flex-shrink math doesn't care about a flex
              item's position, only its own min-w-0/shrink-0 and the
              row's total available width. The resize cluster below is
              shrink-0 (fixed, never shrinks), so 100% of the squeeze
              lands on this group, exactly as before the reorder.
              -mb-[26px]/-mr-[4px] cancel the pb-[26px]/pr-[4px] on the
              scrollable content below — pad-then-cancel, not
              pad-and-let-grow, so ScrollFadeArea's own overflow-y-hidden
              viewport doesn't clip LevelSelector/SortSelect's shadow
              bleed or LevelSelector's hover-subtext (which renders
              *below* the control — see LevelSelector's own comment).
              26px covers the hover-subtext's worst case (control bottom +
              mt-space-sm + its own text-xs line height); 4px covers the
              controls' own shadow-[var(--elev-2)] bleed at the trailing
              edge. fitContent: this group's children (label/icon/
              selector pairs) are naturally sized — see ScrollFadeArea's
              own comment on that prop.

              arrowVerticalOffsetPx={-13} (half of the 26px pb above,
              negative to shift up): the pb-26 makes THIS row's own
              ScrollFadeArea root 26px taller than the visible controls
              alone, since that padding lives inside its measured content
              — its arrows' default 50% centers on the full padded box,
              landing visibly low relative to the controls themselves
              (confirmed live as a real bug — the exact "aligned bottom
              instead of center" report this prop exists to fix). Half
              the extra padding re-centers the arrow on the controls, not
              the hover-subtext clearance beneath them. */}
          {/* This row's own responsive ladder, widest to narrowest — same
              flat-CSS, dual-render, no-ResizeObserver pattern as Row 3's
              ladder above, just container- rather than viewport-scoped
              (this whole filters group lives inside the bar's own
              @container, and there's nothing external — like the divider's
              993px — worth syncing against here):
                - @min-[480px] — Tag Density/Sort labels: shown above,
                                  hidden below (shared breakpoint, one
                                  number for both labels, not independently
                                  bisected per label)
                - @max-[352px] — Level: full 3-segment row → collapsed
                                  tap-to-cycle button; Sort: native <select>
                                  → collapsed tap-to-cycle button. Both
                                  controls share this one breakpoint
                                  deliberately, not because either's own
                                  content demands exactly this number (Sort's
                                  collapse only reclaims ~13-26px on its
                                  own — measured, not assumed) but for
                                  design consistency: this row's two filter
                                  controls transform together as one "final
                                  compact mode" step rather than staggering
                                  at two barely-different thresholds. This
                                  row already scrolls horizontally below
                                  ~580px regardless (ScrollFadeArea's own
                                  overflow-x-auto fallback), so neither
                                  collapse is about eliminating scroll, only
                                  reducing how far it goes.
              Adding a new rung: give it its own breakpoint unless it's
              deliberately joining the @max-[352px] "final step" tier for
              the same consistency reason above. */}
          <div ref={filtersScrollRef} className="min-w-0 w-fit -mb-[26px] -mr-[4px]">
            <ScrollFadeArea orientation="horizontal" scrollStep={140} fadeSize={12} fitContent arrowVerticalOffsetPx={-13}>
              <div className="flex items-center gap-[var(--space-lg)] flex-nowrap pb-[26px] pr-[4px]">
                <div className="@max-[352px]:hidden flex items-center gap-[var(--space-sm)] shrink-0">
                  {/* hidden @min-[480px]:inline — same breakpoint Row 3's
                      own "Min Tag Match" label already uses in this same
                      bar, not a new one bisected for this row. No JS
                      measurement needed: these filters no longer compete
                      with anything else for this row's width (the grip/
                      arrows group is fixed-size and small; filters have
                      their own horizontal scroll, above, as the fallback
                      once even icon-only stops fitting) — a plain
                      container query is enough. */}
                  <span className="hidden @min-[480px]:inline font-mono font-bold text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] uppercase whitespace-nowrap">
                    Tag Density
                  </span>
                  <TagIcon className="text-[var(--ink)]" />
                  <LevelSelector value={level} onChange={onLevelChange} />
                </div>
                {/* Collapsed final step — two full sibling forms, same
                    dual-render idiom as Row 3's Min Tag Match above, just
                    container- rather than viewport-scoped (this row keys
                    its own label-hide off @min-[480px] already, not a
                    viewport query). @max-[352px] (not 351 — Tailwind's
                    @max-[Npx] compiles to "not (min-width: Npx)", strictly
                    narrower than N, so 352 is what actually fires at
                    351px and below) is Row 3's own live-bisected 452/451px
                    wrap threshold translated to this container's content-
                    box (a fixed, confirmed 100px offset from viewport
                    width at every width tested) — same step-down point,
                    expressed as this row's own query type rather than a
                    fresh guess. */}
                <div className="hidden @max-[352px]:flex items-center gap-[var(--space-sm)] shrink-0">
                  <TagIcon className="text-[var(--ink)]" />
                  <LevelSelector value={level} onChange={onLevelChange} collapsed />
                </div>
                <div className="@max-[352px]:hidden flex items-center gap-[var(--space-sm)] shrink-0">
                  <span className="hidden @min-[480px]:inline font-mono font-bold text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] uppercase whitespace-nowrap">
                    Sort
                  </span>
                  <SortIcon className="text-[var(--ink)]" />
                  <SortSelect value={sort} onChange={setSortPref} />
                </div>
                {/* Collapsed final step — same @max-[352px] tier as Level
                    above, shared deliberately (see this row's own top
                    comment). No hint span here, unlike Level/Min Tag
                    Match's collapsed forms — SORT_OPTIONS has no hint
                    field, and Popular/Unpopular/A-Z/Z-A are already
                    self-explanatory; inventing hint copy just to fill that
                    slot would be backwards. */}
                <div className="hidden @max-[352px]:flex items-center gap-[var(--space-sm)] shrink-0">
                  <SortIcon className="text-[var(--ink)]" />
                  <SortSelect value={sort} onChange={setSortPref} collapsed />
                </div>
              </div>
            </ScrollFadeArea>
          </div>
          {/* Resize cluster is second/rightmost now, and shrink-0 (fixed
              width, never shrinks) — the stable right anchor the filters
              group above gives way to. Grip is last within this group
              (previously first), so it ends up the single rightmost
              element of the entire row, per the requested order:
              arrows, then grip at the far-right end.

              Only the grip itself is the drag target — role/aria-label/
              onMouseDown/onTouchStart/cursor-ns-resize all live on its
              own box now, not the outer row. Confirmed live this reads
              better: with the whole row draggable, hovering a filter
              control or the empty space between groups showed the
              resize cursor and could start a drag by accident. The
              arrow buttons no longer need their own stopPropagation
              either, now that dragging isn't wired to anything above
              them — clicking one only ever fires its own onClick.

              The grip sits in its own 30×30 box (matching IconButton's
              own size="sm" box the arrow buttons use) instead of just
              the bare 8px-tall SVG — confirmed live as a real bug
              otherwise: IconButton centers its 16×16 glyph inside a
              30×30 box, so two adjacent arrow buttons at gap-0 still
              read ~14px apart glyph-to-glyph (7px of each button's own
              inset on either side of the shared edge), while a bare
              grip SVG butted directly against the last button's edge
              read only ~7px from its own edge to that button's glyph —
              visibly tighter than the arrow-to-arrow spacing despite the
              same gap-0. Matching the box size (not just the gap) makes
              every icon's own inset identical, so gap-0 reads as evenly
              spaced across all four; it's also a larger, easier drag
              target than the bare icon glyph would be on its own. */}
          {canShowResizeHandleRow && (
            <div className="flex items-center gap-0 shrink-0">
              <div className="flex items-center gap-0">
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
                    clampPoolPanelHeight — Math.max(px, MIN) can't win
                    once MIN exceeds the ceiling it's then Math.min'd
                    against), so "not at default" stays true but Reset
                    would write POOL_HEIGHT_MIN and visibly change
                    nothing — a dead button in the exact same squeeze the
                    50%/100% buttons above already hide themselves for. */}
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
              <div
                role="separator"
                aria-orientation="horizontal"
                aria-label="Drag to resize edit panel"
                onMouseDown={handleResizeStart}
                onTouchStart={handleResizeStart}
                className="flex items-center justify-center w-[30px] h-[30px] cursor-ns-resize select-none touch-none"
              >
                <GripHorizontalIcon className="text-[var(--muted)]" />
              </div>
            </div>
          )}
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
        // mb-xl (16px), not mb-lg (12px) like this row's other internal
        // gaps: this is specifically the gap the chip area's down arrow
        // sits flush against (bottom:0, no inset of its own — see
        // ScrollFadeArea). Widening the actual edge here, rather than
        // offsetting the arrow away from it, keeps the arrow visually flush
        // with its own boundary while still giving it more breathing room
        // before the slots below — confirmed live that nudging the arrow's
        // own inset instead left it floating oddly off the edge it's meant
        // to sit against.
        className={editMode ? "flex flex-col mb-[var(--space-xl)] outline-none" : "max-h-0 overflow-hidden"}
      >
        <TagPoolBody
          allTags={allTags}
          selectedTags={selectedTags}
          totalSeriesCount={totalSeriesCount}
          onChipToggle={onChipToggle}
          poolPanelHeightPx={effectiveHeightPx}
          editMode={editMode}
        />
      </div>
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
            hero action, not icon-ified alongside the others.

            This row's own responsive ladder, widest to narrowest — every
            rung a flat CSS breakpoint toggling between two fully-rendered
            forms, no ResizeObserver/JS measurement anywhere, so there's no
            shared trigger for rungs to race or oscillate against:
              - min-[993px]  — Tag Pool/Random/Clear: text+icon → icon-only
                                (below 993px)
              - min-[640px]  — RECOMMEND: text → icon-only (below 640px,
                                RecommendButton.tsx's own breakpoint)
              - max-[452px]  — Min Tag Match: full "1 2 3" segment → collapsed
                                tap-to-cycle single button (live-bisected;
                                wraps at 451px, see that div's own comment for
                                the off-by-one reasoning)
              - max-[408px]  — Tag Pool/Done button: hidden entirely, in both
                                browse and edit mode (live-bisected; row wraps
                                at 407px even with every action above already
                                icon-only — removing this one button, not
                                shrinking padding/gap/icon-size, is what Sean
                                confirmed keeps this single-line down to
                                ~310px)
            Adding a new rung: give it its own breakpoint, don't reuse or
            nudge one of the above — these were each bisected against real
            rendered content independently. */}
        <div className="flex flex-wrap items-center gap-x-[var(--space-lg)] gap-y-[var(--space-lg)]">
          {/* Two full sibling forms, not one component branching internally
              — same dual-render idiom as Random/Clear below. This row's own
              live-bisected wrap threshold is fits-at-452px/wraps-at-451px;
              Tailwind's max-[Npx] compiles to "not (min-width: Npx)" — i.e.
              strictly narrower than N, not "N and below" — so max-[452px]
              (not 451) is what actually fires at 451px and below. The
              collapse engages exactly where the row would otherwise wrap,
              not a guessed number. */}
          <div className="max-[452px]:hidden flex items-center gap-[var(--space-sm)]">
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
          <div className="hidden max-[452px]:flex items-center gap-[var(--space-sm)]">
            <TagIcon className="text-[var(--ink)]" />
            <GreaterEqualIcon className="text-[var(--ink)]" />
            <MatchSelector value={minMatch} onChange={onSetMatch} collapsed />
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
              <IconButton size="md" border="base" shadow="elev-2" backgroundColor="transparent" title="Clear" aria-label="Clear" onClick={onClearSlots}>
                <EraserIcon className="text-[var(--ink)]" />
              </IconButton>
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
            </div>
            <div className="hidden min-[993px]:flex items-center gap-[var(--space-lg)]">
              <ActionButton variant="outline" onClick={onClearSlots}>
                <span className="inline-flex items-center gap-[var(--space-sm)]">
                  Clear
                  <EraserIcon className="text-[var(--ink)]" />
                </span>
              </ActionButton>
              <ActionButton variant="filled" onClick={onRandomTags}>
                <span className="inline-flex items-center gap-[var(--space-sm)]">
                  Random
                  <DiceIcon className="text-[var(--ink)]" />
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
              the Recommend-icon change, still correct.

              min-[408px]:max-[474px]:ml-auto, not a plain max-[474px]:ml-auto
              — scoped to stop exactly where Tag Pool (below) hides. Same
              double-ml-auto collision as the paragraph above, re-triggered
              by the new max-[408px] rung: once Tag Pool disappears this
              wrapper holds only RecommendButton, but the class was still
              unconditionally pushing it right, competing with Random/
              Clear's own (always-on) `ml-auto` for the same line's leftover
              space — confirmed live as the same "both groups pulled toward
              center instead of docking at the edge" symptom. Below 408px,
              Random/Clear's own ml-auto is what docks this whole remaining
              cluster (Random/Clear + Recommend, Tag Pool gone) at the right
              edge as one unit; this wrapper doesn't need its own anymore. */}
          <div className="flex items-center gap-[var(--space-lg)] min-[686px]:max-[993px]:ml-[var(--space-lg)] min-[408px]:max-[474px]:ml-auto">
            {/* max-[408px]:hidden — this row's narrowest rung (see the row's
                own top comment for the full ladder). Live-bisected: Row 3
                wraps at 407px even with every action already icon-only
                (nothing left to shrink), so the fix is removing this one
                button's footprint outright rather than tightening padding/
                gap/icon-size — confirmed live this keeps the row single-line
                down to ~310px in both browse and edit mode. Applies
                regardless of editMode (hides both the TagPoolIcon/browse and
                CheckIcon/edit-mode forms below), since it's a pure viewport
                toggle, not conditioned on the button's own state. */}
            <div className="max-[408px]:hidden">
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
  );
}

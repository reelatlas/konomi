"use client";

import { motion, useMotionValue } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MatchKey, MixerError, Slot, TagInfo } from "@/lib/konomi/types";
import { ActionButton } from "./ActionButton";
import { useAnimationDebugValues } from "./animationDebugStore";
import {
  ArrowDownIcon,
  ArrowUpHalfIcon,
  ArrowUpIcon,
  CheckIcon,
  CloseIcon,
  DiceIcon,
  EraserIcon,
  GreaterEqualIcon,
  GripIcon,
  TagIcon,
  TagPoolIcon,
} from "./icons";
import { IconButton } from "./IconButton";
import { MatchSelector } from "./MatchSelector";
import { RecommendButton } from "./RecommendButton";
import { ScrollFadeArea } from "./ScrollFadeArea";
import {
  clampPoolPanelHeight,
  EDIT_MODE_FIXED_ROWS_HEIGHT,
  POOL_HEIGHT_MIN,
  setPoolPanelHeightPref,
  usePoolPanelHeight,
  usePoolPanelMaxHeight,
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
  onChipToggle: (tag: string) => void;
}

// Formerly MixerSection — now the app's one mixer bar, always present in a
// compact "browse" form (slots, controls) that expands into a taller "edit"
// form that grows upward in place, instead of a second overlay replacing
// it. See DESIGN_SYSTEM.md's "MixerBar" section for the full rationale —
// this comment covers only the mechanics.
//
// position:sticky; bottom:[space-2xl] now, not plain normal flow and not
// position:fixed — the last section inside the page's own max-w-[1280px]
// mx-auto column (see KonomiApp.tsx), still sized and framed as part of the
// header+card+mixer "fits one viewport" group, but floats pinned
// space-2xl above the viewport bottom on pages tall enough to scroll and
// settles back into ordinary in-flow position (respecting KonomiApp's own
// trailing pb-[space-2xl]) once everything fits — the same minimum gap on
// every side of this bar's frame either way, matching the page's own
// left/right gutter (KonomiApp's px-[space-2xl]) — requested explicitly
// once flush bottom-0 read as inconsistent with that gutter. This bar has
// now occupied each of the three real position options in turn:
// position:fixed (the original design),
// plain normal flow (un-pinned once, reverted on explicit instruction, then
// re-approved with the edit-mode-growth design below specifically to
// recover what fixed positioning used to guarantee for free — edit mode
// growing upward without ever pushing browse mode's own slots/controls out
// of place), and now sticky, a middle ground investigated live before
// adopting: confirmed compatible with the one-box design, the marginTop
// growth mechanism, and the z-index stacking below (see each of their own
// comments for specifics) — sticky is still a *positioned* value, so none
// of the invariants those mechanisms depend on changed, only where the box
// sits relative to the viewport when the page scrolls.
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
// oversight. Tag Density/Sort don't live in this bar at all anymore either —
// they moved a second time, out to a Filter icon's popover next to the
// Recommendations header (ResultsFilterButton.tsx) — see that file's own
// top comment. This bar's own edit sheet no longer needs a row just for
// them, which is what let the resize grip/shortcuts fold into TagPoolBody's
// tab row instead (next paragraph).
//
// Edit mode's row order, top to bottom: TagPoolBody's own tab row (section
// tabs, scrollable, plus the resize grip/50%/100%/Reset shortcuts and a
// close button, all fixed to its trailing edge — see TagPoolBody.tsx's own
// top comment) → chip area → slots → controls. Slots and controls are
// FIXED — they never scroll, never resize, and never move, in either mode;
// they're what determines this bar's own normal-flow position and height,
// always. The pool panel is the only part of this bar that ever changes
// size, and the only part that ever scrolls internally (via TagPoolBody's
// own ScrollFadeArea instances, unchanged). This is a hard invariant, not a
// preference — see the clamp math below for how that's guaranteed safe
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
// growableRef wraps dialogRef alone now — there used to be a separate
// resize-handle row as its own sibling here, gated on editMode alone
// (deliberately not also on canShowResizeHandleRowDisplay, since Tag
// Density/Sort needed to stay reachable even once resizing itself stopped
// being useful). Now that those filters are gone and the grip/shortcuts
// live inside TagPoolBody's already-self-measuring tab row instead, that
// separate row — and the risk of its own height feeding back into
// canShowResizeHandleRowDisplay once it held nothing but the very cluster
// that gating decides — doesn't exist to worry about.
//
// The pool panel (TagPoolBody, which now owns the tab row, the resize
// grip/shortcuts/close button, and the chip area) is always mounted, never
// conditionally rendered — toggled via max-h-0 overflow-hidden keyed off
// `editMode`, the same trick the retired TagPoolRecommendationsPanel used
// for tab-switching, generalized from two tab keys to one boolean. This is
// required, not stylistic: TagPoolBody's own activeSectionKey state and
// every ScrollFadeArea scroll position inside it have no persistence
// outside the live DOM, so unmounting this subtree on every close would
// reset both every time — see TagPoolBody.tsx's own top comment, unchanged
// from before, for why it already relies on exactly this guarantee.
//
// Esc, click-outside, and the resize handle all work at every breakpoint —
// none of the three is gated to desktop/pointer specifically.

// Maps the AnimationDebugPanel's NamedEase options onto real CSS
// cubic-bezier() curves — needed because the open/close/snap geometry
// (targetMarginTop/targetHeight/targetMarginBottomPx, below) now animates
// via a genuine CSS `transition`, not Motion's `animate()`, which accepts
// these names natively. linear/easeIn/easeOut/easeInOut map exactly (the
// CSS Easing Functions spec defines them with these same curves — no
// approximation for the default, "editPanelEase" is "easeInOut" out of the
// box). back{In,Out,InOut} are also exact — Motion's own "back" eases are
// themselves cubic-bezier curves with control points outside [0,1]
// (standard, published values, e.g. easings.net's "easeOutBack"), the same
// mechanism CSS cubic-bezier() supports directly. circ{In,Out,InOut} are
// the one approximation here: true circular easing isn't a cubic curve at
// all, so these are the closest well-known cubic-bezier stand-ins, not a
// pixel-exact match to Motion's own formula — acceptable since this is a
// debug-panel-only option, never the shipped default.
const NAMED_EASE_TO_CUBIC_BEZIER: Record<string, string> = {
  linear: "linear",
  easeIn: "cubic-bezier(0.42, 0, 1, 1)",
  easeOut: "cubic-bezier(0, 0, 0.58, 1)",
  easeInOut: "cubic-bezier(0.42, 0, 0.58, 1)",
  circIn: "cubic-bezier(0.55, 0, 1, 0.45)",
  circOut: "cubic-bezier(0, 0.55, 0.45, 1)",
  circInOut: "cubic-bezier(0.85, 0, 0.15, 1)",
  backIn: "cubic-bezier(0.36, 0, 0.66, -0.56)",
  backOut: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  backInOut: "cubic-bezier(0.68, -0.6, 0.32, 1.6)",
};

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
  onChipToggle,
}: MixerBarProps) {
  // Tapping an empty slot opens edit mode instead of the no-op CLEAR_SLOT
  // dispatch it used to trigger; a filled slot still clears as before. This
  // decision has to live here (not in TagSlot or the reducer) since "open
  // edit mode" is UI state the reducer deliberately doesn't own. While edit
  // mode is already open, tapping an empty slot closes it instead of
  // no-op-reopening it — the same toggle behavior the "Done ✓"/checkmark
  // button and click-outside already give, just reachable from a second,
  // already-visible spot instead of only the header button.
  function handleSlotClick(index: number) {
    if (slots[index]) {
      onSlotClick(index);
    } else if (editMode) {
      onCloseEditMode();
    } else {
      onOpenEditMode();
    }
  }

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

  // Live-tweakable via AnimationDebugPanel.tsx — see animationDebugStore.ts's
  // own top-of-file comment for why (a temporary tuning aid, remove once
  // settled). Defaults to the same 280ms this file always used.
  //
  // Shared by the open/close transition's own inline style (below, on both
  // cardRef's marginTop and dialogRef's height) and the setTimeout that
  // watches for it to finish (near isTransitioningRef, below) — one number,
  // not two independently-tuned ones that could silently drift apart, same
  // reasoning RollingLabel.tsx's own ROLL_DURATION_MS already established
  // for the identical "a CSS duration and a JS timer need to agree"
  // constraint.
  const animationDebug = useAnimationDebugValues();
  const EDIT_PANEL_TRANSITION_MS = animationDebug.editPanelTransitionMs;
  // dialogRef's own marginBottom while open (applied below as the literal
  // "var(--space-xl)" — kept as a plain number here too, for the
  // growableFixedOverheadPx pre-seed a few lines down, which needs an
  // actual px value to do math with, not a CSS variable reference. Must
  // stay equal to --space-xl (globals.css) by hand if that token's value
  // ever changes.
  const DIALOG_MARGIN_BOTTOM_PX = 16;
  // True for the duration of the open/close transition only — NOT the same
  // thing as `editMode` itself (which flips instantly, before the visual
  // transition even starts) or `isDraggingRef` (which covers an active
  // resize-drag, a completely different trigger for these same values
  // changing). Exists purely to freeze fixedOverheadPx's and
  // growableFixedOverheadPx's own ResizeObserver-driven measurement while
  // dialogRef's real rendered height is mid-transition — without this,
  // both observers fire many times as dialogRef smoothly grows/shrinks,
  // each time computing a wrong intermediate overhead value from a
  // still-animating rect and feeding it back into poolPanelMaxHeight ->
  // effectiveHeightPx -> the very values driving this same transition (see
  // this file's own DESIGN_SYSTEM.md entry for the full reasoning). A ref,
  // not state: nothing here needs to re-render when this flips, only to be
  // read inside the two measure() callbacks below at the instant they fire.
  const isTransitioningRef = useRef(false);
  // The render-visible twin of isTransitioningRef above — same true/false
  // lifecycle (set together, in the same effect below), but as state
  // rather than a ref, since THIS one has to actually affect what's
  // rendered (whether cardRef's/dialogRef's own transition CSS is active
  // at all), not just be read inside an async callback. Two variables
  // tracking one boolean is the same split this file already has for
  // `editMode` (state, drives rendering) vs. `editModeRef` (ref, read
  // inside async measure() callbacks without risking a stale closure).
  //
  // Confirmed live as a real bug without this split: an earlier version
  // gated the transition on `dragHeightPx === null` alone (the signal for
  // "not actively being drag-updated"), reasoning that this was the only
  // other thing that changes marginTop/height on every tick. It
  // missed a second case — `handleSnapPoolHeight` (the 50%/100% resize
  // shortcuts) also sets `dragHeightPx` to `null` (it's a discrete jump,
  // not a drag), which meant clicking either shortcut also passed the
  // `dragHeightPx === null` check and picked up the transition, turning
  // what should be an instant snap into an unwanted smooth animation.
  // `isEditModeTransitioning` is only ever true for an actual `editMode`
  // toggle, so a resize-shortcut click (which never touches `editMode`)
  // no longer qualifies.
  const [isEditModeTransitioning, setIsEditModeTransitioning] = useState(false);
  // Same role as isEditModeTransitioning, for the 50%/100% resize-shortcut
  // snap instead of an editMode toggle — see handleSnapPoolHeight's own
  // comment (further below) for why this one's set directly in an event
  // handler rather than via the render-phase pattern the editMode version
  // needs. Kept separate rather than reusing one flag for both triggers:
  // the two are set from genuinely different call sites (a render-phase
  // comparison vs. a plain event handler) and this avoids either one's
  // own clear-timeout accidentally clobbering the other's still-active
  // state in the (currently unreachable, but not worth relying on) case
  // they ever overlapped.
  const [isSnapTransitioning, setIsSnapTransitioning] = useState(false);

  // Continuously tracks whether the page is currently scrolled to its own
  // true bottom — read once below, right as editMode flips true, to know
  // whether the scroll-position restoration there is needed. A plain
  // scroll listener rather than a one-shot capture inside the tap handler
  // itself: the value only needs to reflect wherever the user actually was
  // an instant before tapping, and this way nothing has to thread a
  // one-off flag through the open/close prop callbacks from the parent.
  const wasAtDocumentBottomRef = useRef(false);
  useEffect(() => {
    function update() {
      wasAtDocumentBottomRef.current =
        window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  // Confirmed live as a real bug, worst on a short (landscape/rotated)
  // viewport: opening edit mode settles fixedOverheadPx and
  // growableFixedOverheadPx (both below) across two separately triggered
  // commits, not one — on the very first-ever open, the first of those
  // still uses EDIT_MODE_FIXED_ROWS_HEIGHT, a worst-case narrow/portrait
  // bootstrap constant, as fixedOverheadPx, which can wildly overestimate
  // the real overhead on a wide/landscape layout — making that one commit's
  // marginTop far more negative than its own final, corrected value.
  // Confirmed via frame-by-frame sampling (requestAnimationFrame-gated):
  // cardMarginTop briefly read -385.5px against a final, correct -90.125px,
  // and document.documentElement.scrollHeight correspondingly dipped below
  // its own final value for that same one frame. Invisible in the common
  // case (there's slack scroll room above) — but if the user happens to
  // already be scrolled to the document's true bottom at that exact
  // instant (landing there is exactly what "scroll to the bottom, tap an
  // empty slot" does), the browser is forced to clamp scrollY down to fit
  // that transient, too-small height, and never restores it once the
  // correct, taller height lands a frame later — browsers don't
  // retroactively scroll back down just because more room became available.
  // Confirmed live this alone explains the reported "opening edit mode
  // auto-scrolls me away from the bottom, into sticky range" behavior,
  // reproduced in both Chrome and Safari on iOS regardless of engine, and a
  // very likely trigger for a second, WebKit-specific compositor desync
  // reported downstream of it (a sudden, forced, non-gesture scroll jump —
  // exactly what this is — is the kind of discontinuity that class of bug
  // tends to need; see this file's own DESIGN_SYSTEM.md entry).
  //
  // Fixed by restoring position, not by trying to make that one transient
  // frame perfectly accurate — a deeper change to how fixedOverheadPx and
  // growableFixedOverheadPx settle together carries more risk to the
  // drag-resize behavior those two states are otherwise carefully tuned
  // for, for a bug that only ever shows up in this one specific corner.
  // If the user was at the bottom right before a growth event, keep pinning
  // scroll back to the (possibly still-settling) bottom for a few frames
  // afterward — comfortably past the single-frame settle time this was
  // confirmed to actually need, while still stopping well short of ever
  // fighting a genuine new scroll gesture of the user's own.
  //
  // One shared pin loop, not a separate copy per trigger: editMode's own
  // open transition (the effect right below) was the first confirmed
  // trigger, but it isn't the only one — a live drag-resize (handleMove,
  // handleEnd below) grows/shrinks this exact same box by the exact same
  // mechanism (marginTop tracking effectiveHeightPx), and reported live as
  // a second, independent trigger for the identical symptom: holds
  // position mid-page, but scrolls the page toward the top specifically
  // when dragging from the document's true bottom. Same box, same
  // marginTop-overlay mechanism, same fix — re-arming this one loop's
  // frame countdown from multiple call sites, instead of duplicating the
  // loop, is what keeps both call sites guaranteed to stay in sync if this
  // ever needs retuning again. Repeated calls in quick succession (every
  // pointermove during a drag) just re-arm framesLeft rather than spawning
  // a new concurrent loop — pinLoopRunningRef guards that. Safe to hold for
  // a drag's entire duration, not just a few frames: the resize grip
  // already captures the pointer and preventDefaults its own move (see
  // handleResizeStart/handleMove below), so there's no genuine competing
  // scroll gesture of the user's own to fight while a drag is actually in
  // progress — the 6-frame tail only matters for winding down cleanly after
  // the trigger (editMode settling, or the drag actually ending).
  const pinFramesLeftRef = useRef(0);
  const pinLoopRunningRef = useRef(false);
  function pinScrollToDocumentBottomIfWasAtBottom() {
    if (!wasAtDocumentBottomRef.current) return;
    pinFramesLeftRef.current = 6;
    if (pinLoopRunningRef.current) return;
    pinLoopRunningRef.current = true;
    function tick() {
      window.scrollTo(0, document.documentElement.scrollHeight - window.innerHeight);
      pinFramesLeftRef.current -= 1;
      if (pinFramesLeftRef.current > 0) {
        requestAnimationFrame(tick);
      } else {
        pinLoopRunningRef.current = false;
      }
    }
    requestAnimationFrame(tick);
  }
  // Reverted back to synchronous/immediate (useLayoutEffect, default 6
  // frames) — a same-session detour deferred this by EDIT_PANEL_TRANSITION_MS
  // instead, reasoning that window.scrollTo fighting Motion's own
  // measurement of this sticky element mid-transition was the cause of a
  // real, live-measured cardRef/Row 2 desync on a large-persisted-height
  // reopen (see git history/DESIGN_SYSTEM.md for that bug's own writeup —
  // not wrong, but the wrong trade). Reported directly afterward: the
  // scroll-through-to-the-page bug this whole mechanism was layered on top
  // of (touch-action/blockScrollThrough, above) came back on mobile —
  // pointing at this exact area's own prior, working history. Deferring
  // the correction leaves the page sitting at a stale, uncorrected scroll
  // position for the whole ~280ms transition whenever wasAtDocumentBottomRef
  // is true, which is precisely the kind of sudden, late scroll
  // discontinuity this file's own DESIGN_SYSTEM.md already documents as a
  // trigger for real WebKit compositor desync (see "the real mechanism
  // behind mashing an empty slot" entry) — a much more consequential
  // regression, on real mobile hardware, than the narrower cardRef/Row 2
  // desync it was traded for (a rarer scenario: reopening at a large,
  // *persisted* height, from a page scrolled to its exact true bottom).
  // Restored the original, long-working timing; the desync it reopens is
  // called out explicitly in DESIGN_SYSTEM.md as an accepted, narrower
  // trade rather than silently reintroduced.
  useLayoutEffect(() => {
    if (!editMode) return;
    pinScrollToDocumentBottomIfWasAtBottom();
  }, [editMode]);

  // A document-wide scroll lock (html.mixbar-panel-scroll-locked,
  // overflow:hidden + touch-action:none on <html> for as long as editMode
  // is open) used to live here, added for a real-device report of the page
  // and panel visibly scrolling together as one unit. Removed — reported
  // live, directly, as itself too broad: "the ENTIRE view is frozen... the
  // user should still be able to scroll the page behind it when their
  // cursor is OUTSIDE the card/edit panel." Both properties really were
  // document-wide, not just scoped to the bar the way the name implied:
  // overflow:hidden on <html> blocks wheel-driven scroll regardless of
  // which element a wheel event's target is, since it's the SCROLLING
  // element (the document) being locked, not a listener checking where the
  // event came from; touch-action is a normal, inherited CSS property, so
  // touch-action:none on <html> becomes the computed value for every
  // element on the page that doesn't set its own override, not just the
  // bar — "resolves from where a touch starts" (true) doesn't mean
  // "scoped to the bar" when the bar is the only thing WITH an override
  // and everything else just inherits the document's own none.
  //
  // blockScrollThrough (below) and the outer wrapper's own touch-none
  // class (its own comment, near the JSX) are correctly scoped already —
  // an event listener attached directly to cardRef, and a CSS property on
  // a specific element rather than the document root, both only ever
  // affect gestures whose target is that element or its descendants.
  // Together they're what's left protecting against scroll-through
  // specifically, with no blanket document-wide side effect. Whether this
  // fully addresses the original real-device report (much of this file's
  // own compositor/transform-position work landed since it was filed, and
  // is a plausible root cause for a symptom described as "the panel
  // visibly scrolling even though its own size/position never changed")
  // needs on-device re-confirmation, same as this file's other
  // real-device-only fixes — flagged, not assumed.

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
      // the results Clear ✕ button (data-clear-results, ResultsHeader.tsx),
      // and the Filter popover (data-results-filter, ResultsFilterButton.tsx)
      // — without that last one, opening/using the Filter popover while
      // Tag Pool's edit mode happens to already be open would close edit
      // mode as an unrelated side effect, the same footgun Clear was
      // already protected against.
      // target is typed as Node (a mousedown's target can in principle be a
      // text node), but .closest() is Element-only — falls back to the
      // nearest element via parentElement for that case.
      const el = target instanceof Element ? target : (target as Node).parentElement;
      if (el?.closest("[data-result-card], [data-theme-switcher], [data-clear-results], [data-results-filter]")) return;
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
  // it: hovering/touching this bar (or, in edit mode, the overlay it grows
  // above it) reads as interacting with a self-contained control surface,
  // not a transparent window onto the page scrolling underneath. Kept
  // unconditionally active (not just while the edit-mode overlay visually
  // covers content) since this bar's own non-scrollable rows (slots,
  // controls) never had a reason to let a stray wheel/touch gesture bleed
  // through to the page either, fixed or not.
  //
  // The one exception is this bar's own genuinely scrollable areas —
  // TagPoolBody's chip area and its section tab strip, both a
  // ScrollFadeArea underneath — which must keep scrolling internally
  // exactly as before. An earlier version of this
  // exclusion keyed off dialogRef.contains(target) instead — exempting
  // every descendant of the whole edit-mode dialog from preventDefault
  // unconditionally, on the theory that only its own scrollable areas
  // would ever receive a gesture there. Confirmed live as a real, reported
  // bug: dialogRef wraps the *entire* TagPoolBody, not just its two
  // scrollable pieces, so any gesture over genuinely non-scrollable chrome
  // inside it — the section tab strip when only one tab is populated (no
  // horizontal overflow to internally consume the gesture), the dialog's
  // own borders/padding — fell through this check with no preventDefault
  // and nothing else to stop it, chaining straight through to the actual
  // page underneath. Only visible in sticky mode (position: sticky, unlike
  // this bar's earlier position: fixed era, sits IN the page's own scroll
  // flow — there's a real page directly behind it for an unconsumed
  // gesture to reach) — reported as the tab row, and the borders of both
  // panels, "scrolling through to the back page."
  //
  // scrollFadeOrientationAt (below) replaces that blanket exclusion with a
  // narrower one, keyed off data-scroll-fade-orientation — an attribute
  // ScrollFadeArea itself stamps on its own scroll viewport (see that
  // component's own comment) — found via the same target.closest() lookup
  // regardless of which of the three instances a gesture started on,
  // rather than a separate ref-based check per instance (an earlier
  // version of the filters-row exclusion alone needed its own ref for
  // exactly this reason, before the other two instances existed here at
  // all). Only a gesture whose own axis matches that specific instance's
  // orientation is let through — a vertical gesture over the (horizontal-
  // only) tab strip or filters row still falls through to preventDefault
  // below, exactly like anywhere else on the bar, since letting it through
  // would just chain to the page the same way the dialogRef version did.
  // Direction is derived, not assumed: WheelEvent carries deltaX/deltaY
  // directly, but TouchEvent's touchmove doesn't, so the touch case tracks
  // the gesture's start point (touchstart, below) and locks an axis off
  // the first touchmove that clears a small noise threshold, holding that
  // lock for the rest of the gesture rather than re-deciding every event
  // (a gesture that starts diagonal would otherwise flip between "let
  // through" and "block" as it settles).
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
  // there's just nothing scrollable inside dialogRef to exclude yet in
  // that state (it's max-h-0).
  useEffect(() => {
    const bar = cardRef.current;
    if (!bar) return;

    let touchStart: { x: number; y: number } | null = null;
    let touchAxis: "horizontal" | "vertical" | null = null;
    let hideScrollbarTimeout: number | null = null;

    // Purely cosmetic, riding along on the same "this gesture is being
    // blocked" decision blockScrollThrough already makes below — the
    // page's own scrollbar can visibly flash/engage the instant it
    // receives wheel input, even once preventDefault stops it from
    // actually moving anything (confirmed live: reported as a brief but
    // real visual glitch, distinct from the scroll-through behavior
    // itself, which was already correctly blocked). html.
    // hide-scrollbar-while-blocked (globals.css) sets overflow: hidden for
    // as long as this stays applied — see that class's own comment for why
    // it's just overflow: hidden alone now, not paired with a permanently
    // reserved scrollbar-gutter the way a first version tried (reverted:
    // iOS's own overlay scrollbar doesn't reserve space to begin with, so
    // reserving one unconditionally just added a permanent, unwanted track
    // artifact for no benefit on the platform this was written for).
    // Re-armed (not just set once) on every blocked event so a sustained
    // attempt (holding a scroll gesture over the tab strip) keeps it hidden
    // for the gesture's whole duration rather than flickering the class on
    // and off between individual wheel ticks; removed shortly after the
    // last blocked event, once nothing's actively trying to scroll here
    // anymore.
    function hideScrollbarWhileBlocked() {
      document.documentElement.classList.add("hide-scrollbar-while-blocked");
      if (hideScrollbarTimeout !== null) window.clearTimeout(hideScrollbarTimeout);
      hideScrollbarTimeout = window.setTimeout(() => {
        document.documentElement.classList.remove("hide-scrollbar-while-blocked");
        hideScrollbarTimeout = null;
      }, 200);
    }

    function scrollFadeOrientationAt(target: Node): "horizontal" | "vertical" | null {
      const el = target instanceof Element ? target : (target as Node).parentElement;
      const value = el?.closest("[data-scroll-fade-orientation]")?.getAttribute("data-scroll-fade-orientation");
      return value === "horizontal" || value === "vertical" ? value : null;
    }

    function handleTouchStart(e: TouchEvent) {
      if (scrollFadeOrientationAt(e.target as Node)) {
        const t = e.touches[0];
        touchStart = { x: t.clientX, y: t.clientY };
        touchAxis = null;
      } else {
        touchStart = null;
        touchAxis = null;
      }
    }

    function blockScrollThrough(e: WheelEvent | TouchEvent) {
      const orientation = scrollFadeOrientationAt(e.target as Node);

      if (orientation) {
        if (e instanceof WheelEvent) {
          const gestureIsHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
          if ((orientation === "horizontal") === gestureIsHorizontal) return;
        } else {
          const t = e.touches[0];
          if (touchAxis === null && touchStart) {
            const dx = t.clientX - touchStart.x;
            const dy = t.clientY - touchStart.y;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
              touchAxis = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
            }
          }
          if (touchAxis === orientation) return;
        }
      }

      e.preventDefault();
      hideScrollbarWhileBlocked();
    }
    bar.addEventListener("wheel", blockScrollThrough, { passive: false });
    bar.addEventListener("touchstart", handleTouchStart, { passive: true });
    bar.addEventListener("touchmove", blockScrollThrough, { passive: false });
    return () => {
      bar.removeEventListener("wheel", blockScrollThrough);
      bar.removeEventListener("touchstart", handleTouchStart);
      bar.removeEventListener("touchmove", blockScrollThrough);
      if (hideScrollbarTimeout !== null) window.clearTimeout(hideScrollbarTimeout);
      document.documentElement.classList.remove("hide-scrollbar-while-blocked");
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
  // Round 5 (current): live drag drives REAL height/marginTop directly,
  // via Motion values, instead of pinning to a ceiling and faking the
  // reveal with a clip-path. Four earlier rounds are worth recording in
  // full — the failure modes are easy to reintroduce by accident, and the
  // reasoning for landing back on "just track the real value, cheaply" is
  // only convincing with the full history in view.
  //
  // Round 1 (cardRef translateY, per-tick, -(poolPanelMaxHeight - next)):
  // reported live as cardRef's own box sliding as a rigid whole, in the
  // WRONG direction, as the drag proceeded.
  //
  // Round 2 (kept Round 1, gave Row 2 its own separate per-tick
  // compensator): fixed Row 2 specifically but not cardRef's own box,
  // which kept sliding underneath it.
  //
  // Round 3 (cardRef translateY as a per-drag CONSTANT instead of
  // per-tick): correct once a drag was already moving (0.0px drift,
  // confirmed live) — but reported live as the grip jump: pressing and
  // holding, with zero pointer movement, visibly jumped the whole card and
  // Row 2 upward, since a constant is still a discontinuous, untransitioned
  // jump applied in one commit.
  //
  // Round 4 (no cardRef transform at all; targetMarginTop itself reads
  // poolPanelMaxHeight during a drag, canceling growableRef/dialogRef's
  // real-height pin in the same commit it happens): fixed the jump and the
  // slide, verified 0.00px drift at press, throughout, and at release.
  // But reported live, precisely, right after: "the resize affordance
  // cause the panel to fully expand on click then on let go reverts to
  // the size it was at... does not resize as expected." Traced to what
  // "pin to poolPanelMaxHeight, reveal via clip-path" actually means
  // visually: cardRef's own real height (border/background/shadow) is
  // driven by growableRef's real, PINNED height — not by the clip-path,
  // which only ever affected growableRef's own painted CONTENT. The
  // border was always at its full, maximum possible extent from the first
  // frame of every drag, completely independent of where the clip
  // boundary actually was, since nothing visually marks that boundary
  // (uniform background, no seam) — confirmed directly, comparing
  // `growableClipPath` against `cardRef`'s own rect through a drag: the
  // clip-path itself was tracking the pointer exactly correctly the whole
  // time, but that correctness was invisible, because the one thing a
  // user actually reads as "how big is this panel" (the border) wasn't
  // the thing being animated at all. This is why Round 4's own
  // documentation called the border's static pinned-extent "a known,
  // accepted tradeoff" — that assessment was wrong; it's the whole bug.
  //
  // Round 5 (here): stop pinning to a ceiling and faking a reveal
  // entirely. growableRef/dialogRef's real height and the outer wrapper's
  // real marginTop both track the live drag target directly, every tick,
  // via Motion values (`.set()`, bypassing React's render cycle — no
  // reconciliation cost, same technique this file already uses for other
  // per-tick values). This is a REAL layout property changing every tick,
  // which is exactly what the original pre-Round-4 measurement (60 real
  // layout passes for 60 ticks) was measuring the cost of — but that
  // measurement was taken before `contain: layout` landed on dialogRef
  // (isolates its own descendants' layout from this change entirely) and
  // before `pauseMeasurementWhileResizing` stopped the chip area's own
  // ResizeObserver from paying that same per-tick cost a second time. Re-
  // measured with both of those in place before committing to this
  // rewrite, not assumed: see this file's own CPU-throttled frame-drop
  // test for the actual numbers. If those numbers hadn't held up, the
  // right fix would have been a differently-shaped compromise (e.g.
  // clipping from a progressively-growing ceiling instead of the full
  // one), not reverting to Round 4's invisible-clip-path approach — a
  // resize handle that doesn't visibly resize while you're moving it is
  // not an acceptable trade for any amount of layout-pass savings.
  const dragLiveHeight = useMotionValue(0);
  const dragMarginTop = useMotionValue(0);
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
  // Set for the duration of an active resize-drag (handleResizeStart below)
  // — a ref, read inside fixedOverheadPx's own measure() callback (this
  // effect's "frozen while dragging" guard), specifically so that effect
  // doesn't need this in its own dependency array (which would mean
  // tearing down and resubscribing its ResizeObserver on every drag
  // start/end, the same stale-closure-avoidance reason effectiveHeightPxRef
  // mirrors state below). Deliberately narrower in scope than
  // frozenReachability below: this is specifically "is the grip
  // actively changing the panel's height right now," which only the grip's
  // own handleResizeStart/handleEnd ever set — a tap on the 50%/100%/Reset
  // buttons doesn't touch this at all, since none of them are a continuous,
  // height-changing gesture that fixedOverheadPx would need frozen against.
  const isDraggingRef = useRef(false);
  // A broader mechanism than isDraggingRef above — this one isn't about
  // freezing fixedOverheadPx during an actual height-changing gesture,
  // it's about keeping the grip AND the resize shortcut arrow (whichever
  // one of 50%/100% is currently showing — see trailingControls' own
  // comment) mounted for the duration of ANY pointer press on either, tap
  // or drag alike. Confirmed live as a real, separate instance of the
  // sixth trap's own family (see DESIGN_SYSTEM.md): back when this row
  // held three separate shortcut buttons (50%/100%/Reset, since reduced to
  // one arrow at a time), each was individually gated on
  // poolPanelMaxHeight-derived conditions (canReachHalfHeight/etc.) that
  // nothing protected before this, since pressing one of *them* isn't a
  // drag at all. Reproduced: pressed the (now-removed) Reset button,
  // forced a viewport-height change mid-press (what an iPhone's Safari
  // address bar does during active scrolling/touch), poolPanelMaxHeight
  // crossed its threshold, and Reset unmounted while the finger was still
  // down on it — whatever's now under that same screen point (confirmed
  // live: the bar's own outer card) is what a real release would activate
  // instead.
  //
  // A first version of this fix used one shared boolean, OR'd into every
  // element's own conditions — confirmed live as a real, separate bug once
  // shipped: pressing the grip alone (with the panel already sitting
  // exactly at its default height, Reset correctly not yet shown) made
  // Reset — and every other otherwise-hidden sibling — appear too, purely
  // because *something* in the row was being pressed, not because
  // anything about reachability actually changed. One shared boolean can't
  // distinguish "reveal the specific thing that was already visible and
  // is now being pressed" from "reveal everything in this row, whether it
  // was ever visible or not."
  //
  // The fix: snapshot each element's own *reachability* (the
  // poolPanelMaxHeight-derived half, which should never change mid-press
  // for reasons outside the user's control) individually, at the exact
  // instant a press starts, and hold that per-element snapshot — not a
  // single blanket flag — until release. Deliberately does NOT snapshot
  // isAtFullHeight (or the plain position comparison the single arrow's
  // own choice of target is now based on) alongside it: those compare
  // against the *live*, actively-dragged effectiveHeightPx, and freezing
  // them too would break real, wanted feedback (the arrow correctly
  // hiding/swapping the instant a live drag actually reaches that exact
  // height). Only the "is this reachable at all" half needs freezing;
  // "are we currently at that height" should keep reacting to the user's
  // own gesture in real time.
  //
  // Still built from the same plain lifecycle as before — populated once
  // on pointerdown, cleared to null on pointerup/pointercancel, reading
  // each live value exactly once at that instant rather than continuously
  // re-deriving anything from poolPanelMaxHeight/scrollHeight while a
  // press is active, which would just reintroduce the same
  // feed-back-into-its-own-input shape the seventh trap instance already
  // hit once this session (see DESIGN_SYSTEM.md) in a different guise.
  const [frozenReachability, setFrozenReachability] = useState<null | {
    canShowRow: boolean;
    canReachHalf: boolean;
    canReachFull: boolean;
  }>(null);
  // Attached once, on the shared container both the grip and the
  // 50%/100%/Reset buttons live inside (below) — a single pointerdown
  // there catches a press starting on any of the four via normal bubbling,
  // rather than repeating this handler four times. Cleared on
  // window-level pointerup/pointercancel, not a listener on whichever
  // element was actually pressed — same reason handleResizeStart's own
  // drag-continuation listeners live on window: if the pressed element is
  // exactly the thing that's about to unmount, its own listeners would go
  // with it.
  function handleRowPointerDown() {
    setFrozenReachability({
      canShowRow: canShowResizeHandleRow,
      canReachHalf: canReachHalfHeight,
      canReachFull: canReachFullHeight,
    });
    function clear() {
      setFrozenReachability(null);
      window.removeEventListener("pointerup", clear);
      window.removeEventListener("pointercancel", clear);
    }
    window.addEventListener("pointerup", clear);
    window.addEventListener("pointercancel", clear);
  }
  // Lets handleResizeStart's own handleEnd force one fresh measurement
  // right as a drag releases, rather than waiting on the next incidental
  // ResizeObserver/resize event to catch up — see the effect below.
  const measureFixedOverheadRef = useRef<() => void>(() => {});
  // Same role as measureFixedOverheadRef above, for growableFixedOverheadPx's
  // own measure() (declared further below) — a second, separate ref since
  // the two measurements are independent effects with their own
  // ResizeObservers, not one shared measure() doing both jobs.
  const measureGrowableFixedOverheadRef = useRef<() => void>(() => {});
  // Flips isEditModeTransitioning on the instant editMode changes — during
  // render itself, via React's own documented "adjust state when a value
  // changes" pattern (a conditional setState call in the render body,
  // comparing against a previous value tracked in *state*, not a ref —
  // this project's own lint config flags both ref reads during render and
  // unconditional setState calls inside effect bodies, so this is the one
  // shape that satisfies both: no ref touched here at all, and this isn't
  // inside an effect). prevEditModeForTransition holds editMode as of the
  // last render this ran on; disagreeing with the current render's
  // editMode is the transition starting.
  const [prevEditModeForTransition, setPrevEditModeForTransition] = useState(editMode);
  // True for exactly the one render where editMode just changed — read
  // below (targetMarginTop) as well as used to drive the setState pre-seed
  // in this same block, see that usage's own comment for why both need it.
  const editModeJustToggled = editMode !== prevEditModeForTransition;
  if (editModeJustToggled) {
    setPrevEditModeForTransition(editMode);
    setIsEditModeTransitioning(true);
    // Also pre-seeds growableFixedOverheadPx to its correct value for the
    // NEW editMode, rather than leaving it frozen at whatever it measured
    // last (stale — possibly 0, from browse mode, or from before this
    // render) for the entire transition. growableFixedOverheadPx is
    // exactly dialogRef's own marginBottom now that growableRef wraps
    // dialogRef alone (see that ref's own comment), which is a known,
    // deterministic value (DIALOG_MARGIN_BOTTOM_PX, matching the literal
    // var(--space-xl) applied below — not measured from the DOM, since
    // there's nothing left to discover: dialogRef has no border/padding
    // of its own, so growableRef's entire "overhead beyond the pool
    // panel" is just this one margin), not something that actually needs
    // a live ResizeObserver round-trip to learn. The later catch-up
    // measurement (isEditModeTransitioning's own effect, below) just
    // reconfirms the same number instead of correcting a wrong one.
    //
    // This alone used to be considered sufficient (a same-commit,
    // render-phase setState "shouldn't" ever paint its own stale
    // intermediate value — React re-invokes the component synchronously
    // with the new state before committing to the DOM, per its own
    // documented behavior). Confirmed live this round it ISN'T sufficient
    // once cardRef/Row 2 both track `layout="position"`: Motion's own
    // projection system measures on every RENDER FUNCTION INVOCATION, not
    // once per REACT COMMIT — reopening at a large, persisted pool height
    // showed targetMarginTop computed twice, 1.5ms apart (-590 using this
    // state's stale pre-toggle value of 0, then -606 once this setState's
    // own re-render picked up the correct 16), and Motion visibly
    // animated toward the FIRST, later-discarded -590 target before
    // retargeting to -606 partway through — a real, confirmed desync
    // between cardRef's own translateY and Row 2's counter-tracking
    // (maxDelta 393px on Row 2, live-measured). targetMarginTop
    // (below) now also reads editModeJustToggled directly so its OWN
    // first-render value is already correct without waiting on this
    // setState's re-render at all — belt-and-suspenders with this pre-seed
    // rather than a replacement for it, since growableFixedOverheadPx
    // still needs to be correct as plain state for every render AFTER
    // this one.
    setGrowableFixedOverheadPx(editMode ? DIALOG_MARGIN_BOTTOM_PX : 0);
  }
  // isTransitioningRef's own write is a genuine effect (`useLayoutEffect`,
  // matching editModeRef's own identical pattern just above it) — ref
  // writes belong in effects/handlers, not render, and this still lands
  // synchronously before paint, well before either measure() effect's own
  // (inherently asynchronous) ResizeObserver callback could fire against a
  // mid-transition rect.
  useLayoutEffect(() => {
    isTransitioningRef.current = true;
  }, [editMode]);
  // Clears the freeze via a plain setTimeout matching
  // EDIT_PANEL_TRANSITION_MS — not `transitionend`, the same reliability
  // call RollingLabel.tsx's own comment already makes: an animation/
  // transition-completion *event* depends on the browser actually
  // dispatching it, confirmed unreliable enough on real devices in this
  // app to avoid; a timer tied to the duration this file already controls
  // doesn't depend on that. Re-measures once via measureFixedOverheadRef/
  // measureGrowableFixedOverheadRef the instant the freeze lifts — the
  // same "catch up on anything that changed while frozen" pattern
  // handleResizeStart's own handleEnd already uses when a drag releases.
  // Keyed on isEditModeTransitioning itself rather than editMode — it only
  // ever needs to run while the freeze is actually active, and setting
  // state unconditionally at the top of this one is fine (not flagged):
  // it's entirely inside the `if` guard just below, not an unconditional
  // effect-body call.
  useEffect(() => {
    if (!isEditModeTransitioning) return;
    const timeout = setTimeout(() => {
      isTransitioningRef.current = false;
      setIsEditModeTransitioning(false);
      measureFixedOverheadRef.current();
      measureGrowableFixedOverheadRef.current();
    }, EDIT_PANEL_TRANSITION_MS);
    return () => clearTimeout(timeout);
  }, [isEditModeTransitioning, EDIT_PANEL_TRANSITION_MS]);
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
  //
  // useLayoutEffect, not useEffect — confirmed live as a real bug with the
  // plain-useEffect version: on the very first editMode open per page load,
  // this (and growableFixedOverheadPx below) only resolved to their real
  // values *after* the browser had already painted one frame using the
  // stale bootstrap/zero values, so cardRef's own negative-marginTop
  // compensation (see that ref's own comment) was momentarily wrong — the
  // whole bar visibly jumped down by the resize row's height, then snapped
  // back up a frame later once this measurement landed. useLayoutEffect
  // runs synchronously after the DOM mutation but before the browser
  // paints, so the correction lands in the same commit the open itself
  // does — same fix, same reasoning as ResultCard.tsx's own hint-wrap
  // measurement (see that file's comment on its own useLayoutEffect).
  //
  // Frozen for the duration of an active resize-drag — confirmed live as a
  // real bug otherwise: mobile browsers resize the *visual* viewport (and
  // fire a real `resize` event) when their address bar/toolbar hides or
  // shows, which commonly happens mid-touch, exactly while a user is
  // dragging this very handle. That event reaches the `window.
  // addEventListener("resize", measure)` below same as any other resize,
  // recomputing `poolPanelMaxHeight` — and since the render body re-clamps
  // `effectiveHeightPx` against that ceiling on every render (see its own
  // declaration below), a shrinking ceiling mid-drag snapped the panel to
  // the new, smaller max independent of any finger movement. Reproduced
  // live: dragged to 413px, simulated a viewport shrink mid-drag (address
  // bar showing), panel instantly snapped to 341px with the pointer still
  // down. This compounds with the browser's own native scroll-position
  // adjustment on the same resize (it re-anchors scrollY when the page is
  // near its scroll max and the viewport height changes — ordinary browser
  // behavior, not this app's doing) to read as "multiple things scrolling/
  // resizing at once," reported live on a real device. The fix is the same
  // standing rule as `growableFixedOverheadPx`'s own split above (see
  // DESIGN_SYSTEM.md's MixerBar section) applied to a second trigger: don't
  // let an async, externally-triggered measurement change a value that's
  // also being driven synchronously by an in-progress gesture. Skipping the
  // state update while `isDraggingRef.current` is true freezes the ceiling
  // at whatever it was when the drag started; `handleResizeStart`'s own
  // `poolPanelMaxHeight` closure is already effectively frozen the same way
  // (captured once at drag-start, never reads a later render), so this
  // keeps both halves of the clamp consistent for the drag's full duration.
  // The very first `measure()` call below (drag never active yet at mount/
  // open) is unaffected — this only ever skips *later* resize-driven
  // updates that land while a drag is in flight.

  // Same ref-mirroring pattern as effectiveHeightPxRef (below), for the same
  // reason: fixedOverheadPx's and growableFixedOverheadPx's own
  // ResizeObserver callbacks (both below) are async — they fire on their
  // own schedule, not synchronously with whatever render scheduled them —
  // so a callback created while editMode was true can still be sitting in
  // the browser's delivery queue after a *later* render has already flipped
  // editMode back to false (rapidly toggling edit mode open/closed, e.g.
  // repeatedly tapping an empty slot now that doing so also closes it, is
  // exactly the kind of input that can produce several such toggles faster
  // than a ResizeObserver callback queue drains). `.disconnect()` in each
  // effect's own cleanup is supposed to prevent that instance's callback
  // from firing again, but isn't specified to guarantee an
  // already-queued-but-not-yet-delivered callback is retroactively
  // cancelled on every engine — a defensive belt-and-suspenders guard, not
  // a replacement for disconnect(). Reading a plain closed-over `editMode`
  // inside either measure() wouldn't catch this: the closure keeps
  // whatever `editMode` was at the time that specific effect instance was
  // created, not whatever it's actually become by the time a late callback
  // fires — the same reason effectiveHeightPxRef exists instead of reading
  // effectiveHeightPx directly. This ref, kept live via the same
  // deps-less-effect trick, is always current for either measure() to
  // check, regardless of which instance scheduled the callback that's
  // asking.
  const editModeRef = useRef(editMode);
  useLayoutEffect(() => {
    editModeRef.current = editMode;
  });
  useLayoutEffect(() => {
    if (!editMode) return;
    const card = cardRef.current;
    const dialog = dialogRef.current;
    if (!card || !dialog) return;
    function measure() {
      if (isDraggingRef.current) return;
      // Skips every call while the open/close transition is in flight —
      // see isTransitioningRef's own declaration for why: dialog's real
      // height is still animating toward its target here, so anything
      // measured mid-transition is wrong by construction, not just
      // occasionally stale. The catch-up call that fires the instant the
      // freeze lifts (same ref's own effect) is what re-syncs this once
      // dialog has actually settled at its true final height.
      if (isTransitioningRef.current) return;
      // See editModeRef's own comment — a late, async callback from an
      // instance whose editMode has since flipped back to false would
      // otherwise measure a collapsed (max-h-0) dialog and commit a wrong,
      // inflated overhead.
      if (!editModeRef.current) return;
      const cardRect = card!.getBoundingClientRect();
      const dialogHeight = dialog!.getBoundingClientRect().height;
      const surplusBelow = Math.max(0, window.innerHeight - cardRect.bottom);
      setFixedOverheadPx(Math.max(0, cardRect.height - dialogHeight + surplusBelow));
    }
    measureFixedOverheadRef.current = measure;
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
  // Confirmed live as a real, serious bug: this is a *live* value, reactive
  // to the same window resize that can fire mid-drag (mobile address-bar
  // hide/show, or a desktop user actually resizing the browser window while
  // holding the handle) — if it flips false while a drag is in progress,
  // the grip (and the pointerdown/setPointerCapture it owns) unmounts out
  // from under the user's still-active pointer. Reproduced exactly this
  // way: dragged, shrank the viewport mid-drag until this flipped false,
  // released — the grip was gone, and because its own drag-continuation
  // listeners went with it (see handleResizeStart's own comment on why
  // they're on `window` now, not the grip, for the *other* half of this
  // same fix), `handleEnd` never got to reset isDraggingRef/dragHeightPx.
  // That left `fixedOverheadPx`'s measurement effect permanently frozen
  // (its own guard skips every future update while isDraggingRef.current is
  // true — see that effect's comment), which cascades into everything
  // downstream of it forever, not just this row: `poolPanelMaxHeight`,
  // `effectiveHeightPx`, and `TagPoolBody`'s own `poolPanelHeightPx` prop
  // all stay stuck at whatever they were the instant the drag got
  // orphaned — confirmed live as the same root cause behind two more
  // symptoms that looked unrelated at first (reopening the pool later
  // showing a stale height/position left over from a since-changed
  // viewport, and the tabs+filters row's own scroll/truncation behavior
  // going stale) until traced back here.
  //
  // Reads frozenReachability, not isDraggingRef directly — the same
  // live ceiling also gates the 50%/100%/Reset buttons (see their own
  // conditions, below), and a press on any of *those* three is a tap, not
  // a drag, so isDraggingRef alone (only ever set by the grip's own
  // handleResizeStart) didn't protect them — confirmed live as the same
  // bug, one level over: pressed Reset, forced the ceiling to cross its
  // threshold mid-press, Reset unmounted with the finger still on it.
  // frozenReachability is populated for the entire span of any press on any
  // of the four (grip included — its own pointerdown bubbles up to the
  // shared container's handleRowPointerDown same as the others'), so
  // substituting its snapshotted canShowRow in place of the live value here
  // keeps this whole row mounted for that whole span regardless of what the
  // live ceiling does — the *display* value diverges from the real
  // `canShowResizeHandleRow` only during a press, and only in the "still
  // show it" direction. A straight substitution, not an OR: this row's own
  // visibility was never in question when the press started (something
  // inside it is what's being pressed), so there's no "reveal something
  // that was already hidden" failure mode to guard against here the way
  // there is for the three sibling buttons below, each of which can be
  // individually hidden while a sibling is what's actually under the
  // finger.
  const canShowResizeHandleRowDisplay = frozenReachability
    ? frozenReachability.canShowRow
    : canShowResizeHandleRow;
  // clampPoolPanelHeight applies uniformly to every source (default,
  // persisted, or actively dragging) — one clamp, not "clamp the persisted
  // value on read, then separately clamp drags" — so the guarantee (fixed
  // rows are never pushed below the fold) holds regardless of where this
  // number came from.
  //
  // dragHeightPx is the one exception to "re-clamp against the live
  // poolPanelMaxHeight on every render," and deliberately so: handleMove
  // (below) already clamps every drag tick against the ceiling as it stood
  // at drag-*start* (a plain closure variable, never updated mid-drag by
  // design — see handleMove's own comment). poolPanelMaxHeight itself is a
  // *live* useSyncExternalStore value (usePoolPanelMaxHeight, tagPoolPrefs.ts)
  // that reacts to `window resize` independently of anything in this
  // component — confirmed live as a real bug otherwise: a mobile browser's
  // address-bar hide/show fires exactly that event mid-touch-drag, and
  // re-clamping dragHeightPx against the new, live ceiling on this line
  // snapped the panel from 413px to 341px with the pointer still down, no
  // finger movement involved. Trusting dragHeightPx as already-correctly-
  // clamped (rather than clamping it a second time here against a ceiling
  // that can differ from the one it was actually computed against) removes
  // the double-clamp that caused the snap, while persisted/default still
  // get the live ceiling, same as before — the fixedOverheadPx `isDraggingRef`
  // freeze (above) covers the same class of mid-drag resize event for the
  // other consumers of poolPanelMaxHeight (canShowResizeHandleRow, the
  // 50%/100% buttons), so this line and that guard are two halves of one fix.
  const effectiveHeightPx =
    dragHeightPx !== null ? dragHeightPx : clampPoolPanelHeight(persistedHeightPx ?? defaultPoolHeightPx, poolPanelMaxHeight);

  // effectiveHeightPxRef mirrors effectiveHeightPx every render without
  // being a dependency of the effect below — same ref-mirroring pattern
  // onCloseEditModeRef already uses further down, for the identical
  // reason: the effect's own observer setup/teardown must stay stable
  // (not tear down and re-subscribe on every drag tick), while the
  // measure() callback it registers still needs to read the CURRENT
  // effectiveHeightPx whenever it actually runs, not a value frozen from
  // whenever the effect last (re-)ran.
  // useLayoutEffect, not useEffect — the ResizeObserver callback below
  // (async, fires on its own schedule) reads this ref, and it must never
  // see a value more than one commit stale. A passive effect only
  // guarantees "will run eventually after paint," which left a real window
  // during a fast resize-drag where several state updates (and therefore
  // DOM commits) could land before the previous one's effect flushed —
  // the observer could then read a ref one or more renders behind the DOM
  // it was actually measuring against, computing a wrong overhead and
  // visibly glitching the drag. useLayoutEffect updates the ref
  // synchronously in the same commit as the render that changed
  // effectiveHeightPx, so it's always current by the time anything else
  // (this commit's own layout effects, or a later async observer callback)
  // reads it.
  const effectiveHeightPxRef = useRef(effectiveHeightPx);
  useLayoutEffect(() => {
    effectiveHeightPxRef.current = effectiveHeightPx;
  });
  // --- FLIP migration (Motion) — v2, using Motion's own `layout` prop ---
  //
  // The original version of this migration hand-built FLIP: a "committed
  // vs. visual" split, manually-tracked start/end geometry, and an
  // imperative animate() call driving a transform/clip-path overlay. That
  // version shipped three separate real bugs across two on-device retest
  // rounds (a fixed row visibly moving, a render-doubling drag jitter, a
  // one-frame race between the real commit and the overlay's first paint)
  // — each fixed in turn, but the pattern itself (hand-tracking exactly
  // what Motion's `layout` prop already exists to compute automatically)
  // kept reintroducing new instances of the same underlying class of bug:
  // manually keeping a real value and a visual value in sync. Replaced
  // with Motion's own `layout` prop on growableRef/dialogRef below, which
  // measures each element's own rendered rect before and after a React
  // commit and animates the difference automatically — the exact FLIP
  // computation this file was hand-rolling, now done by code this project
  // doesn't have to maintain or re-debug. See DESIGN_SYSTEM.md for the
  // full writeup of why layout was reconsidered and adopted.
  //
  // targetMarginTop/targetHeight/targetMarginBottomPx are the CORRECT,
  // already-computed-from-plain-JS-numbers geometry for cardRef/dialogRef —
  // unchanged in what they compute from the pre-Motion version of this
  // file (this measurement pipeline — effectiveHeightPx/
  // growableFixedOverheadPx/fixedOverheadPx — is completely untouched by
  // this or any other step of the Motion migration; `layout` only measures
  // each element's own rendered rect for its OWN animation purposes, it
  // has no say in what these numbers actually are). Applied directly, on
  // every render, with no "committed vs. target" distinction and no
  // deferred-commit timing of any kind: growableRef/dialogRef's `layout`
  // prop is what makes a discrete jump (grow OR shrink, instantly, in one
  // step) look smooth, not any hand-timed staging on this file's part.
  // effectiveGrowableFixedOverheadPx, not growableFixedOverheadPx directly —
  // see editModeJustToggled's own declaration (above) for why: on the one
  // render where editMode just changed, growableFixedOverheadPx (state)
  // still holds its PRE-toggle value, since the pre-seed setState a few
  // lines up won't actually apply until React's own same-commit re-render
  // — normally invisible (React documents this as never painting the
  // intermediate pass), but Motion's `layout="position"` (cardRef/Row 2,
  // below) measures on every render invocation, not once per commit, and
  // was confirmed live to animate toward that intermediate, later-
  // discarded value before retargeting. Computing the correct value
  // inline, for THIS render, sidesteps the two-pass gap entirely instead
  // of trying to hide it from Motion after the fact.
  const effectiveGrowableFixedOverheadPx = editModeJustToggled ? (editMode ? DIALOG_MARGIN_BOTTOM_PX : 0) : growableFixedOverheadPx;
  // No dragHeightPx branch anymore — during a live drag, the outer
  // wrapper's own style reads dragMarginTop (a Motion value) directly
  // instead of this at all (see that motion value's own declaration, near
  // dragHeightPx, for the full Round 5 history), so what this formula
  // would even compute during a drag is moot; effectiveHeightPx already
  // reads dragHeightPx itself when a drag is active, so this stays frozen
  // at startHeight's own value for the duration regardless, exactly as it
  // did before any of this file's drag-specific rounds existed. This one
  // formula is genuinely only for the settled/open/close/snap case now.
  const targetMarginTop = editMode ? -(effectiveGrowableFixedOverheadPx + effectiveHeightPx) : 0;
  const targetHeight = editMode ? effectiveHeightPx : 0;
  const targetMarginBottomPx = editMode ? DIALOG_MARGIN_BOTTOM_PX : 0;
  // The geometry transition — instant (duration 0) whenever nothing is
  // actually transitioning (idle, or every live-drag tick, since drag never
  // sets isEditModeTransitioning/isSnapTransitioning at all — see
  // handleResizeStart's own comment), EDIT_PANEL_TRANSITION_MS otherwise.
  // Reused identically by the outer wrapper's marginTop and dialogRef's
  // height/marginBottom (below) so the three can never drift out of sync
  // with each other — the same reason this was a single shared object even
  // back when it fed Motion's `transition` prop instead of a CSS one (see
  // DESIGN_SYSTEM.md for the "Round 4" writeup on why this moved off
  // Motion's `layout="position"` — the short version: that mode measures
  // a rect delta and fakes it with a translate, snapping the real SIZE
  // instantly, which is exactly what produced the "appears instantly, then
  // the mixbar swings into place" bug. A genuine CSS transition on the real
  // height/marginTop values has no size-vs-position gap to fake in the
  // first place — nothing to swing, because nothing is ever wrong).
  //
  // A CSS transition, not Motion's `animate()` — deliberately, so this and
  // the drag-time motion-value writes elsewhere in this file can never
  // race each other: a CSS transition is resolved entirely by the browser
  // off the main thread's own commit timing (starts the instant the new
  // style value paints), while `animate()` starts from a `useEffect`,
  // which runs one tick after commit — a gap this file's own history says
  // is exactly wide enough to cause visible desync (see
  // effectiveGrowableFixedOverheadPx's own comment, above, on the
  // discarded-intermediate-value bug `layout="position"` hit for the
  // identical reason). Two CSS transitions, both keyed off the same style
  // commit, can't drift apart the way a CSS transition and a JS-effect-
  // triggered animation could.
  const geometryTransitionMs = isEditModeTransitioning || isSnapTransitioning ? EDIT_PANEL_TRANSITION_MS : 0;
  const geometryTransitionTiming = `${geometryTransitionMs}ms ${NAMED_EASE_TO_CUBIC_BEZIER[animationDebug.editPanelEase] ?? "ease-in-out"}`;

  // Measures growableFixedOverheadPx — see that state's own comment
  // (near its declaration) for why this is deliberately NOT the fast-
  // changing path: growableRef.height - effectiveHeightPx is the part of
  // growableRef that ISN'T the pool panel (resize row, dialogRef's own
  // margin), which only actually changes at real breakpoints, never
  // during a plain resize-drag — effectiveHeightPx itself changes every
  // drag tick, but it's subtracted out here specifically so this stored
  // number doesn't have to.
  //
  // useLayoutEffect, not useEffect — see fixedOverheadPx's own comment
  // above for the confirmed-live first-open jump this fixes (this state
  // starts at 0 with no bootstrap constant of its own, unlike
  // fixedOverheadPx, so it was the more visible half of that bug).
  useLayoutEffect(() => {
    if (!editMode) return;
    const growable = growableRef.current;
    if (!growable) return;
    function measure() {
      // Same open/close-transition freeze as fixedOverheadPx's own
      // measure() — see isTransitioningRef's own declaration. Especially
      // important here: this subtraction (growable.height minus the
      // *already-final-target* effectiveHeightPxRef.current) goes
      // negative for most of an opening transition, since growable's real
      // height starts near 0 and only catches up to effectiveHeightPx at
      // the very end — clamped to 0 by the Math.max below, so an
      // unfrozen mid-transition read wouldn't just be imprecise, it would
      // be a flat wrong 0 for nearly the whole animation.
      if (isTransitioningRef.current) return;
      // Also skips every call while a live drag is active — added once
      // growableRef itself started pinning its own real height to
      // poolPanelMaxHeight for a drag's duration (see that ref's own
      // comment): this ResizeObserver still fires on that jump (and on
      // every other resize event that happens to land during a drag),
      // and without this guard it was measuring that artificially-maxed
      // height as if it were real, computing a wildly inflated overhead
      // that fed straight into targetMarginTop — confirmed live as a real
      // bug: cardRef's own visual position jumped ~600px off-screen the
      // instant a drag started. fixedOverheadPx's own measure() already
      // had this exact guard (isDraggingRef.current); this one needed it
      // too once growableRef started changing size for reasons other than
      // genuine breakpoint/content shifts. Nothing is lost by skipping —
      // growableFixedOverheadPx doesn't need to track anything mid-drag
      // (see this effect's own top comment: it only actually changes at
      // real breakpoints), and handleEnd's own catch-up call already
      // re-measures the instant the drag ends.
      if (isDraggingRef.current) return;
      // See editModeRef's own comment near its declaration — a late,
      // async callback from an instance whose editMode has since flipped
      // back to false would otherwise measure growable's collapsed
      // (resize row unmounted, dialog max-h-0) height and commit a wrong,
      // near-zero overhead.
      if (!editModeRef.current) return;
      setGrowableFixedOverheadPx(Math.max(0, growable!.getBoundingClientRect().height - effectiveHeightPxRef.current));
    }
    measureGrowableFixedOverheadRef.current = measure;
    const observer = new ResizeObserver(measure);
    observer.observe(growable);
    measure();
    return () => observer.disconnect();
  }, [editMode]);

  // Quick-resize buttons in the resize-handle row — 50%/100% are both
  // fractions of the SAME reference, poolPanelMaxHeight (the live-measured
  // ceiling the drag handle itself already respects), not the raw
  // viewport — one consistent basis for the pair rather than two different
  // ones. Clears any in-flight drag too, not just the persisted value.
  //
  // isSnapTransitioning triggers the same smooth grow/shrink animation as
  // opening/closing (see EDIT_PANEL_TRANSITION_MS's own comment), requested
  // as a follow-up once that mechanism was confirmed stable — a snap-click
  // now eases toward its target instead of jumping instantly. A plain
  // state set directly in this event handler, not the render-phase
  // pattern isEditModeTransitioning needs (that one exists specifically
  // because editMode is a prop this component doesn't control the timing
  // of; this one changes in response to a click this same handler already
  // owns, so there's no "adjust state when a prop changes" problem to work
  // around — an ordinary setState call in an event handler needs no
  // special-casing).
  function handleSnapPoolHeight(fraction: number) {
    setDragHeightPx(null);
    isTransitioningRef.current = true;
    setIsSnapTransitioning(true);
    setPoolPanelHeightPref(poolPanelMaxHeight * fraction);
  }
  // The down arrow's own target — POOL_HEIGHT_MIN, not a fraction of
  // poolPanelMaxHeight, so this can't just be another handleSnapPoolHeight
  // call. Same transition-triggering as the 50%/100% snaps, requested to
  // match.
  function handleResetPoolHeight() {
    setDragHeightPx(null);
    isTransitioningRef.current = true;
    setIsSnapTransitioning(true);
    setPoolPanelHeightPref(POOL_HEIGHT_MIN);
  }
  // Clears the snap-triggered freeze the same way isEditModeTransitioning's
  // own effect clears its — see that effect's comment for why a setTimeout,
  // not transitionend.
  useEffect(() => {
    if (!isSnapTransitioning) return;
    const timeout = setTimeout(() => {
      isTransitioningRef.current = false;
      setIsSnapTransitioning(false);
      measureFixedOverheadRef.current();
      measureGrowableFixedOverheadRef.current();
    }, EDIT_PANEL_TRANSITION_MS);
    return () => clearTimeout(timeout);
  }, [isSnapTransitioning, EDIT_PANEL_TRANSITION_MS]);
  // The single resize arrow only shows when its own target is actually
  // reachable — on a short enough viewport, poolPanelMaxHeight itself
  // shrinks small enough that a fraction of it (half, for 50%; the whole
  // ceiling, for 100%) lands at or below POOL_HEIGHT_MIN, the floor
  // clampPoolPanelHeight already enforces on every source (default/
  // persisted/dragged). Without this check, the arrow would still be
  // tappable but silently do the same thing the floor already guarantees
  // on its own — clamped straight back up to POOL_HEIGHT_MIN, never
  // actually landing at a visibly distinct "half" or "full" — reading as
  // broken rather than just unreachable at this size. Both live
  // (poolPanelMaxHeight is the resize-reactive hook, not a one-time read),
  // so they hide/reappear in step with the same window resizes that make
  // effectiveHeightPx itself re-clamp.
  const canReachHalfHeight = poolPanelMaxHeight * 0.5 > POOL_HEIGHT_MIN;
  const canReachFullHeight = poolPanelMaxHeight > POOL_HEIGHT_MIN;
  // Hides the arrow entirely once the panel is already at its ceiling —
  // there's nowhere left to jump to (see trailingControls' own comment for
  // the full one-arrow-at-a-time logic this feeds). 1px tolerance for
  // float rounding, not an exact equality check.
  const isAtFullHeight = Math.abs(effectiveHeightPx - poolPanelMaxHeight) <= 1;
  // Which of the two arrows trailingControls shows: below this, 50%;
  // at/above it, 100% (see that comment for the full one-arrow logic).
  // The same 1px tolerance as isAtFullHeight above, biased toward "at or
  // above half" rather than a bare strict `<` — confirmed live as a real
  // bug without it: clicking the 50% snap button sets effectiveHeightPx to
  // exactly poolPanelMaxHeight*0.5 at that instant, but poolPanelMaxHeight
  // itself can drift by a sub-pixel amount on the very next measurement
  // (the same live ResizeObserver-driven value used throughout this file),
  // and a zero-tolerance `effectiveHeightPx < poolPanelMaxHeight * 0.5`
  // flipped back to "below half" from that drift alone, leaving the 50%
  // arrow stuck showing forever after the very first tap even though the
  // panel had genuinely already snapped to half.
  const isBelowHalfHeight = effectiveHeightPx < poolPanelMaxHeight * 0.5 - 1;

  // Pointer Events + setPointerCapture, not the dual mouse/touch listeners
  // this used before (ScrollFadeArea's press-and-hold arrows still use that
  // pattern, deliberately — see that file's own comment; this control's own
  // history is below). Switched specifically for the capture guarantee:
  // setPointerCapture tells the browser the grip now owns this gesture (a
  // stronger guarantee than touch-action:none + preventDefault alone, which
  // are what stop a *new*, not-yet-captured touch from starting a native
  // scroll in the first place — capture doesn't cover that half, so both
  // are kept, below). Confirmed live as a real, separate bug from the
  // poolPanelMaxHeight double-clamp above: on a real mobile device, a
  // resize-drag could still leak enough of a scroll gesture to the page
  // behind it to nudge scrollY, which in turn can trigger the browser's own
  // address-bar hide/show (itself a `resize` event) — the two fixes
  // reinforce each other, but this one addresses the root cause (a leaking
  // gesture) rather than only the symptom (this component reacting badly to
  // a resize once one happens).
  //
  // The actual pointermove/pointerup/pointercancel listeners live on
  // `window`, not the captured grip element itself — see handleEnd's own
  // comment below for the real, confirmed-live bug that requires this
  // (the grip can still be removed mid-drag by paths capture alone doesn't
  // prevent, and window-level listeners are what keep the drag endable
  // when that happens). setPointerCapture and "where the continuation
  // listeners live" are independent concerns: capture is about gesture
  // *ownership*, not about restricting which element may observe the
  // resulting events.
  function handleResizeStart(e: React.PointerEvent<HTMLButtonElement>) {
    // Primary button only for mouse (a right/middle-click drag makes no
    // sense here) — pointerType is empty for this check on touch/pen,
    // where e.button is always 0 anyway.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Confirmed live as a real, separate bug: setPointerCapture can throw
    // ("No active pointer with the given id is found") under rapid/
    // overlapping touch conditions — a fast, repeated series of taps can
    // mean the specific pointer id this handler receives is no longer
    // considered active by the time this line runs. Uncaught, that
    // exception aborted the *rest* of this function too — isDraggingRef
    // never got set and the drag-continuation listeners below never
    // attached, silently. try/catch here means a failed capture
    // only loses the gesture-ownership guarantee (see this function's own
    // top comment) for that one interaction; the drag itself still starts
    // and tracks correctly via the window-level listeners regardless.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Best-effort only — see comment above.
    }
    const startHeight = effectiveHeightPx;
    const startY = e.clientY;
    const liveHeightRef = { current: startHeight };
    // See fixedOverheadPx's own effect (above) for why this freezes
    // poolPanelMaxHeight for the duration of the drag — isDraggingRef's
    // own purpose, unrelated to the grip's mount guarantee: that comes
    // from frozenReachability instead (see its own declaration), set
    // by handleRowPointerDown on the shared container, which this
    // pointerdown already bubbles up to on its own — nothing extra needed
    // here for that half.
    isDraggingRef.current = true;
    // dragLiveHeight/dragMarginTop (see their own declaration, near
    // dragHeightPx above, for the full Round 5 history) seed to EXACTLY
    // the same values targetHeight/targetMarginTop already hold for
    // startHeight — a true no-op continuation, not a jump of any kind,
    // since dragHeightPx itself is also startHeight at this exact instant
    // (set just below, same commit). Both motion values then track the
    // live drag target every tick in flushPendingMove.
    dragLiveHeight.set(startHeight);
    dragMarginTop.set(-(effectiveGrowableFixedOverheadPx + startHeight));
    // Sets dragHeightPx (React state) here, synchronously, at press —
    // not deferred to the first pointermove tick the way it used to be.
    // growableRef/dialogRef/cardRef's own styles all key off
    // `dragHeightPx !== null` to switch into their drag-pinned mode (see
    // each one's own comment); the motion values seeded just above are
    // only correct once that switch has actually happened, so both need
    // to land in the same commit — React flushes a synchronous event
    // handler's own setState calls before the next paint, same guarantee
    // the motion values above rely on.
    setDragHeightPx(startHeight);
    // Same bottom-scroll-restore the editMode-open effect above uses (see
    // its own comment for the full mechanism/reasoning). Armed here AND
    // re-armed on every tick in flushPendingMove below — real growth
    // (dragLiveHeight, a real layout property) happens on every tick again
    // under Round 5 (see that motion value's own comment for why), so the
    // page's own real scrollHeight can change on every tick too, not just
    // once at drag start.
    pinScrollToDocumentBottomIfWasAtBottom();
    // rAF-throttles the live-drag visual to at most once per paint frame —
    // added after measuring, via Chrome's own Performance.getMetrics
    // (LayoutCount), that handleMove previously committed a change on every
    // raw pointermove with no throttle at all: on a device/input that fires
    // pointermove faster than the display can paint (common on touchscreens
    // and high-poll-rate mice), that's work spent on frames that could
    // never even be shown. pendingNext always holds the latest computed
    // target regardless of how many pointermove events arrive between two
    // paints; only the most recent one is ever actually applied.
    // preventDefault stays outside the throttle, on every raw event,
    // unchanged — it has to run synchronously for the specific event it's
    // suppressing, deferring it a frame would be too late.
    //
    // flushPendingMove still doesn't call setDragHeightPx (React state) on
    // every tick — dragLiveHeight/dragMarginTop (Motion values, `.set()`)
    // update the DOM directly, outside React's render cycle, so there's no
    // reconciliation cost added on top of the real layout pass each tick
    // already costs (see those two motion values' own declaration for why
    // that real cost is accepted under Round 5). React state (dragHeightPx)
    // is only touched twice per drag — once at handleResizeStart, once at
    // handleEnd — purely to switch every element's style prop into and out
    // of "drag mode," not to carry the live value itself.
    let pendingNext: number | null = null;
    let rafId: number | null = null;
    function flushPendingMove() {
      rafId = null;
      if (pendingNext === null) return;
      const next = pendingNext;
      pendingNext = null;
      liveHeightRef.current = next;
      dragLiveHeight.set(next);
      dragMarginTop.set(-(effectiveGrowableFixedOverheadPx + next));
      pinScrollToDocumentBottomIfWasAtBottom();
    }
    function handleMove(ev: PointerEvent) {
      // Still calling preventDefault, even with capture + touch-action:none
      // both already in place — belt-and-suspenders, matching this app's
      // own established style of not relying on a single layer of defense
      // for "must not scroll the page" guarantees elsewhere in this file
      // (see blockScrollThrough, above).
      ev.preventDefault();
      // Dragging up (finger/mouse Y decreases) grows the panel — matches
      // the physical "pull the sheet's ceiling up to make it taller"
      // model. The handle itself sits above the title row, but what it
      // actually resizes is still just the pool panel: title/slots/
      // controls are fixed, so growing the *total* bar can only ever be
      // absorbed by the one flexible region.
      const delta = startY - ev.clientY;
      pendingNext = clampPoolPanelHeight(startHeight + delta, poolPanelMaxHeight);
      if (rafId === null) {
        rafId = requestAnimationFrame(flushPendingMove);
      }
    }
    function handleEnd() {
      // Applies whatever arrived after the last committed frame (or a
      // still-queued frame that hasn't run yet) synchronously, before
      // reading liveHeightRef below — otherwise the persisted height could
      // be up to one frame stale relative to the pointer's true final
      // position, and cancels any queued frame so it can't fire again
      // after setDragHeightPx(null) below, which would otherwise flicker
      // the panel back to a mid-drag height for one frame right after
      // release.
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      flushPendingMove();
      setPoolPanelHeightPref(liveHeightRef.current);
      // Reset dragLiveHeight/dragMarginTop to the REAL, final settled
      // values (not just an arbitrary "identity" like 0) — defensively,
      // not because it's strictly required: once dragHeightPx goes back to
      // null below, every style prop that reads these motion values
      // switches its ternary to the plain, real targetHeight/
      // targetMarginTop branch instead, so neither should still be
      // rendered from at all. But growableRef's own clipPath bug (this
      // file's own earlier history, now removed entirely along with the
      // clip-path mechanism it belonged to) already proved once that a
      // motion-value-bound style can outlive the render that stopped
      // referencing it — resetting to the correct final value rather than
      // an arbitrary one means even a leftover, unexpected read of either
      // value here would show the right thing, not a stale mid-drag one.
      dragLiveHeight.set(liveHeightRef.current);
      dragMarginTop.set(-(effectiveGrowableFixedOverheadPx + liveHeightRef.current));
      setDragHeightPx(null);
      isDraggingRef.current = false;
      // Catches up on anything that changed while frozen (e.g. a mobile
      // address-bar resize mid-drag) rather than waiting on the next
      // incidental ResizeObserver/resize event to notice — see this ref's
      // own comment near its declaration.
      measureFixedOverheadRef.current();
      // One more arm: measureFixedOverheadRef's own catch-up measurement,
      // right above, can itself commit a state update that shifts marginTop
      // for one more frame right as the drag ends.
      pinScrollToDocumentBottomIfWasAtBottom();
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
    }
    // Listeners live on `window`, not the captured grip element — confirmed
    // live as a real, serious bug the other way: canShowResizeHandleRowDisplay
    // (above) now keeps the grip mounted for a drag's whole duration, but
    // that guard can't cover every path that removes it (editMode itself
    // can still close mid-drag via Esc/click-outside, independent of
    // anything this control does). When the grip's own listeners went with
    // it, `handleEnd` was orphaned on a detached node that never receives
    // another event — isDraggingRef.current stuck `true` forever, freezing
    // fixedOverheadPx's measurement permanently and cascading into every
    // downstream consumer (poolPanelMaxHeight, effectiveHeightPx,
    // TagPoolBody's own poolPanelHeightPx), confirmed live as the shared
    // root cause behind three symptoms that looked unrelated at first:
    // a stuck-open drag, the resize controls vanishing for good, and a
    // stale height/position on a later reopen. setPointerCapture (still on
    // the grip, above) is unaffected by where these listeners live — it
    // governs gesture *ownership*/hit-testing, not which element is
    // allowed to listen for the resulting events, and `window` always
    // receives pointermove/pointerup regardless of which element (if any)
    // currently holds capture. pointercancel (a real gesture interruption —
    // e.g. the OS taking over for a system gesture) ends the drag the same
    // as a normal release, rather than leaving it stuck open.
    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);
  }

  // Passed into TagPoolBody as trailingControls, rendered as the fixed
  // (shrink-0) sibling next to its own scrollable section-tab strip — this
  // used to be its own row here, above the pool panel, back when it also
  // held the Tag Density/Sort filters (which kept that row reachable even
  // when canShowResizeHandleRowDisplay was false). Now that those filters
  // live in ResultsFilterButton's popover instead, there's nothing left to
  // anchor a separate row's own height independent of this cluster's — so
  // rather than patch that row to stay stable, it's gone, and this cluster
  // rides along inside TagPoolBody's own already-self-measuring tab row.
  // All of the state/handlers below (frozenReachability,
  // canShowResizeHandleRowDisplay, handleRowPointerDown, handleResizeStart,
  // handleSnapPoolHeight, handleResetPoolHeight) are untouched — only where
  // this JSX renders moved.
  //
  // 50%/100%/Reset + grip stay gated on canShowResizeHandleRowDisplay,
  // exactly as before (dragging/snapping something that can't actually
  // resize anything shouldn't be reachable at all). The close button is
  // NOT inside that gate — closing the panel must stay reachable even at
  // the shortest viewports where resizing itself has stopped being useful.
  const trailingControls = (
    <div className="flex items-center gap-0 shrink-0">
      {canShowResizeHandleRowDisplay && (
        // onPointerDown here (not on each button individually) is
        // handleRowPointerDown — see its own declaration for why one
        // shared listener on this common ancestor, relying on normal
        // bubbling, covers a press starting on any of the four children
        // (the three shortcut buttons below, or the grip) — below
        // min-[993px] (mobile, see that div's own comment), only the grip
        // is actually reachable, but the listener itself doesn't need to
        // know or care which of the four is what bubbled the event up to
        // it.
        <div className="flex items-center gap-0" onPointerDown={handleRowPointerDown}>
          {/* hidden min-[993px]:flex — mobile-only removal, requested
              directly: a touch-primary user already has the grip itself
              for manual resizing, full-range and one gesture away, so
              these three shortcuts (jump to 50%/100%/default) are
              redundant convenience desktop keeps for a mouse-driven,
              click-based interaction style. min-[993px] is not a new
              number invented for this — it's this cluster's own prior
              desktop threshold (see canShowResizeHandleRow's neighborhood,
              "an earlier version hid the resize handle below 993px" —
              reverted then because it hid the *grip* too, leaving mobile
              with no way to resize at all; this is deliberately narrower,
              hiding only the three shortcuts and never the grip) and the
              same breakpoint Row 3 below already uses for its own
              icon-vs-text desktop split (min-[993px]:hidden on Tag
              Pool/Random/Clear's mobile icon-only form) — one consistent
              "is this desktop" line for the whole bar, not a second one
              invented here.

              Purely a rendering change, nothing underneath it: every one
              of this session's fixes for these three buttons —
              frozenReachability's per-element reachability snapshot, the
              mid-press mount-unmount protection it replaced a flawed
              shared-boolean version of, handleRowPointerDown's own
              bubbling wiring — still runs exactly as before, completely
              unmodified, on every breakpoint including mobile. */}
          <div className="hidden min-[993px]:flex items-center gap-0">
            {/* One arrow at a time, chosen by the panel's current position —
                a clean 3-state cycle, never two shown together. Below 50%
                of poolPanelMaxHeight: the 50% arrow. At 50% or above but
                short of 100%: the 100% arrow. At 100%: a down arrow back to
                POOL_HEIGHT_MIN (the default/minimum, not halfway back down
                to 50% — requested directly, matching the old Reset
                button's own target from before this became a single-arrow
                cycle). Dragging back down by hand via the grip is also
                always available regardless of which arrow (if any) is
                currently showing.

                frozenReachability substitutes for the live
                canReach*Height — see that state's own declaration for the
                confirmed-live bug this closes, and for why an earlier
                one-shared-boolean version of this fix was itself wrong. A
                straight substitution (not an OR): each button's
                *reachability* freezes to whatever it was at press-start,
                but isAtFullHeight and the position comparison below stay
                fully live against the actively-dragged effectiveHeightPx,
                so this still correctly swaps/hides the instant a real drag
                crosses 50% or reaches 100% — only the "is this reachable
                at all" half is frozen, and only for the span of a press. */}
            {isAtFullHeight
              ? (frozenReachability ? frozenReachability.canReachFull : canReachFullHeight) && (
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
                )
              : isBelowHalfHeight
                ? (frozenReachability ? frozenReachability.canReachHalf : canReachHalfHeight) && (
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
                  )
                : (frozenReachability ? frozenReachability.canReachFull : canReachFullHeight) && (
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
          </div>
          {/* IconButton, not a bare div — matches the arrow and Close
              buttons on either side of it exactly (same size="sm" 30×30
              box, same border/background treatment), requested directly
              for consistency after a reported (not reproduced in this
              project's own headless testing, across many click/drag
              orderings and timings) real-device issue where dragging
              right after tapping a resize arrow didn't respond. Still not
              a <button>-flavored *action* — role="separator" overrides
              the implicit button role, since this element still isn't
              "activatable" the way Close is, only draggable — but going
              through IconButton at least gives it the same defensive
              pointer-events-auto every other icon control on this bar
              already has (see IconButton's own comment on why that's
              there), which a plain div never picked up. onPointerDown is
              still handleResizeStart, unchanged — only the element it's
              attached to changed. */}
          <IconButton
            size="sm"
            border="none"
            backgroundColor="transparent"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Drag to resize edit panel"
            onPointerDown={handleResizeStart}
            className="cursor-ns-resize select-none touch-none"
          >
            <GripIcon className="text-[var(--muted)]" />
          </IconButton>
        </div>
      )}
      <IconButton size="sm" border="none" backgroundColor="transparent" title="Close" aria-label="Close" onClick={onCloseEditMode}>
        <CloseIcon className="text-[var(--muted)]" />
      </IconButton>
    </div>
  );

  return (
    // sticky bottom-[space-2xl] — the last section of the page's own
    // max-w-[1280px] mx-auto column (see KonomiApp.tsx), pinned
    // space-2xl above the viewport bottom once the page scrolls, settling
    // back to its own ordinary in-flow position (respecting KonomiApp's own
    // trailing pb-[space-2xl]) once everything already fits — see this
    // file's own top comment for why this replaced plain normal flow and
    // the history behind that choice. No px/pb-[space-2xl] here either,
    // same reason as before: that framing comes from the shared
    // max-w-[1280px] ancestor (left/right) and KonomiApp's own root
    // pb-[space-2xl] (bottom) — this wrapper adding its own would
    // double-count both, in either position mode.
    //
    // Confirmed live before adopting sticky: KonomiApp's own overflow-x-clip
    // ancestor does NOT make it (instead of the true viewport) this bar's
    // sticky containing block, despite overflow-x-clip technically making
    // that div a "scroll container" per spec — tested with a genuinely tall
    // page, the bar stuck to the real viewport bottom for the entire scroll
    // range and returned to normal flow only once the page ran out.
    //
    // Conditionally zeroing marginTop while stuck (an `isStuck` state,
    // detected via remaining-scroll-distance) was tried and reverted:
    // while genuinely stuck, marginTop's own contribution to the bar's
    // *final rendered position* really is a no-op regardless of its value
    // (confirmed live, sticky's own bottom constraint wins) — but its
    // OTHER job, canceling the growable content's contribution to the
    // *page's total layout height*, is not a no-op, and nothing else was
    // standing in for that once it was removed. Growing the box with
    // marginTop zeroed made its un-compensated natural height push the
    // page's own scrollHeight taller — which is exactly the input
    // `isStuck`'s own remaining-scroll-distance measurement reads — so
    // opening edit mode could flip `isStuck` true (or leave it stale) as a
    // side effect of the very change its own value was supposed to gate,
    // a real circular dependency, not just a redundant computation.
    // Confirmed live as a real, reproducible regression: the bar's bottom
    // edge visibly pushed *down* on open instead of the box growing purely
    // upward, worse after repeated open/close cycles while stuck (each
    // cycle compounding the same feedback rather than settling). Reverted
    // in favor of what's below — marginTop always computed, unconditionally,
    // the same as before sticky existed. It's a confirmed no-op purely
    // visually whenever the bar happens to be stuck, at the cost of one
    // redundant (harmless) style computation in that case — a much better
    // trade than a value that can feed back into its own input.
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
    // for the exact mechanism, computed unconditionally (not gated on
    // whether the bar happens to be stuck right now — see the paragraph
    // above for why that was tried and reverted). While genuinely stuck,
    // this ends up a harmless no-op for the bar's own final rendered
    // position (native sticky's bottom offset determines that regardless),
    // but it's still load-bearing for the not-stuck case, and for keeping
    // the page's own total height correct in both.
    // The ternary reads `editMode` directly (not just the measured state
    // variable) so the margin snaps back to 0 the instant editMode goes
    // false, rather than waiting on the measurement effect's own cleanup
    // to catch up.
    //
    // layout="position" (Motion, motion/react), not full `layout` — this
    // is the THIRD mechanism this box has used to grow/shrink smoothly,
    // after a hand-built FLIP and then two different Motion arrangements,
    // and the reasoning for landing here is worth spelling out in full.
    //
    // Round 1 (hand-built FLIP, removed): manually tracked committed vs.
    // visual geometry, an imperative animate() call. Shipped three
    // real bugs across two retest rounds — replaced by Motion's own
    // `layout` prop, applied to growableRef alone (below), which measures
    // growableRef's own rendered rect before/after each commit and
    // animates the difference automatically.
    //
    // Round 2 (full `layout` on growableRef alone, since reverted):
    // worked, but only ever animated growableRef's OWN box — cardRef
    // itself (this element) stayed a plain, instantly-snapping div, since
    // this app's own "base mixbar must never animate" requirement (Row 2's
    // own comment, below) meant giving cardRef `layout` too required Row 2
    // to carry a matching counter-`layout` (Motion's documented fix for
    // child distortion under a scaling ancestor) to cancel out cardRef's
    // own scale. Reported live, twice, as two DIFFERENT bugs depending on
    // which element had the animation: with only growableRef animated,
    // cardRef's own border/shadow "just appears" (already at its final
    // size from the first frame, since cardRef's real height is simply the
    // sum of its children's real, already-final heights) while
    // growableRef's own content visibly scales inside it — reported
    // directly as "the tabs and tags are animating, but the outside panel
    // border is just appearing." With BOTH cardRef and Row 2 given
    // `layout` (to fix that), two separately-computed Motion scale
    // animations trying to cancel out exactly, every frame, showed up as
    // visible vibration/pulsing in Row 2's own content instead.
    //
    // Round 3 (here): `layout="position"` on cardRef ALONE, nothing on
    // growableRef/dialogRef at all (both reverted to plain divs, below).
    // Motion's docs describe `layout="position"` as animating ONLY an
    // element's position, letting any size change snap instantly — no
    // scale, ever, for this element or (critically) anything painted
    // inside it, since a pure translate carries all descendants rigidly
    // along with it with no distortion, unlike a scale. That's what
    // breaks the round-2 dilemma: Row 2 needs NO counter-animation of its
    // own anymore, not because it's been tuned to cancel cardRef's
    // transform correctly, but because there is no scale for it to
    // counter in the first place — it simply inherits cardRef's single
    // translateY for free, via ordinary CSS transform inheritance, the
    // same way it always would have. And because the translate is applied
    // to cardRef itself (not just growableRef, buried inside it), the
    // whole card — border, shadow, and all — visibly slides to its new
    // position as one rigid unit, which is what actually reads as "the
    // panel smoothly animates," not just its inner content. The tradeoff,
    // accepted directly per this round's own request ("remove the
    // animation for the content inside and just focus on the panel
    // animation for now"): growableRef's content no longer fakes a
    // "growing" illusion of its own at all — TagPoolBody's tabs/chips are
    // simply present at their real, final layout from the first frame,
    // riding along with cardRef's slide rather than separately animating.
    //
    // Round 4 (current): `layout="position"` removed from cardRef and
    // Row 2 both. Round 3 (above) was already a real improvement — no
    // scale, no vibration — but reported live, precisely: "the mixbar
    // pushes down as the panel goes up, and the panel appears instantly
    // then fills, instead of smoothly expanding from a fixed base."
    // Traced to what "position, letting any size change snap instantly"
    // actually means mechanically: cardRef's real height commits to its
    // FULL final value in the same React commit editMode/drag toggles it
    // (nothing here ever animated real height), so `layout="position"`
    // is handed an already-full-size box and a rect delta (old top-left
    // vs. new top-left) to fake smoothness with — a translate that starts
    // the box at the OLD rect's position and eases toward the NEW one.
    // Measured directly (getComputedStyle sampling every ~8ms through a
    // real open transition): cardHeight snapped 80.5→256.5px in a single
    // frame while transformY eased 169.9→0 over the remaining ~250ms —
    // meaning the box's BOTTOM edge swept through that same ~170px range
    // before settling, even though Row 2 (riding inside it, with its own
    // independent `layout="position"` — see Row 2's own comment, below,
    // for how that nested-layout counter-tracking works) stayed
    // measurably fixed throughout. The border/background visibly
    // overshot past the stable controls and slid back — that's the
    // "pushes down" and "appears instantly" reports, precisely.
    //
    // The fix isn't a better transform — it's not faking a reveal at all.
    // The outer wrapper's `marginTop` and dialogRef's `height`/
    // `margin-bottom` (both below) now animate via a genuine CSS
    // `transition` (geometryTransitionTiming, declared near
    // targetMarginBottomPx above) instead of committing instantly and
    // relying on `layout="position"` to paper over the gap. Real geometry
    // moving smoothly means there's no size-vs-position mismatch for any
    // translate to compensate for in the first place — cardRef's own
    // bottom edge (and Row 2's real position) is correct at every single
    // frame, not just the two endpoints, by the same marginTop-cancels-
    // height algebra this file already relies on for the instant case
    // (see growableFixedOverheadPx's own comment, far above) — provably
    // so, not just observed: since both properties share the exact same
    // transition-duration and transition-timing-function, and their sum
    // already cancels to a constant at both endpoints, linear
    // interpolation guarantees the sum stays constant at every point in
    // between too, regardless of how curved the shared easing is. See
    // DESIGN_SYSTEM.md for the full writeup, including why this is CSS-
    // transition-driven rather than Motion's `animate()` (timing-sync
    // risk between a browser-native transition and a JS-effect-triggered
    // one), and why the outer wrapper deliberately stays untouched by
    // this — still no Motion involvement on it at all, exactly as Round 3
    // left it, for the sticky+transform WebKit reason below.
    //
    // Live drag is unaffected by any of this — handleResizeStart/
    // handleMove/handleEnd (below) never set isEditModeTransitioning or
    // isSnapTransitioning, so geometryTransitionMs is already 0 for the
    // whole gesture regardless. cardRef itself no longer carries any
    // transform at all for the live-drag case either — see
    // targetMarginTop's own comment (above) for why a transform-based
    // compensation, even a per-drag constant one, turned out to be wrong
    // here too, and what replaced it.
    // Outer wrapper, new this round — carries `sticky`/z-index/`touch-none`
    // and the REAL, instant `marginTop` (targetMarginTop), with NO border/
    // padding/background of its own and NO Motion involvement whatsoever.
    // Added specifically to stop `position: sticky` and Motion's own
    // `layout="position"`-driven `transform` from ever being declared on
    // the SAME element — reported live as a regression of a much older
    // fix ("we have patch notes for this somewhere way before we started
    // the migration... to motion animation"): scrolling a gesture that
    // starts on the panel leaks through to scroll the whole page behind
    // it again, on mobile specifically (not reproducible here — every
    // wheel/mouse/CDP-synthetic-touch repro attempted in headless
    // Chromium still blocks correctly; see DESIGN_SYSTEM.md for the full
    // list tried). `position: sticky` combined with an active CSS
    // `transform` on the *same* element is a known category of WebKit
    // quirk (their interaction with the compositor's own scroll/gesture
    // recognition is documented as inconsistent across iOS versions) —
    // this bar started acquiring an actual, non-identity `transform` on
    // this exact element only once cardRef itself picked up
    // `layout="position"` this round (previously only growableRef, a
    // plain non-sticky descendant, ever carried one). Splitting the two
    // concerns onto two different elements — this outer one stays sticky
    // and transform-free always; the inner motion.div below gets the
    // transform and is never itself positioned — sidesteps the whole
    // category rather than chasing the specific mechanism, since it can't
    // be directly confirmed without a real device. A defensive fix for
    // the leading hypothesis, not a guess at a different root cause —
    // needs on-device confirmation, the same as this codebase's other
    // real-device-only WebKit fixes (see DESIGN_SYSTEM.md).
    <motion.div
      className="sticky bottom-[var(--space-2xl)] z-[var(--z-overlay)] max-w-[1280px] mx-auto touch-none"
      // dragMarginTop during a live drag (a Motion value, `.set()` every
      // tick — see its own declaration, near dragHeightPx, for the full
      // Round 5 history), targetMarginTop otherwise — same key, switching
      // which kind of value it holds, not a conditionally-present key (see
      // growableRef's own comment, further down, for why that distinction
      // matters). Still a `transition` CSS property alongside it either
      // way: geometryTransitionTiming already evaluates to an instant 0ms
      // for the whole drag (isEditModeTransitioning/isSnapTransitioning
      // are never set by a drag), so this is a harmless no-op then and the
      // real, intended animated transition for the open/close/snap case.
      // motion.div, not a plain div, purely for this one conditional
      // binding — still carries no `layout`/`style.y`/any transform of its
      // own, so the sticky+transform WebKit concern this element's own
      // history already worked through (see below) doesn't apply: nothing
      // here is a `transform`.
      style={{
        marginTop: dragHeightPx !== null ? dragMarginTop : targetMarginTop,
        transition: `margin-top ${geometryTransitionTiming}`,
      }}
    >
      <motion.div
        ref={cardRef}
        // No `layout` prop and no style.y/transform of any kind anymore —
        // see targetMarginTop's own comment (above) for the full history of
        // why: both the open/close/snap case (a real CSS transition on the
        // outer wrapper's marginTop and dialogRef's height/margin-bottom)
        // and the live-drag case (targetMarginTop itself now correctly
        // accounts for growableRef's real-height pin, in the same commit
        // that pin happens) make this box's own real geometry correct on
        // every frame, from the very first one, with nothing left for any
        // transform to fake or compensate for. Still a motion.div (not a
        // plain div) purely so cardRef keeps working as a ref target here
        // without an unrelated type change — it carries no Motion-specific
        // props at all now.
        // z-index/touch-none/sticky/marginTop all moved to the new outer
        // wrapper above — see its own comment for why. This element keeps
        // only what it visually needs to paint the card (border/padding/
        // background/shadow); it carries no positioning of its own at all
        // (a plain in-flow block, filling its sticky parent's full box).
        className="px-[var(--space-2xl)] py-[var(--space-xl)] border-[length:var(--border-base)] border-[var(--ink)] bg-[var(--surface)] shadow-[var(--elev-4)]"
      >
      {/* growableRef wraps dialogRef alone now — no separate resize-handle
          row sibling anymore (see this file's own top comment for why that
          row is gone entirely rather than patched). Still exists purely
          for measurement (see growableFixedOverheadPx's own comment
          above), with no border/background/padding of its own.
          Sits directly above the slots — not between the slots and
          controls, where an earlier version placed it — so opening/
          closing edit mode only ever inserts/removes this one block in a
          single spot, rather than also shifting the slots row itself
          down and back.

          flow-root — confirmed live as a real bug without it: this div
          has no border/padding of its own, and dialogRef's own
          mb-[space-lg] isn't contained by it as a result — an unbroken
          parent/child edge lets a margin collapse straight through,
          meaning it takes up real vertical space in the page but isn't
          reflected in THIS element's own getBoundingClientRect().height,
          which is exactly what feeds growableFixedOverheadPx (and, added
          to effectiveHeightPx, cardRef's own negative marginTop).
          Under-measuring by that collapsed amount meant the margin never
          fully canceled this box's own contribution — slots/controls
          visibly shifted position by tens of px when opening edit mode,
          the exact regression this whole mechanism exists to prevent.
          flow-root establishes a new block formatting context, the same
          fix RecommendationsBody.tsx already uses for an identical
          collapse-through-the-parent case — margins stop escaping this
          box's own boundary, so its measured height always matches its
          true footprint.

          No layout/motion for the open/close/snap case — carried `layout`
          itself in this migration's previous two rounds (first alone, then
          alongside dialogRef), but not anymore: cardRef (above, this
          box's own direct parent) now carries `layout="position"` instead,
          animating the whole card's position as one rigid unit rather than
          faking a size change here. See cardRef's own comment for the full
          round-by-round history of why. This div still exists purely for
          measurement (growableFixedOverheadPx, above) — flow-root (below)
          is still load-bearing for that even with no animation of its own.

          Plain div again (was briefly a motion.div carrying a pinned
          height + clip-path for the live-drag case — see dialogRef's own
          comment, below, and DESIGN_SYSTEM.md's "Round 5" entry for why
          that approach was reverted: it made cardRef's own border pin to
          its full maximum extent from the first frame of every drag,
          completely independent of where the clip boundary actually was,
          reported live as "the panel fully expands on click, then reverts
          on release" — a resize handle that doesn't visibly resize while
          being dragged). This element carries no drag-specific style of
          any kind now; dialogRef (below) is the one element whose real
          height actually changes, and growableRef's own height, exactly as
          in the pre-drag-optimization shape, is simply whatever flow-root
          measures that content to be. */}
      <div ref={growableRef} className="flow-root">

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
          ~effectiveHeightPx by construction.

          An EARLIER attempt at a *fixed, static* explicit height here
          (unrelated to the animation below, from before this file settled
          on max-h-0/unconstrained as the open/closed toggle) was tried and
          reverted: a flex-col container whose explicit height was smaller
          than its natural content height clipped from the START (top)
          under overflow:hidden, not the end — confirmed live via
          getBoundingClientRect (the tab strip measured *above* its own
          parent's top edge once clipped). That was a plain miscalculated
          height value, not a general "flex-col + overflow-hidden always
          clips the wrong edge" rule — this element's own children stack
          top-down with default (flex-start) alignment, so overflow:hidden
          ordinarily clips whatever doesn't fit at the *bottom*, matching
          what's wanted (tabs stay visible, chips are what scrolls/clips).
          The animated height below reuses this same reasoning, now
          transitioning toward effectiveHeightPx (the one number this file
          already trusts as the pool panel's own exact target height, not
          a fresh guess) rather than being statically wrong — live-verified
          on open that the tab row stays visible throughout the reveal, not
          clipped away until the end. */}
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Edit tags"
        tabIndex={-1}
        // motion.div now (was a plain div), but deliberately still no
        // `layout` prop — a first version gave this element `layout` too (Motion's documented fix for
        // child-distortion under a scaling parent: "children require their
        // own layout prop... Motion will calculate counter-scales them so
        // they appear undistorted"). Reverted: this element's own topology
        // doesn't match the case that guidance is written for (a child
        // whose OWN intrinsic size stays constant, only visually distorted
        // by an ancestor's scale — Motion's own docs example is an <img>
        // inside a resizing <section>). Here, growableRef (this element's
        // direct, zero-padding parent — see that ref's own comment: its
        // rect IS this element's rect) wraps THIS element alone, and this
        // element's own `height` is the actual property changing — giving
        // this element `layout` too meant it was independently re-detecting
        // and re-FLIP-animating the exact same size delta growableRef was
        // already animating, rather than cleanly counter-scaling it.
        // Confirmed live via a getBoundingClientRect() frame sampler: with
        // `layout` on both, this element's own measured height crept up
        // gradually frame-by-frame (16px, 21px, 26px...) instead of
        // reading its real, already-final value immediately — and,
        // reported directly, the visible result was the panel's own outer
        // frame snapping into place while the inner content visibly
        // lagged/caught up afterward, not one coherent motion.
        //
        // growableRef itself has since also lost its own `layout` (see
        // that ref's own comment) — this element's real height was always
        // the thing actually changing. Nothing anywhere in this tree
        // carries Motion's `layout` prop anymore at all, as of the
        // open/close/snap fix (DESIGN_SYSTEM.md's "Round 4" entry): real
        // geometry (this element's own height/marginBottom, the outer
        // wrapper's marginTop) now animates via a genuine CSS transition
        // instead, so there's no scale anywhere in this subtree to cause
        // distortion in the first place. See DESIGN_SYSTEM.md for the full
        // writeup, including the live-drag case (Round 5), which now also
        // animates this same real height/marginTop pair directly, just via
        // Motion values instead of a CSS transition (a live drag needs to
        // track the pointer exactly, not ease toward a fixed target).
        //
        // height, not max-height — a real, confirmed-live bug with
        // max-height specifically for *shrinking* (the 100%→default down
        // arrow, or any decreasing resize snap): TagPoolBody receives
        // effectiveHeightPx directly as its own poolPanelHeightPx prop,
        // always the live, already-final value, with nothing of its own to
        // stage or delay — so its internal chip-area height is always
        // already at the new, smaller target. max-height's own "collapse to
        // content the moment content is smaller" escape hatch would make
        // dialogRef's own box immediately match that already-shrunk content
        // regardless of what height value this style declares, defeating
        // the point of a stable, authoritative height for the CSS
        // transition (open/close/snap) or dragLiveHeight (live drag) to
        // actually animate. A hard `height`, always exactly `targetHeight`
        // or the live drag target, is what keeps this element's own real
        // size honest and predictable in every direction, not just growing
        // ones.
        //
        // overflow-hidden is permanent (open and closed alike) — nothing
        // inside TagPoolBody currently needs to bleed outside this box once
        // fully open (its own ScrollFadeArea instances are already self-
        // contained), and it keeps this box visually clean through every
        // transition (open/close/snap or live drag) too.
        //
        // mb-xl (16px), not mb-lg (12px) like this row's other internal
        // gaps: this is specifically the gap the chip area's down arrow
        // sits flush against (bottom:0, no inset of its own — see
        // ScrollFadeArea). Widening the actual edge here, rather than
        // offsetting the arrow away from it, keeps the arrow visually flush
        // with its own boundary while still giving it more breathing room
        // before the slots below — confirmed live that nudging the arrow's
        // own inset instead left it floating oddly off the edge it's meant
        // to sit against.
        //
        // marginBottom stays in the inline style (editMode-conditional, not
        // baked into the className unconditionally) — kept from leaking
        // into browse mode: growableRef's own flow-root (see that ref's
        // comment) means dialogRef's bottom margin counts toward
        // growableRef's own measured height whenever it's present, so an
        // unconditional margin here would add 16px of unwanted dead space
        // below the (fully collapsed, height:0) bar in browse mode, where
        // marginTop is unconditionally 0 and can't compensate for it.
        // Height and marginBottom changing together, in the same commit,
        // is also exactly what keeps growableRef's own measured rect (it's
        // flow-root-wrapping dialogRef alone, see that ref's own comment)
        // internally coherent, with nothing for this file to keep in sync
        // by hand.
        //
        // dragLiveHeight (a Motion value, `.set()` every tick — see its own
        // declaration near dragHeightPx for the full Round 5 history)
        // during a live drag, targetHeight otherwise — same key, switching
        // which kind of value it holds, same pattern the outer wrapper's
        // own marginTop uses (see that element's own comment for why this
        // shape, rather than a conditionally-present key, matters).
        style={{
          height: dragHeightPx !== null ? dragLiveHeight : targetHeight,
          marginBottom: targetMarginBottomPx,
          transition: `height ${geometryTransitionTiming}, margin-bottom ${geometryTransitionTiming}`,
        }}
        className="flex flex-col outline-none overflow-hidden [contain:layout]"
      >
        <TagPoolBody
          allTags={allTags}
          selectedTags={selectedTags}
          totalSeriesCount={totalSeriesCount}
          onChipToggle={onChipToggle}
          poolPanelHeightPx={effectiveHeightPx}
          editMode={editMode}
          trailingControls={trailingControls}
          isPoolPanelResizing={dragHeightPx !== null}
        />
      </motion.div>
      </div>

        {/* Row 2 (combined): the 3 tag slots and every control that used to
            be Row 3 now share ONE row, requested directly, not a bug fix.
            TagSlot itself dropped to a single, fixed height (44.5px,
            matching IconButton/ActionButton's own shared md height, see
            TagSlot.tsx's own comment) specifically so it could sit in the
            same line as these buttons at all, not just visually near them.

            LEFT group: 2 sub-groupings (3 slots, then Tag Pool/Clear).
            RIGHT group: 1 group (Min Match, Random, divider, Recommend).
            Both groups share this row's own gap-lg for every internal
            gap, including the divider's own (plus a small measured
            correction, see the divider's own comment below), not a
            special wider margin around it the way the old separate Row 3
            gave it, so removing the divider leaves the same spacing
            behind rather than a gap that visibly changes shape once it's
            gone.

            The outer row is flex-nowrap — it never wraps at all, at any
            width. An earlier version wrapped to a LEFT-alone/RIGHT-below
            2-line fallback once every rung below had already given up
            everything it could; that's gone now, replaced by letting the
            3 tag slots (the LAST, most expensive rung — see below) scroll
            horizontally instead, the same `ScrollFadeArea` treatment the
            section tab strip elsewhere in this bar already uses. Requested
            directly: the row stays a single line continuously, all the
            way down, rather than degrading to two lines at its narrowest.

            This row's entire responsive ladder is ONE priority-hide chain
            now, requested directly and rebuilt from scratch this round:
            starting from the widest point anything needs to change at
            all, each rung gives up a little more, in a fixed order, and
            each rung's own breakpoint was live-bisected to sit exactly
            where the PREVIOUS rung's own fit stops holding. This is what
            keeps the row single-line continuously across the WHOLE span
            from min-[511px] up through min-[1071px] and beyond, rather
            than the disconnected patchwork of independently-picked
            breakpoints this row used to have (a real, measured dead zone
            between two of this round's own first-draft numbers is what
            proved chaining, not spacing rungs out by feel, is required;
            see each rung's own comment below for where a dead zone was
            actually found and closed):

              - min-[1071px]  Full form: every control shows its own text
                                label, and the Random/Recommend divider is
                                visible. This is this row's own pre-existing
                                ceiling (unchanged), the widest point
                                anything here needs to change.
              - max-[1070px]  RUNG 1: the divider disappears. First
                                casualty, before any other control changes
                                at all, per explicit priority order. Tied
                                directly to the 1071px ceiling above, not an
                                arbitrary wide value: on its own this rung
                                never actually achieves single-line fit
                                anywhere (confirmed live), so there's no
                                reason for it to start any wider than the
                                one point where the full form itself stops
                                fitting.
              - (same 1071px) RUNG 2: Tag Pool, Clear, Random, and
                                Recommend all drop their text labels down to
                                icon-only, together, at the SAME threshold
                                the divider disappears at, not a separately
                                bisected one: on this round's first attempt,
                                these were left at their own old, narrower
                                793px/640px thresholds, which left the whole
                                793-1070px range wrapped into 2 lines with
                                only the divider gone, a real, confirmed
                                dead zone, since divider-alone never closes
                                the gap by itself. Min Match loses only its
                                own "MIN MATCH" text label here, keeping
                                both icons and its full 3-segment control.
              - max-[750px]   RUNG 3: Min Match itself changes, not just
                                its label: loses the Tag icon (GreaterEqual
                                alone still reads as "match count" beside
                                the value next to it) AND switches from the
                                3-segment control to the single-tap-cycle
                                one, together, as one combined step,
                                requested as a single rung rather than the
                                two separately-timed steps an earlier draft
                                of this row used. Placed here specifically
                                because it must land BEFORE Tag Pool starts
                                disappearing (rung 4) per the requested
                                order; anywhere in the (roughly 657-1070px)
                                range where rung 2's own fit already holds
                                comfortably works equally well for that
                                ordering, this is just a clean value inside
                                it.
              - max-[657px]   RUNG 4: Tag Pool hidden entirely, the FIRST
                                of the three buttons (Tag Pool, then Clear,
                                then Random) to go. 657px specifically:
                                confirmed live as exactly where rung 3's own
                                fit (Min Match already collapsed, Tag Pool/
                                Clear/Random all still visible) stops
                                holding. This round's first attempt had this
                                at 640px (copied from an unrelated, older
                                number) instead of re-bisecting against this
                                exact chain, which left a real, confirmed
                                dead zone from 640-656px, closed by moving
                                this rung up to 657px.
              - max-[621px]   RUNG 5: Clear hidden entirely. The width
                                where Tag-Pool-hidden-alone's own fit stops
                                holding.
              - max-[577px]   RUNG 6: Random hidden entirely. The width
                                where Tag-Pool-and-Clear-hidden's own fit
                                stops holding. Final composition below this
                                point: 3 slots, Min Match (1 icon, collapsed
                                control), Recommend (icon only), nothing
                                left in this chain to hide.
            Below 511px even that final composition no longer fits on one
            line — this is where the 3 slots' own sub-group (below) takes
            over the squeeze instead of the row wrapping: this is the LAST
            rung in the chain, only reachable once every other rung above
            has already given up everything it can (Tag Pool/Clear/Random
            all hidden, divider gone, Min Match down to one icon + its
            collapsed control, Recommend icon-only) — the slots are the
            final, most expensive thing to give up, so they're the last to
            change, not the first.

            Adding a new rung: give it its own breakpoint, and re-bisect
            the WHOLE chain from that point down (not just the one new
            number): every threshold above is only correct in reference
            to which others are already hidden or changed at that width,
            not a value that stands alone.

            No `layout` prop anymore (Round 4 — see cardRef's own comment,
            above, for the full writeup of what changed and why). Earlier
            rounds needed this row to carry its own `layout="position"`
            specifically to counter-track cardRef's ambient transform,
            which changed the story twice: a full, scale-capable `layout`
            here (countering cardRef's then-also-full `layout`) caused
            visible vibration, since two separately-computed Motion SCALE
            animations were trying to cancel out exactly, every frame;
            switching cardRef to position-only `layout="position"` fixed
            that (no scale, nothing to vibrate), and this row's own
            `layout="position"` kept measuring its own real rect and
            correctly, automatically counter-tracking cardRef's ambient
            translate — confirmed directly, sampling both elements'
            computed transforms in lockstep through an open transition
            (e.g. cardRef +25.45 / this row -25.45 at the same instant,
            every instant, canceling to zero). That worked. But cardRef's
            OWN box still visibly swung, because nothing was correcting
            IT — only its content stayed put. Round 4 fixes cardRef
            directly (real geometry now animates smoothly, no faked
            transform at all — see its own comment), which means this row
            has no ambient transform left to counter in the first place:
            it just sits at its own always-correct real position, the
            same way it would if cardRef had never carried any transform
            at all.

            No style.y of its own either, for the live-drag case — this row
            went through two of its own dedicated compensators, at
            different points, for exactly that case, both since removed
            entirely. cardRef's own comment (near targetMarginTop, above)
            has the full history: a per-tick motion value on cardRef, then
            a per-drag-constant one, both eventually replaced by making
            targetMarginTop itself correct in the same commit
            growableRef's real height pins to its ceiling. cardRef now
            carries no transform of any kind for the live-drag case
            either, so this row (a plain descendant with nothing of its
            own) simply sits at its own always-correct real position for
            the whole gesture — the same reason it needs nothing of its
            own for the open/close/snap case. See DESIGN_SYSTEM.md for the
            full writeup. */}
        <motion.div className="flex flex-nowrap items-center gap-x-[var(--space-lg)]">
          {/* LEFT group. min-w-0: lets this flex item (and, more directly,
              its own min-w-0 slots sub-group below) actually shrink below
              its natural content width once the row runs out of room —
              same reasoning as every other instance of this pattern in
              this file (the old filters row, TagPoolBody's tab row). */}
          <div className="flex items-center gap-[var(--space-lg)] min-w-0">
            {/* Sub-group A: the 3 tag slots. min-w-0 on this wrapper (not
                the ScrollFadeArea instance itself, which fitContent
                already sizes to its own intrinsic content) is what lets
                it shrink below 3-slots-wide once Sub-group B and RIGHT
                have already claimed what they need — the same "min-w-0
                lets this specific child give way first" role the old
                filters row's own wrapper played opposite MixerBar's
                former resize cluster. Requested directly: once every
                other rung in this row's own priority-hide chain has
                already fired (Tag Pool/Clear/Random/divider all gone, Min
                Match and Recommend both down to their narrowest forms),
                the 3 slots are the last thing left that could force this
                row to wrap — scrolling them internally instead is what
                keeps this row a single line all the way down, rather than
                wrapping to the LEFT/RIGHT 2-line fallback an earlier
                version of this comment flagged as a known limit to
                revisit. scrollStep={90}: one slot's own width (78px) plus
                this row's shared gap-lg (12px), so a click/arrow-tap
                scrolls almost exactly one slot at a time, the same
                "one meaningful unit per step" reasoning SectionTabStrip's
                own SCROLL_STEP already uses for its tabs. */}
            {/* -mb-[4px]/-mr-[4px] cancel the pb-[4px]/pr-[4px] on the
                scrollable content below — the same pad-then-cancel shadow-
                clipping fix already established for the results carousel
                and ResultCard (see DESIGN_SYSTEM.md), applied here for the
                identical reason: ScrollFadeArea's own horizontal viewport
                is unconditionally overflow-x-auto/overflow-y-hidden, which
                clips a filled TagSlot's own shadow-[var(--elev-3-accent)]
                (a flat 4px/4px bottom-right offset, no blur) at the
                viewport's bottom edge for every slot, and additionally at
                the right edge for whichever slot is currently last/
                right-most in the scrollable content — confirmed live as
                exactly the reported bug (filled slots missing their own
                bottom shadow, the last slot missing its right shadow too).
                4px matches --elev-3-accent's own offset exactly, not a
                guess. */}
            <div className="min-w-0 -mb-[4px] -mr-[4px]">
              <ScrollFadeArea orientation="horizontal" scrollStep={90} fadeSize={12} fitContent restrictTouchAction>
                <div className="flex gap-[var(--space-lg)] pb-[4px] pr-[4px]">
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
              </ScrollFadeArea>
            </div>
            {/* Sub-group B: Tag Pool + Clear. Tag Pool first, not Clear,
                matching this pair's own left-to-right reading order
                against the slots immediately to its left (open the pool
                to fill slots, or clear them). shrink-0: this sub-group
                never shrinks/scrolls, only the slots do — by the width
                where the slots' own scroll actually engages, Tag Pool and
                Clear are already both hidden anyway (rungs 4/5 above), but
                shrink-0 keeps that guarantee explicit rather than
                incidental. */}
            <div className="flex items-center gap-[var(--space-lg)] shrink-0">
              <div className="min-[1071px]:hidden flex items-center gap-[var(--space-lg)]">
                {/* max-[657px]:hidden, live-bisected: Tag Pool is the FIRST
                    of the three (Tag Pool, then Clear, then Random) to give
                    up its own space as this row runs out of room, per
                    explicit priority order, and the first rung after Min
                    Match's own collapse above. 657px is exactly where the
                    prior tier's own fit (icon-only, Min Match already
                    collapsed, all three of Tag Pool/Clear/Random still
                    visible) stops holding, confirmed live: a real dead zone
                    opened up here on this round's own first attempt, which
                    had this at 640px by analogy with an earlier draft's
                    numbers rather than re-bisecting against this exact
                    chain. Still reachable by tapping an empty slot directly
                    (handleSlotClick above) whenever one exists, though not
                    once all 3 slots are filled and Clear has also gone
                    below its own, narrower threshold, an accepted gap at
                    this row's tightest widths, requested as the priority
                    order regardless. */}
                <div className="max-[657px]:hidden">
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
                {/* max-[621px]:hidden, live-bisected: Clear is the SECOND
                    of the three to go, once Tag Pool alone (already hidden
                    above this width) no longer buys back enough room on its
                    own. Below this point a tag can still be removed from
                    its own slot directly (drag it back out to the pool, or
                    open edit mode via an empty slot and use its per-chip
                    toggle) even without this button. */}
                <div className="max-[621px]:hidden">
                  <IconButton size="md" border="base" shadow="elev-2" backgroundColor="transparent" title="Clear" aria-label="Clear" onClick={onClearSlots}>
                    <EraserIcon className="text-[var(--ink)]" />
                  </IconButton>
                </div>
              </div>
              <div className="hidden min-[1071px]:flex items-center gap-[var(--space-lg)]">
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
                <ActionButton variant="outline" onClick={onClearSlots}>
                  <span className="inline-flex items-center gap-[var(--space-sm)]">
                    Clear
                    <EraserIcon className="text-[var(--ink)]" />
                  </span>
                </ActionButton>
              </div>
            </div>
          </div>
          {/* RIGHT group. shrink-0: never shrinks either, same reasoning as
              Sub-group B above — only the slots' own ScrollFadeArea
              absorbs the squeeze, so this group's own icons/controls
              never get compressed or clipped, just individually hidden by
              their own breakpoints as already documented above. */}
          <div className="ml-auto flex items-center gap-[var(--space-lg)] shrink-0">
            <div className="max-[750px]:hidden flex items-center gap-[var(--space-sm)]">
              {/* max-[1071px]:hidden: the "Min Match" label is the Min
                  Match side of RUNG 2, the same shared icon-only switch
                  Tag Pool/Clear/Random/Recommend all drop their own labels
                  on, at the same 1071px threshold (see this row's own top
                  comment for the full ladder). This control doesn't lose
                  its whole self there the way those do, just this one
                  label, keeping its 2 icons and 3-segment control intact
                  through that rung. Replaces the old @min-[480px]
                  container-query toggle (borrowed from an unrelated row's
                  own breakpoint) with this row's real, live-bisected
                  one. */}
              <span className="max-[1071px]:hidden font-mono font-bold text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] uppercase whitespace-nowrap">
                Min Match
              </span>
              <TagIcon className="text-[var(--ink)]" />
              <GreaterEqualIcon className="text-[var(--ink)]" />
              <MatchSelector value={minMatch} onChange={onSetMatch} />
            </div>
            <div className="hidden max-[750px]:flex items-center gap-[var(--space-sm)]">
              {/* max-[750px], live-bisected: RUNG 3 of this row's whole
                  ladder (after the divider, then the shared icon-only
                  switch), and the only rung that changes a control itself
                  instead of just losing a label: losing the Tag icon
                  (GreaterEqual alone still reads as "match count" paired
                  with the value beside it) AND switching from the
                  3-segment control to the single-tap-cycle collapsed one
                  happen together, here, requested as one combined step,
                  not the two separately-timed steps an earlier draft of
                  this row used. This happens BEFORE Tag Pool/Clear/Random
                  start disappearing below (rungs 4-6), not after, per the
                  requested priority order. */}
              <GreaterEqualIcon className="text-[var(--ink)]" />
              <MatchSelector value={minMatch} onChange={onSetMatch} collapsed />
            </div>
            {/* max-[577px]:hidden, live-bisected: RUNG 6, Random is the
                last of the three (Tag Pool, Clear, Random) to go, once
                Tag Pool and Clear (both already hidden above this width)
                still haven't bought back enough room on their own. Below
                this point the final composition is just the 3 slots,
                Min Match, and Recommend. Random has no standing alternate
                entry point, an accepted tradeoff of the requested
                priority order.

                Both conditions (min-[1071px]:hidden for the icon/text
                swap, max-[577px]:hidden for hiding entirely) live on this
                SAME div now, not nested one inside the other the way an
                earlier version had it. Confirmed live as a real bug:
                nesting left the OUTER div still "block" (only its own
                min-1071 condition controls it) once the INNER div hid
                below 577px, so an empty-but-not-display:none box sat
                between Min Match and Recommend, still collecting its own
                gap-lg on both sides, a real, doubled gap, reported live
                as "too much padding" once Min Match collapsed. Tag Pool/
                Clear never had this problem: both of their own
                hide-entirely conditions already live on a single div each,
                nested only inside ONE shared icon-tier wrapper they both
                sit in together, not two levels of nested divs the way
                this one used to be. */}
            <div className="min-[1071px]:hidden max-[577px]:hidden">
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
            <div className="hidden min-[1071px]:block">
              <ActionButton variant="filled" onClick={onRandomTags}>
                <span className="inline-flex items-center gap-[var(--space-sm)]">
                  Random
                  <DiceIcon className="text-[var(--ink)]" />
                </span>
              </ActionButton>
            </div>
            {/* ml-[3px], not a plain gap-lg on both sides: RANDOM's own
                shadow (shadow="elev-2"/shadow-[var(--elev-2)], a flat,
                blur-free 3px-right/3px-down offset copy, both the icon and
                labeled forms) bleeds 3px into the raw gap on ITS side of
                the divider, visually eating into it, while RECOMMEND's own
                shadow bleeds the other way (down-right, away from this
                gap) and doesn't touch its own side at all. Confirmed live
                via getBoundingClientRect: the layout gap on both sides was
                already mathematically identical (12px, this row's shared
                gap-lg), but the *visual* gap read smaller on RANDOM's side
                specifically because of that 3px of shadow sitting inside
                it, the same "match the rendered distance, not just the
                token" principle DESIGN_SYSTEM.md's own "A visual gap has
                to match the other gap's rendered distance" section already
                documents for two earlier, differently-shaped instances of
                this. The extra 3px here gives the shadow exactly the room
                it bleeds into without eating into the clean 12px, so both
                sides read as the same gap instead of just measuring the
                same. */}
            {/* min-[1071px]:block, live-bisected: the divider is the FIRST
                casualty of this row's whole priority ladder, the widest
                rung, disappearing before any of the icon-only/collapse/
                hide-entirely rungs below it even start. Requested directly
                as its own, separate breakpoint, not tied to the shared
                793px icon-only threshold the way it used to be. 1071px
                specifically (not an arbitrary wide value): that's this
                row's own pre-existing full-label single-line ceiling (see
                the min-[1071px] rung in this comment's own top section),
                the widest point ANYTHING here needs to change at all,
                hiding the divider any earlier would have nothing to buy,
                since the row already fits with it present above that
                point. */}
            <div className="hidden min-[1071px]:block ml-[3px] w-[length:var(--border-thin)] h-[32px] bg-[var(--ink)]" />
            <RecommendButton filledCount={filledCount} onRecommend={onRecommend} error={error} />
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

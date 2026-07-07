"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { IconButton, type RevealGroup } from "./IconButton";

type Orientation = "vertical" | "horizontal";
// This instance's own root wrapper carries one of these two group classes
// (matching whichever RevealGroup its arrow buttons use for revealOnHover
// below) — see RevealGroup's own comment in IconButton.tsx for why two
// variants exist and why the class has to be a complete literal string.
const GROUP_CLASSES: Record<RevealGroup, string> = {
  reveal: "group/reveal relative",
  "reveal-nested": "group/reveal-nested relative",
};

interface ScrollFadeAreaProps {
  // Which hover-reveal group this instance's own root belongs to, and
  // which one its arrow buttons listen for — see RevealGroup above.
  // Default matches every non-nested caller (the results carousel itself,
  // SectionTabStrip, TagPoolBody's chip area); only TagScrollArea (nested
  // inside the results carousel) needs "reveal-nested".
  groupName?: RevealGroup;
  // Vertical-only: the Tailwind height utility applied to the scroll
  // viewport — either a fixed "h-[Npx]" (TagScrollArea's per-card area,
  // which needs uniform height across a grid regardless of content) or a
  // capping "max-h-[Npx]" (hugs shorter content, only clamps + scrolls past
  // the cap). Ignored for orientation="horizontal", which always takes
  // "w-full" instead — every horizontal caller (the results carousel, the
  // Tag Pool's section tab strip) wants the full width available to it, so
  // a per-instance sizing prop would be unused generality.
  height?: string;
  // Vertical-only, overrides `height` with an inline *fixed* height in px
  // instead of a Tailwind class — for a height that's only known at
  // runtime (MixerBar's desktop drag-resize handle). Fixed, not a max:
  // MixerBar's pool panel must not hug/shrink to fit whatever the active
  // section's content happens to be — only the drag handle (or the
  // default on first open) may change this area's size, never which
  // section tab happens to be selected. A computed arbitrary-value class
  // string (e.g. `` `h-[${n}px]` ``) can't work here the same way `height`
  // does: Tailwind's scanner needs the full class as static source text to
  // generate CSS for it, so a runtime-built one is invisible to it and
  // silently produces no rule at all (the same failure mode TagPoolBody's
  // CHIP_AREA_HEIGHT comment documents for the same reason). An inline
  // style has no such constraint.
  heightPx?: number;
  orientation?: Orientation;
  // The amount a single (non-held) arrow click moves, in px. Most callers
  // pass a fixed number; getScrollStep (below) exists for the one caller
  // whose "one unit" isn't a constant.
  scrollStep?: number;
  // Overrides `scrollStep` for a plain click, when the amount to scroll
  // can't be a fixed number — the results carousel's card width steps
  // through 4 responsive tiers, so "one card over" has to be measured off
  // the actual rendered DOM on each click rather than hardcoded.
  getScrollStep?: () => number;
  // Adds scroll-snap on the main axis (snap-y for vertical, snap-x for
  // horizontal). Opt-in: this only makes sense where children register real
  // snap points (TagScrollArea's chip rows via [&_button]:snap-start; the
  // results carousel via each ResultCard's own snap-start) — deliberately
  // not baked in here, since ScrollFadeArea shouldn't need to know what its
  // children are.
  snap?: boolean;
  // Peek reservation on the main axis's start edge — same idea both
  // orientations: a snap-start child settles this far in from the true
  // edge instead of flush against it, leaving exactly that much of the
  // previous item visible. Accepts a plain px number (TagScrollArea) or a
  // CSS length string like "6%" (the results carousel, which wants a
  // peek proportional to the row's own width, not a fixed px amount).
  scrollPaddingStart?: number | string;
  // Whenever this value changes (by reference/value inequality, checked via
  // a useEffect dependency), the viewport scrolls back to its start edge —
  // instantly, not smoothed. Generalizes the results carousel's own
  // "recommendGen bumped, scroll back to card 0" behavior into a prop
  // instead of a caller-owned ref + effect.
  scrollResetKey?: unknown;
  // What the fade gradients fade *from* — i.e. "the color of whatever's
  // actually behind this component," not a fixed choice. Defaults to
  // --surface, correct for any caller sitting on a flat --surface card.
  surfaceColor?: string;
  // The hover arrows' own backgroundColor — separate from surfaceColor
  // (which used to double as both) because the two can legitimately need
  // to differ: ResultCard's tag area passes a *translucent* surfaceColor
  // (a veil color meant to blend into a blurred cover reflection behind
  // it — see that file's own comment) so the fade gradient reads as part
  // of that backdrop rather than a mismatched opaque rectangle, but an
  // arrow button rendered at that same translucent value became nearly
  // invisible against the image behind it — confirmed live as a real
  // regression, not a hypothetical. Defaults to surfaceColor, unchanged
  // for every other caller (a flat, opaque surfaceColor works fine as
  // both).
  arrowBackgroundColor?: string;
  // Height (vertical) or width (horizontal) of the fade gradients, in px.
  // 0 renders no gradient at all (the results carousel: its peek is
  // already the "there's more" signal, and a gradient on top of arbitrary
  // cover art read wrong — see RecommendationsBody).
  fadeSize?: number;
  // Per-frame px rate for continuous (held) scrolling. A prop, not a shared
  // constant: the same rate reads differently depending on how big the
  // scrollable area is relative to it (confirmed live across TagScrollArea
  // vs. the Tag Pool, which needed different values).
  continuousScrollSpeed?: number;
  // Arrow button geometry/treatment — every existing caller keeps
  // ScrollFadeArea's own small (18×16), flat (no shadow), flush (0 inset)
  // defaults; the results carousel is the one caller that needs bigger,
  // shadowed, edge-inset arrows (they sit over arbitrary cover art rather
  // than a flat surface color, and needed room to clear the cards' own
  // margin) — see arrowWidth/arrowHeight/arrowShadow/arrowInset below.
  arrowWidth?: number;
  arrowHeight?: number;
  arrowShadow?: boolean;
  // Offset from the edge each arrow sits at (top/bottom for vertical,
  // left/right for horizontal) — a plain px number or a CSS length string
  // (e.g. "var(--space-md)", which the results carousel uses to stay
  // token-linked rather than hardcoding the current --space-md value).
  arrowInset?: number | string;
  // Opt-in only: sets pointer-events-none on every structural wrapper div
  // this component owns (its own root, the scroll viewport, and the
  // content wrapper around `children`) — none of which have any visible
  // content of their own, they just size themselves to fit whatever's
  // inside. That "fit the content" sizing is exactly the problem this
  // exists for: a caller whose children carry real-but-invisible padding
  // (RecommendationsBody's flip-bulge pt/pb-[40px], canceled back to zero
  // *visually* via a negative margin on an ancestor, but still real,
  // hit-testable layout space on every wrapper in between) makes those
  // wrappers geometrically overlap whatever sits next to this component on
  // the page — confirmed live as a real bug: RecommendationsBody's own
  // padding made this component's contentRef div silently swallow clicks
  // meant for ResultsHeader's Clear ✕ button sitting just above it, even
  // though nothing was visibly covering it. pointer-events-none on these
  // wrappers makes them transparent to clicks, falling through to whatever
  // page content is actually there; every piece of *real* interactive
  // content inside must then explicitly set its own pointer-events-auto to
  // opt back in (ResultCard.tsx does; IconButton.tsx now always does,
  // unconditionally, so this component's own arrow buttons — direct
  // children of the root this flips to none — don't need special-casing
  // here). Defaults to false/unset: every other ScrollFadeArea consumer
  // (the chip area, section tabs, per-card tag rows) has no equivalent
  // padding trick and no reason to pay this cost.
  disableWrapperPointerEvents?: boolean;
  // Horizontal-only. Makes the content wrapper's own width track its
  // child's true intrinsic (max-content) width instead of the default —
  // filling the viewport's own width regardless of what the child needs —
  // needed for hasOverflow to correctly reflect a *naturally-sized*
  // flex-nowrap child (SectionTabStrip's tablist, MixerBar's filters row)
  // whose own width should drive the measurement, so the hover arrows
  // recompute correctly when that child's content changes (e.g. a Level
  // switch changing which tabs render). Deliberately opt-in, not the
  // default for every horizontal caller: a
  // child that itself needs the *available* width to size against — the
  // results carousel's CSS grid (`grid-template-columns:
  // repeat(auto-fill, minmax(208px, 1fr))`, sizing its own `1fr` tracks
  // and auto-fill column count from whatever width it's given) — breaks
  // if its container's width becomes intrinsic/content-based instead:
  // confirmed live as a real regression, not a hypothetical — applying
  // this unconditionally to every horizontal instance collapsed the
  // carousel's grid toward its own minmax() floor, squishing cards into
  // vertical slivers, since auto-fill/1fr have no real "available space"
  // left to resolve against once the width computation runs in the other
  // direction (container sized from content, not content sized from
  // container). Only pass this where the child's own natural width is
  // exactly what should be measured, never where the child needs a real
  // available width to lay itself out against.
  fitContent?: boolean;
  // Opt-in, opacity-only edge fade on the scroll VIEWPORT itself (a
  // mask-image, not another gradient overlay div) — the content dissolves
  // to transparent over this many px at the start/end of the main axis,
  // always, regardless of scroll position or hasOverflow. Deliberately
  // separate from fadeSize/surfaceColor above: those render a colored
  // overlay meant to blend into whatever's behind this component, and
  // exist only where there's more content to reveal (gated on
  // hasOverflow/atStart/atEnd); this is a plain visual soft-edge on the
  // content itself, with no color of its own to pick or mismatch, and no
  // gating — it's a constant texture, not a scroll affordance (the
  // existing fade/arrows already cover that signal). Every caller besides
  // TagScrollArea leaves this unset (no mask-image at all, not even a
  // trivial no-op one, so there's zero behavior change for them).
  edgeMaskSize?: number;
  children: React.ReactNode;
}

const DEFAULT_SCROLL_STEP = 32;
const DEFAULT_FADE_SIZE = 18;
const DEFAULT_ARROW_WIDTH = 18;
const DEFAULT_ARROW_HEIGHT = 16;
// Below this holding time, a press is treated as a plain click (one
// scrollStep). At or beyond it, continuous scrolling takes over instead —
// for anyone without a trackpad/scroll wheel who'd otherwise need to click
// repeatedly to get through more than a couple of rows.
const LONG_PRESS_MS = 300;
// This default (6px/frame) is what the Tag Pool actually uses today, kept
// as the fallback so it didn't need its own explicit prop when
// continuousScrollSpeed became configurable — see that prop's own comment
// for why a single shared rate didn't work for both callers.
const DEFAULT_CONTINUOUS_SCROLL_SPEED = 6;

// Shared scroll/fade/hover-arrow mechanic. Vertical callers: TagScrollArea
// (per-card tags) and the Tag Pool's chip area. Horizontal callers: the
// results carousel (RecommendationsBody) and the Tag Pool's section tab
// strip (SectionTabStrip). Watches both the scroll viewport itself and an
// inner, intrinsically-sized content div via ResizeObserver, so it
// recomputes hasOverflow/atStart/atEnd whenever *either* side of the
// overflow comparison changes size — content growing/shrinking for reasons
// the viewport can't see itself (e.g. a level change hiding/showing tags),
// or the viewport itself resizing for reasons content can't see (MixerBar's
// pool panel chip area, whose height is a runtime heightPx the resize
// handle changes — most other callers' viewports are fixed/full-size boxes
// that never resize on their own, but that assumption doesn't hold here;
// watching only the content div left hasOverflow stuck stale after a
// resize until something unrelated remounted this component).
export function ScrollFadeArea({
  height,
  heightPx,
  groupName = "reveal",
  orientation = "vertical",
  scrollStep = DEFAULT_SCROLL_STEP,
  getScrollStep,
  snap = false,
  scrollPaddingStart,
  scrollResetKey,
  surfaceColor = "var(--surface)",
  arrowBackgroundColor = surfaceColor,
  fadeSize = DEFAULT_FADE_SIZE,
  continuousScrollSpeed = DEFAULT_CONTINUOUS_SCROLL_SPEED,
  arrowWidth = DEFAULT_ARROW_WIDTH,
  arrowHeight = DEFAULT_ARROW_HEIGHT,
  arrowShadow = false,
  arrowInset = 0,
  disableWrapperPointerEvents = false,
  fitContent = false,
  edgeMaskSize,
  children,
}: ScrollFadeAreaProps) {
  const horizontal = orientation === "horizontal";
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);
  // Tracks an in-progress press so a single mouseup/touchend/mouseleave
  // handler can tell "was this a quick click" from "was this a hold that's
  // already been continuously scrolling" — see handlePressEnd below.
  const longPressTimer = useRef<number | null>(null);
  const continuousScrollFrame = useRef<number | null>(null);
  // Carries the fractional remainder between frames. `scrollBy` rounds its
  // delta to a whole pixel per call — confirmed live: at continuousScrollSpeed
  // 0.25 (TagScrollArea's rate), every single sub-pixel scrollBy call was
  // silently rounding down to 0 and never moving the element at all, on its
  // own. Accumulating the sub-pixel remainder here and only calling
  // scrollBy once it reaches a whole pixel makes any rate < 1px/frame still
  // scroll at its correct average speed instead of not moving at all.
  const scrollRemainder = useRef(0);
  // Holds whichever function is currently registered as the window-level
  // release listener (see startContinuousScroll), so stopContinuousScroll
  // can remove exactly that listener via a ref read rather than by
  // referencing itself by name inside its own body — the latter works at
  // runtime (the binding exists by the time the callback actually runs) but
  // trips this project's stricter lint rule against self-referencing
  // callbacks, which can't statically prove that kind of safety.
  const globalReleaseListener = useRef<(() => void) | null>(null);

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (horizontal) {
      setHasOverflow(el.scrollWidth > el.clientWidth + 1);
      setAtStart(el.scrollLeft <= 0);
      setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
    } else {
      setHasOverflow(el.scrollHeight > el.clientHeight + 1);
      setAtStart(el.scrollTop <= 0);
      setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 1);
    }
  };

  // useLayoutEffect, not useEffect — hasOverflow now does more than drive
  // the fade/arrow decorations (see the overflow-y/x-auto class below,
  // gated on it): it decides whether this element is a scroll container at
  // all. useEffect runs after the browser's first paint, which would leave
  // a genuinely-overflowing area rendered as *not* a scroll container
  // (hasOverflow's useState(false) default) for one real frame before this
  // corrects it — harmless when hasOverflow only affected decorations, but
  // a real dropped-first-gesture risk now that it gates the scroll axis
  // itself. useLayoutEffect runs synchronously before paint, so the
  // conditional class is already correct on the very first frame.
  useLayoutEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const observer = new ResizeObserver(updateScrollState);
    // Observes both the content div (its usual job — content growing/
    // shrinking for reasons the viewport can't see itself, e.g. a level
    // change hiding/showing tags) AND the viewport (`el`) itself now too —
    // most callers' viewport is a fixed/full-size box that never resizes on
    // its own, but that assumption breaks for MixerBar's pool panel chip
    // area, whose viewport height is `heightPx`, changed at runtime by the
    // resize handle. Confirmed live as a real bug without this: dragging
    // the panel taller (enough that the chip area no longer overflows)
    // left `hasOverflow` stuck at its pre-resize `true` — nothing here fired
    // to recompute it, since the content itself hadn't changed size, only
    // the viewport had — so the hover fade/arrows kept showing over
    // content that no longer scrolled, until something unrelated (a
    // remount, e.g. switching tabs and back) forced a fresh
    // `updateScrollState()` call via this same effect's mount-time one.
    observer.observe(el);
    observer.observe(content);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizontal]);

  // Scrolls back to the start edge whenever the caller's reset key changes
  // (also fires harmlessly on mount, since scrollTop/scrollLeft is already
  // 0 then). behavior: "instant" explicit now (not just omitted), matching
  // the carousel's original recommendGen-triggered reset — an explicit
  // per-call behavior always overrides the container's own CSS
  // scroll-behavior, so this stays instant regardless of the snap-release
  // easing added below (scroll-smooth), which would otherwise animate this
  // reset too since scrollTo with no `behavior` option falls back to
  // whatever scroll-behavior the CSS says.
  useEffect(() => {
    scrollRef.current?.scrollTo(horizontal ? { left: 0, behavior: "instant" } : { top: 0, behavior: "instant" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollResetKey]);

  const scrollBy = (direction: 1 | -1) => {
    const step = getScrollStep ? getScrollStep() : scrollStep;
    const delta = direction * step;
    scrollRef.current?.scrollBy(horizontal ? { left: delta, behavior: "smooth" } : { top: delta, behavior: "smooth" });
  };

  // useCallback (not a plain function/arrow recreated every render): this
  // needs to be the *same* function reference every time so
  // window.removeEventListener below actually matches the addEventListener
  // call it's meant to undo — a new reference each render would silently
  // leak the listener instead of removing it.
  const stopContinuousScroll = useCallback(() => {
    if (continuousScrollFrame.current !== null) {
      cancelAnimationFrame(continuousScrollFrame.current);
      continuousScrollFrame.current = null;
    }
    if (globalReleaseListener.current) {
      window.removeEventListener("mouseup", globalReleaseListener.current);
      window.removeEventListener("touchend", globalReleaseListener.current);
      globalReleaseListener.current = null;
    }
    // Unconditional, not gated on the `snap` prop — restoring an inline
    // style that was never set is a harmless no-op, and this needs to run
    // on every stop path (including the unmount cleanup below) regardless
    // of whether this specific call started the override. Clearing the
    // inline value (not setting a specific value) lets the CSS classes
    // (snap-y/snap-x snap-mandatory, applied via the `snap` prop elsewhere
    // in this component) take back over, which is what makes the final
    // resting position correctly snap once scrolling actually stops.
    if (scrollRef.current) scrollRef.current.style.scrollSnapType = "";
  }, []);

  // Also clears any in-flight press state on unmount — a held button
  // shouldn't leave a runaway rAF loop behind if the section it's in
  // disappears mid-hold (e.g. a card getting swapped out).
  useEffect(() => stopContinuousScroll, [stopContinuousScroll]);

  const startContinuousScroll = (direction: 1 | -1) => {
    // Defensive: cancels any loop already running before starting a new
    // one. Without this, a specific real bug reproduced live: hold one
    // arrow until scrolling reaches that end — the *button itself*
    // unmounts the instant atStart/atEnd flips (see showStartGradient/
    // showEndGradient below), so its own onMouseUp can never fire to stop
    // the loop it started. Immediately holding the *opposite* arrow then
    // started a second loop without cancelling the first — both ran
    // simultaneously in opposite directions, visibly cancelling each other
    // out (reported as "the other arrow doesn't work").
    stopContinuousScroll();
    // Temporarily turns scroll-snap off for the duration of the hold, when
    // this instance uses it at all. Confirmed live as a real, separate bug
    // from the speed number itself: with snap-mandatory active, even a
    // sub-pixel scrollBy nudge is apparently enough for the browser to
    // treat it as a completed scroll gesture and immediately snap-correct
    // to the next full row — so *every single frame* of continuous
    // scrolling was triggering its own snap-jump. Restored in
    // stopContinuousScroll once the hold ends, so the final rest position
    // still snaps normally.
    if (snap && scrollRef.current) scrollRef.current.style.scrollSnapType = "none";
    scrollRemainder.current = 0;
    const axisKey = horizontal ? "left" : "top";
    const step = () => {
      // behavior: "instant", not "auto" — this already runs every frame on
      // its own, so it doesn't need the browser's own scroll animation
      // stacking on top; "smooth" here would compound into increasingly
      // laggy catch-up as frames pile up, which is also exactly why "auto"
      // alone isn't safe: "auto" means "defer to this element's own CSS
      // scroll-behavior," not "instant" — it only behaved like instant
      // before scroll-smooth (below) existed, because scroll-behavior was
      // unset (defaults to auto/instant) everywhere. Confirmed live as a
      // real regression the moment scroll-smooth was added for the
      // snap-release easing: every per-frame nudge started deferring to
      // that new smooth default, so each one kicked off its own animated
      // scroll that the next frame's call interrupted, netting almost no
      // movement at all. "instant" forces this one call to stay instant
      // regardless of whatever the container's CSS scroll-behavior says.
      scrollRemainder.current += direction * continuousScrollSpeed;
      const wholePixels = Math.trunc(scrollRemainder.current);
      if (wholePixels !== 0) {
        scrollRef.current?.scrollBy({ [axisKey]: wholePixels, behavior: "instant" });
        scrollRemainder.current -= wholePixels;
      }
      continuousScrollFrame.current = requestAnimationFrame(step);
    };
    continuousScrollFrame.current = requestAnimationFrame(step);
    // window-level, not just relying on this button's own onMouseUp/
    // onMouseLeave: those can't fire once the button itself has unmounted
    // (the exact scenario above), since there's no longer an element for
    // the browser to dispatch the release event to. A window listener
    // catches the release regardless of what's under the cursor, or
    // whether the original button still exists, by the time it happens.
    globalReleaseListener.current = stopContinuousScroll;
    window.addEventListener("mouseup", globalReleaseListener.current);
    window.addEventListener("touchend", globalReleaseListener.current);
  };

  // mousedown (not onClick) starts a timer; if the press is released
  // before LONG_PRESS_MS, handlePressEnd below treats it as a plain click
  // (one scrollStep). If the timer fires first, it promotes the same press
  // into continuous scrolling instead — so a quick tap and a hold both
  // start from the same gesture, they just diverge based on duration.
  const handlePressStart = (direction: 1 | -1) => {
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      startContinuousScroll(direction);
    }, LONG_PRESS_MS);
  };

  const handlePressEnd = (direction: 1 | -1) => {
    if (longPressTimer.current !== null) {
      // Released before the long-press threshold — a normal click.
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      scrollBy(direction);
    } else {
      // Was already continuously scrolling — just stop. scroll-snap (where
      // enabled) settles the final rest position on its own once movement
      // actually stops, same as it would after any other scroll gesture.
      stopContinuousScroll();
    }
  };

  const showStartGradient = hasOverflow && !atStart;
  const showEndGradient = hasOverflow && !atEnd;

  return (
    <div className={[GROUP_CLASSES[groupName], disableWrapperPointerEvents ? "pointer-events-none" : ""].join(" ")}>
      {/* No onWheel handler here, deliberately — an earlier horizontal-only
          version summed e.deltaX + e.deltaY into scrollLeft, specifically
          so a plain vertical mouse wheel (no native horizontal capability)
          could still drive this row. Reverted: that made a *genuine*
          vertical scroll gesture (wheel, trackpad, or a mobile scroll) get
          hijacked into horizontal row movement the instant the pointer
          happened to be over a horizontal row — interfering with scrolling
          the page itself, or with the tag area of a card sitting inside a
          horizontal results row. Native browser behavior already handles
          the case this was trying to help: a genuine horizontal trackpad/
          touch swipe (real deltaX) scrolls a horizontally-overflowing
          container on its own, no JS required — it's only cross-axis
          translation (turning deltaY into scrollLeft) that needed the
          custom handler, and that's exactly the part causing the
          interference. Plain-wheel-only input (no horizontal capability at
          all) now has to use the arrow buttons instead of the row silently
          reinterpreting vertical scroll as horizontal. */}
      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        style={{
          ...(scrollPaddingStart
            ? horizontal
              ? { scrollPaddingLeft: scrollPaddingStart }
              : { scrollPaddingTop: scrollPaddingStart }
            : undefined),
          ...(!horizontal && heightPx !== undefined ? { height: heightPx } : undefined),
          // edgeMaskSize: a plain opacity fade on this viewport's own
          // content, via mask-image, not another colored overlay — see
          // that prop's own comment for why it's kept separate from
          // fadeSize/surfaceColor above. Applied directly on the scroll
          // viewport (not the content div inside it) so it fades the
          // actual, currently-visible slice of content at this element's
          // own edges, the same box hasOverflow/scroll math already
          // operates on — not the content's own (often much taller/wider)
          // full extent.
          ...(edgeMaskSize
            ? {
                maskImage: horizontal
                  ? `linear-gradient(to right, transparent 0, black ${edgeMaskSize}px, black calc(100% - ${edgeMaskSize}px), transparent 100%)`
                  : `linear-gradient(to bottom, transparent 0, black ${edgeMaskSize}px, black calc(100% - ${edgeMaskSize}px), transparent 100%)`,
                WebkitMaskImage: horizontal
                  ? `linear-gradient(to right, transparent 0, black ${edgeMaskSize}px, black calc(100% - ${edgeMaskSize}px), transparent 100%)`
                  : `linear-gradient(to bottom, transparent 0, black ${edgeMaskSize}px, black calc(100% - ${edgeMaskSize}px), transparent 100%)`,
              }
            : undefined),
        }}
        className={[
          // The scroll axis's own overflow (x-auto/y-auto) is gated on
          // hasOverflow now, not unconditional — confirmed live as the
          // actual cause of a real mobile bug: overflow:auto marks an
          // element as a scroll-gesture *candidate* regardless of whether
          // it currently has anything to scroll, so an under-filled
          // TagScrollArea (few tags, no vertical overflow) was still
          // capturing a horizontal swipe and stranding it there instead of
          // letting the gesture fall through to the results carousel
          // underneath — native chaining only worked once the tag area
          // actually overflowed and became a real scroller. Falling back to
          // -hidden (not the default `visible`) when there's nothing to
          // scroll keeps this element out of scroll-gesture candidacy
          // (hidden is not user-scrollable, so browsers don't treat it as a
          // chaining boundary the way auto/scroll are) while still clipping
          // defensively, same as the cross-axis's own -hidden below. The
          // cross-axis (y-hidden/x-hidden) stays unconditional — it only
          // clips, never scrolls, so it was never a candidate for this bug.
          horizontal
            ? `w-full ${hasOverflow ? "overflow-x-auto" : "overflow-x-hidden"} overflow-y-hidden`
            : `${heightPx !== undefined ? "" : height} ${hasOverflow ? "overflow-y-auto" : "overflow-y-hidden"} overflow-x-hidden`,
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          snap ? (horizontal ? "snap-x snap-mandatory" : "snap-y snap-mandatory") : "",
          // scroll-smooth (scroll-behavior: smooth), snap-only: with no
          // explicit scroll-behavior at all, the browser's own re-snap
          // correction — fired the instant stopContinuousScroll clears the
          // inline scrollSnapType override and this element's snap-y/x
          // class takes back over — jumps to the nearest snap point
          // instantly, with no easing of its own. This is the one thing
          // that actually governs that correction's speed; there's no
          // separate "snap duration" CSS property to tune independently of
          // it. Every scrollBy/scrollTo call this component makes already
          // passes its own explicit `behavior` (see scrollBy and the
          // scrollResetKey effect above), which always overrides the
          // container's own CSS scroll-behavior — so this only affects the
          // one thing that wasn't already an explicit call: the browser's
          // own automatic snap correction.
          snap ? "scroll-smooth" : "",
          // overscroll-y/x-contain (axis-scoped, not the unsuffixed
          // overscroll-contain that used to sit here): once this viewport
          // hits its own scroll bounds on its OWN axis (e.g. MixerBar's
          // pool panel chip area scrolled all the way down), continuing
          // the same gesture must not chain into scrolling whatever's
          // behind/beneath this component on that SAME axis — the page
          // itself for the pool panel, since MixerBar is a fixed overlay
          // that visually reads as its own surface, not a transparent
          // window onto the page scrolling underneath it. Native browser
          // behavior (default overscroll-behavior: auto) chains to the
          // next scrollable ancestor once a nested scroll container
          // bottoms out — this opts every ScrollFadeArea instance out of
          // that on its own axis, not just the pool panel, since a
          // contained scroll area silently leaking scroll to whatever's
          // behind it is never actually wanted here.
          //
          // Axis-scoped, not the unsuffixed overscroll-contain (which sets
          // -x AND -y to contain) — confirmed live as a real bug on mobile:
          // TagScrollArea (vertical-only, no horizontal range of its own at
          // all) sat inside the horizontal results carousel, and the
          // unsuffixed class also set its overscroll-behavior-**x** to
          // contain even though this element can never scroll on X. Per
          // spec, overscroll-behavior-x: contain blocks a horizontal
          // gesture from *chaining* to any ancestor once this element
          // can't move further on that axis — since it can never move on X
          // at all, every horizontal swipe that started over a card's tag
          // area was swallowed outright instead of reaching the carousel
          // underneath it, and the carousel never scrolled. Verified with
          // a real touch simulation (CDP dispatchTouchEvent): stripping
          // just overscroll-behavior-x (leaving -y: contain) made that same
          // swipe correctly reach the carousel. Scoping this to only the
          // axis each instance actually scrolls keeps the original same-
          // axis chaining fix intact while no longer blocking the
          // orthogonal axis on a nested, cross-axis scroller.
          horizontal ? "overscroll-x-contain" : "overscroll-y-contain",
          disableWrapperPointerEvents ? "pointer-events-none" : "",
        ].join(" ")}
      >
        {/* w-max, fitContent opt-in only (not just horizontal — see that
            prop's own comment for why this can't be unconditional): a
            plain block div's width:auto (the default, with no explicit
            sizing class) fills its *containing block* — the same width as
            the viewport this sits inside — regardless of how wide its own
            children want to be; it does not shrink/grow to fit them the
            way height:auto already does for vertical stacking. A
            flex-nowrap child (e.g. SectionTabStrip's role=tablist row)
            that's wider than that simply overflows this div's own box
            without changing what this div itself reports as its size — so
            the hasOverflow-driving ResizeObserver above, which watches
            this div specifically to catch children changing size, never
            fires when a *horizontal* child grows/shrinks (e.g. more/fewer
            section tabs after a Tag Density/level change): confirmed live
            as a real bug, distinct from the resize-driven one that
            ResizeObserver fix (above) already covers — hasOverflow stayed
            stuck at its pre-change value with the hover arrows failing to
            appear (or appearing when they shouldn't) until an actual
            scroll's onScroll handler forced a fresh recompute. w-max
            (width:max-content) makes this div's own box track its child's
            true intrinsic width instead, the same way its height already
            naturally tracks a vertical child's — so the existing
            ResizeObserver on this element starts seeing the real size
            changes it was always meant to. */}
        <div
          ref={contentRef}
          className={[fitContent ? "w-max" : "", disableWrapperPointerEvents ? "pointer-events-none" : ""].join(" ")}
        >
          {children}
        </div>
      </div>

      {/* fadeSize > 0 gates rendering entirely, not just a size of 0 —
          fadeSize is a per-instance number, not a static Tailwind class
          this component can express as a literal utility, so size comes
          from an inline style either way; skipping the element completely
          when a caller passes 0 avoids rendering a zero-size gradient div
          for no reason. */}
      {showStartGradient && fadeSize > 0 && (
        <div
          className={horizontal ? "pointer-events-none absolute inset-y-0 left-0" : "pointer-events-none absolute inset-x-0 top-0"}
          style={
            horizontal
              ? { width: fadeSize, backgroundImage: `linear-gradient(to right, ${surfaceColor}, transparent)` }
              : { height: fadeSize, backgroundImage: `linear-gradient(to bottom, ${surfaceColor}, transparent)` }
          }
        />
      )}
      {showEndGradient && fadeSize > 0 && (
        <div
          className={horizontal ? "pointer-events-none absolute inset-y-0 right-0" : "pointer-events-none absolute inset-x-0 bottom-0"}
          style={
            horizontal
              ? { width: fadeSize, backgroundImage: `linear-gradient(to left, ${surfaceColor}, transparent)` }
              : { height: fadeSize, backgroundImage: `linear-gradient(to top, ${surfaceColor}, transparent)` }
          }
        />
      )}

      {/* text-[8px] here is intentionally below the type scale's smallest
          step (--text-2xs, 10px): these arrow glyphs are functional scroll
          controls, not typographic content, so they don't need to track the
          type scale the way body/label text does.

          onMouseDown/onMouseUp/onMouseLeave/onTouchStart/onTouchEnd, not
          onClick, for the actual scroll behavior: a plain click needs to
          keep working (see handlePressEnd), but holding needs to be
          detected too, which onClick alone can't do. onMouseLeave stops a
          hold the same as onMouseUp — standard behavior for hold-buttons,
          since a mouse dragging off the button while still "down"
          shouldn't leave it scrolling forever.

          onClick is still wired here too, but only to stopPropagation, not
          to trigger any scrolling — confirmed live as a real regression
          from switching off plain onClick above: a native "click" event
          still fires on its own after a mousedown+mouseup pair completes
          on the same element, regardless of stopPropagation calls inside
          those two handlers (each event type propagates independently —
          stopping one doesn't stop the others). Inside a ResultCard, that
          unstopped click bubbled up to the card's own onClick and flipped
          it every time this button was pressed. */}
      {showStartGradient && (
        <IconButton
          width={arrowWidth}
          height={arrowHeight}
          shape="circle"
          border="hair"
          shadow={arrowShadow}
          backgroundColor={arrowBackgroundColor}
          revealOnHover={groupName}
          aria-label={horizontal ? "Scroll left" : "Scroll up"}
          onMouseDown={(e) => {
            e.stopPropagation();
            handlePressStart(-1);
          }}
          onMouseUp={(e) => {
            e.stopPropagation();
            handlePressEnd(-1);
          }}
          onMouseLeave={stopContinuousScroll}
          onTouchStart={(e) => {
            e.stopPropagation();
            handlePressStart(-1);
          }}
          onTouchEnd={(e) => {
            e.stopPropagation();
            handlePressEnd(-1);
          }}
          onClick={(e) => e.stopPropagation()}
          className={
            horizontal
              ? "absolute top-1/2 -translate-y-1/2 text-[8px] leading-none z-[var(--z-overlay)]"
              : "absolute left-1/2 -translate-x-1/2 text-[8px] leading-none z-[var(--z-overlay)]"
          }
          style={horizontal ? { left: arrowInset } : { top: arrowInset }}
        >
          {horizontal ? "◀" : "▲"}
        </IconButton>
      )}
      {showEndGradient && (
        <IconButton
          width={arrowWidth}
          height={arrowHeight}
          shape="circle"
          border="hair"
          shadow={arrowShadow}
          backgroundColor={arrowBackgroundColor}
          revealOnHover={groupName}
          aria-label={horizontal ? "Scroll right" : "Scroll down"}
          onMouseDown={(e) => {
            e.stopPropagation();
            handlePressStart(1);
          }}
          onMouseUp={(e) => {
            e.stopPropagation();
            handlePressEnd(1);
          }}
          onMouseLeave={stopContinuousScroll}
          onTouchStart={(e) => {
            e.stopPropagation();
            handlePressStart(1);
          }}
          onTouchEnd={(e) => {
            e.stopPropagation();
            handlePressEnd(1);
          }}
          onClick={(e) => e.stopPropagation()}
          className={
            horizontal
              ? "absolute top-1/2 -translate-y-1/2 text-[8px] leading-none z-[var(--z-overlay)]"
              : "absolute left-1/2 -translate-x-1/2 text-[8px] leading-none z-[var(--z-overlay)]"
          }
          style={horizontal ? { right: arrowInset } : { bottom: arrowInset }}
        >
          {horizontal ? "▶" : "▼"}
        </IconButton>
      )}
    </div>
  );
}

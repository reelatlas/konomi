"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  // What the fade gradients fade *from*, and what the hover arrows are
  // filled with — i.e. "the color of whatever's actually behind this
  // component," not a fixed choice. Defaults to --surface, correct for any
  // caller sitting on a --surface card (TagScrollArea, inside ResultCard).
  surfaceColor?: string;
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
// strip (SectionTabStrip). Watches an inner, intrinsically-sized content
// div (not the fixed/full-size scroll viewport itself, whose own box never
// changes size on its own) via ResizeObserver, so it correctly detects
// content growing/shrinking for reasons the viewport can't see itself —
// e.g. a level change hiding/showing tags.
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
  fadeSize = DEFAULT_FADE_SIZE,
  continuousScrollSpeed = DEFAULT_CONTINUOUS_SCROLL_SPEED,
  arrowWidth = DEFAULT_ARROW_WIDTH,
  arrowHeight = DEFAULT_ARROW_HEIGHT,
  arrowShadow = false,
  arrowInset = 0,
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

  useEffect(() => {
    updateScrollState();
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(content);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizontal]);

  // Scrolls back to the start edge whenever the caller's reset key changes
  // (also fires harmlessly on mount, since scrollTop/scrollLeft is already
  // 0 then). Instant (no `behavior`), matching the carousel's original
  // recommendGen-triggered reset.
  useEffect(() => {
    scrollRef.current?.scrollTo(horizontal ? { left: 0 } : { top: 0 });
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
      // behavior: "auto" (instant), not "smooth" — this already runs every
      // frame on its own, so it doesn't need the browser's own scroll
      // animation stacking on top; "smooth" here would compound into
      // increasingly laggy catch-up as frames pile up.
      scrollRemainder.current += direction * continuousScrollSpeed;
      const wholePixels = Math.trunc(scrollRemainder.current);
      if (wholePixels !== 0) {
        scrollRef.current?.scrollBy({ [axisKey]: wholePixels, behavior: "auto" });
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
    <div className={GROUP_CLASSES[groupName]}>
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
        }}
        className={[
          horizontal ? "w-full overflow-x-auto overflow-y-hidden" : `${heightPx !== undefined ? "" : height} overflow-y-auto overflow-x-hidden`,
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          snap ? (horizontal ? "snap-x snap-mandatory" : "snap-y snap-mandatory") : "",
        ].join(" ")}
      >
        <div ref={contentRef}>{children}</div>
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
          backgroundColor={surfaceColor}
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
          backgroundColor={surfaceColor}
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

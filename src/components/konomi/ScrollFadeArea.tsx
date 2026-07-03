"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ScrollFadeAreaProps {
  // Tailwind height utility applied to the scroll viewport — either a fixed
  // "h-[Npx]" (viewport always this tall, e.g. TagScrollArea's per-card
  // area, which needs uniform height across a grid regardless of content)
  // or a capping "max-h-[Npx]" (viewport hugs shorter content and only
  // clamps + scrolls past the cap, e.g. the Tag Pool). Overflow detection
  // below works identically either way — it just compares the rendered
  // scrollHeight/clientHeight, which "hugging" content naturally keeps equal.
  height: string;
  scrollStep?: number;
  // Pixels to push the top gradient + up-arrow down by, for callers that
  // render their own sticky header(s) inside the scrolled content (see
  // TagPoolSection) — otherwise they'd render at top-0 and sit underneath
  // (visually hidden behind) that header. 0 for callers with no sticky
  // header (e.g. TagScrollArea), which is the common case.
  topInset?: number;
  // Adds scroll-snap-type: y mandatory to the viewport. Opt-in, not the
  // default: this only makes sense where children register real snap
  // points (TagScrollArea's chips, via its own [&_button]:snap-start on
  // its wrapping div — deliberately not baked in here, since ScrollFadeArea
  // shouldn't need to know its children are buttons). The Tag Pool doesn't
  // use this — no uniform row/section unit to snap to there (see
  // DESIGN_SYSTEM.md).
  snap?: boolean;
  // Shifts where a snap-start child comes to rest, same trick as the
  // results carousel's scroll-padding-left (see RecommendationsSection):
  // a start-aligned row settles this many px in from the true top instead
  // of flush against it, leaving exactly that much of the previous row
  // visible as a "there's more above" peek. 0 (no peek) unless a caller
  // opts in.
  scrollPaddingTop?: number;
  // What the top/bottom fade gradients fade *from*, and what the hover
  // arrows are filled with — i.e. "the color of whatever's actually behind
  // this component," not a fixed choice. Defaults to --surface, correct for
  // any caller sitting on a --surface card (TagScrollArea, inside
  // ResultCard). TagPoolBody overrides this to --bg once the Tag Pool
  // panel lost its own bordered/--surface card shell — with the default
  // still in place there, the gradients and arrows kept fading to/filling
  // with white against the page's actual (non-white) --bg, reading as a
  // mismatched pale patch/line at the scroll edges, confirmed live.
  surfaceColor?: string;
  // Height of the top/bottom fade gradients, in px. Callers with a real
  // peek already showing (TagScrollArea) want this small or 0 — the
  // gradient's job is exactly what the peek already does, and a full-size
  // fade actively works against a peek by obscuring the very row it's
  // supposed to preview. Callers with no peek (the Tag Pool) keep the
  // default, where the gradient is the only "there's more" signal.
  fadeSize?: number;
  // Real alpha transparency at the top edge, via CSS mask-image — not a
  // color-overlay gradient like fadeSize above. A first attempt at "hide
  // chips before they reach a transparent sticky header" used exactly that
  // kind of overlay (a solid-to-transparent gradient div drawn on top of
  // the content, matching the surrounding background color) — confirmed
  // live that it doesn't work: it fades content to a *color*, not to
  // nothing, so it visibly collides with the header's own (genuinely
  // transparent) text instead of cleanly erasing whatever's behind it.
  // mask-image erases actual pixels to true transparency — content that's
  // "faded" this way reveals whatever is really behind it (the page, a
  // border, anything), with no assumption about what color that is, which
  // is the same technique iOS/macOS scroll views use for edge fades.
  // Applied to the scroll viewport itself, not a child, so it covers
  // everything scrolling through that band uniformly. 0 (no mask) unless a
  // caller opts in.
  topMaskSize?: number;
  // Extends the mask's fully-transparent zone into a flat plateau from 0 up
  // to this many px, *before* the ramp to opaque starts (which then runs
  // from here to topMaskSize). Without this, the mask is a single ramp
  // starting at 0 — meaning it's only *exactly* 0% opaque at y=0 itself; a
  // few px into the ramp (e.g. within a sticky header's own height) content
  // is already partially visible, confirmed live as a real bug: chips
  // sitting behind a pinned, transparent sticky header were still faintly
  // visible, not fully erased, because the header's whole 0-38px band
  // wasn't actually within the mask's 0%-opacity region — only its very top
  // edge was. Set this to the header's own height so nothing behind it, at
  // any point in that band, is ever partially visible.
  topMaskFlatSize?: number;
  // Per-frame px rate for continuous (held) scrolling. Deliberately a prop,
  // not a single shared constant: the same rate reads completely
  // differently depending on how big the scrollable area is relative to
  // it. 6px/frame felt right for the Tag Pool's much taller/longer list,
  // but the same 6px/frame felt roughly 4x too fast for TagScrollArea's
  // much smaller area — confirmed live, not just theorized, after the
  // first shared-constant version shipped.
  continuousScrollSpeed?: number;
  // Fires once with the actual scrolling DOM element, as soon as it mounts
  // — lets a caller (TagPoolBody) attach its own scroll-position tracking
  // (which section is "active," for the sticky-header-overlay mechanism
  // below) without ScrollFadeArea needing to know anything about sections.
  onScrollContainerMount?: (el: HTMLDivElement) => void;
  // Rendered as a plain sibling of the masked/scrollable content, inside
  // the same relative wrapper — i.e., explicitly *not* a descendant of the
  // element topMaskSize masks. This is the other half of that mechanism:
  // topMaskSize erases the *real*, in-flow sticky header along with
  // everything else scrolling through that band (masks can't exempt one
  // descendant while affecting others at the same screen position — there
  // is no CSS escape hatch for that), so a caller that wants a crisp,
  // unfaded sticky header has to render a second, unmasked copy of
  // whichever one is currently active here instead, positioned to sit
  // exactly where the real (now-hidden-while-active) one would be.
  stickyOverlay?: React.ReactNode;
  children: React.ReactNode;
}

const DEFAULT_SCROLL_STEP = 32;
const DEFAULT_FADE_SIZE = 18;
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

// Shared fixed-height-viewport-with-gradient-fade-and-hover-arrows mechanic,
// used by both TagScrollArea (per-card tags) and the Tag Pool container.
// Watches an inner, intrinsically-sized content div (not the fixed-height
// viewport itself, whose own box never changes size) via ResizeObserver, so
// it correctly detects content growing/shrinking for reasons the viewport
// can't see itself — e.g. a nested CollapsibleSection expanding, not just a
// changed children array.
export function ScrollFadeArea({
  height,
  scrollStep = DEFAULT_SCROLL_STEP,
  topInset = 0,
  snap = false,
  scrollPaddingTop = 0,
  surfaceColor = "var(--surface)",
  fadeSize = DEFAULT_FADE_SIZE,
  topMaskSize = 0,
  topMaskFlatSize = 0,
  continuousScrollSpeed = DEFAULT_CONTINUOUS_SCROLL_SPEED,
  onScrollContainerMount,
  stickyOverlay,
  children,
}: ScrollFadeAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(true);
  // Tracks an in-progress press so a single mouseup/touchend/mouseleave
  // handler can tell "was this a quick click" from "was this a hold that's
  // already been continuously scrolling" — see handlePressEnd below.
  const longPressTimer = useRef<number | null>(null);
  const continuousScrollFrame = useRef<number | null>(null);
  // Carries the fractional remainder between frames. `scrollBy` rounds its
  // delta to a whole pixel per call — confirmed live: at continuousScrollSpeed
  // 0.25 (TagScrollArea's rate), every single `scrollBy({ top: 0.25 })` call
  // was silently rounding down to 0 and never moving the element at all, on
  // its own. (The appearance of movement before the scroll-snap-disable fix
  // above was never this scrollBy call — it was scroll-snap-mandatory
  // treating each no-op nudge as a completed gesture and jumping to the next
  // full snap point, which is what the earlier "4x too fast" complaints were
  // actually describing.) Accumulating the sub-pixel remainder here and only
  // calling scrollBy once it reaches a whole pixel makes any rate < 1px/frame
  // still scroll at its correct average speed instead of not moving at all.
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
    setHasOverflow(el.scrollHeight > el.clientHeight + 1);
    setAtTop(el.scrollTop <= 0);
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 1);
  };

  useEffect(() => {
    updateScrollState();
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const scrollBy = (direction: 1 | -1) => {
    scrollRef.current?.scrollBy({ top: direction * scrollStep, behavior: "smooth" });
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
    // (snap-y snap-mandatory, applied via the `snap` prop elsewhere in this
    // component) take back over, which is what makes the final resting
    // position correctly snap once scrolling actually stops.
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
    // unmounts the instant atTop/atBottom flips (see showTopGradient/
    // showBottomGradient below), so its own onMouseUp can never fire to
    // stop the loop it started. Immediately holding the *opposite* arrow
    // then started a second loop without cancelling the first — both ran
    // simultaneously in opposite directions, visibly cancelling each other
    // out (reported as "the other arrow doesn't work").
    stopContinuousScroll();
    // Temporarily turns scroll-snap off for the duration of the hold, when
    // this instance uses it at all. Confirmed live as a real, separate bug
    // from the speed number itself: with snap-mandatory active, even a
    // sub-pixel scrollBy nudge is apparently enough for the browser to
    // treat it as a completed scroll gesture and immediately snap-correct
    // to the next full row — so *every single frame* of continuous
    // scrolling was triggering its own snap-jump, compounding into
    // movement far larger than continuousScrollSpeed would predict,
    // regardless of how small that number was set to (reducing it 4x, then
    // 6x again, produced no perceptible change, because the runaway
    // snap-jumps were dominating either way — confirmed by directly
    // comparing the same tick loop with snap on vs. off: 20 ticks of
    // 0.25px each moved 104px with snap active, ~0px with it off). Restored
    // in stopContinuousScroll once the hold ends, so the final rest
    // position still snaps normally.
    if (snap && scrollRef.current) scrollRef.current.style.scrollSnapType = "none";
    scrollRemainder.current = 0;
    const step = () => {
      // behavior: "auto" (instant), not "smooth" — this already runs every
      // frame on its own, so it doesn't need the browser's own scroll
      // animation stacking on top; "smooth" here would compound into
      // increasingly laggy catch-up as frames pile up.
      //
      // Accumulate first, then only call scrollBy with the whole-pixel part
      // — see scrollRemainder's own comment for why this is necessary at all
      // (scrollBy silently no-ops on a sub-1px delta rather than fractionally
      // accumulating it itself).
      scrollRemainder.current += direction * continuousScrollSpeed;
      const wholePixels = Math.trunc(scrollRemainder.current);
      if (wholePixels !== 0) {
        scrollRef.current?.scrollBy({ top: wholePixels, behavior: "auto" });
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

  const showTopGradient = hasOverflow && !atTop;
  const showBottomGradient = hasOverflow && !atBottom;

  // useCallback, not an inline arrow — the same reason stopContinuousScroll
  // above needs one. An inline ref callback is a *new* function every
  // render, and React treats a changed ref function as "detach the old one,
  // attach the new one" even when the DOM element itself hasn't changed —
  // calling onScrollContainerMount again every single render. Since that
  // callback (TagPoolBody's recomputeActive) calls setState, this produced
  // an actual infinite render loop, confirmed live ("Maximum update depth
  // exceeded"). A stable callback reference is only invoked when the
  // element it's attached to actually mounts/unmounts.
  const setScrollRef = useCallback(
    (el: HTMLDivElement | null) => {
      scrollRef.current = el;
      if (el) onScrollContainerMount?.(el);
    },
    [onScrollContainerMount],
  );

  return (
    <div className="group/scroll relative">
      <div
        ref={setScrollRef}
        onScroll={updateScrollState}
        style={{
          ...(scrollPaddingTop ? { scrollPaddingTop } : undefined),
          // Real erasure to transparency, not a color blend — see
          // topMaskSize's own doc comment above for why this replaced an
          // earlier gradient-overlay attempt. Four stops, not two: a plain
          // transparent→black ramp starting at 0 is only *exactly* 0%
          // opaque at y=0 — a few px into the ramp (e.g. a sticky header's
          // own height), content is already partially visible again,
          // confirmed live as a real bug (see topMaskFlatSize's own doc
          // comment). Holding flat at transparent through topMaskFlatSize,
          // *then* ramping to opaque by topMaskSize, guarantees nothing in
          // that whole flat zone is ever partially visible, not just its
          // very top edge. -webkit- prefix included since mask-image
          // support without it is inconsistent across Safari versions.
          ...(topMaskSize > 0
            ? {
                WebkitMaskImage: `linear-gradient(to bottom, transparent, transparent ${topMaskFlatSize}px, black ${topMaskSize}px, black 100%)`,
                maskImage: `linear-gradient(to bottom, transparent, transparent ${topMaskFlatSize}px, black ${topMaskSize}px, black 100%)`,
              }
            : undefined),
        }}
        className={`${height} overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${snap ? "snap-y snap-mandatory" : ""}`}
      >
        <div ref={contentRef}>{children}</div>
      </div>

      {/* fadeSize > 0 gates rendering entirely, not just a height of 0 —
          fadeSize is a per-instance number, not a static Tailwind class
          this component can express as a literal utility, so height comes
          from an inline style either way; skipping the element completely
          when a caller passes 0 avoids rendering a zero-height gradient
          div for no reason. */}
      {showTopGradient && fadeSize > 0 && (
        <div
          className="pointer-events-none absolute inset-x-0"
          style={{ top: topInset, height: fadeSize, backgroundImage: `linear-gradient(to bottom, ${surfaceColor}, transparent)` }}
        />
      )}
      {showBottomGradient && fadeSize > 0 && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0"
          style={{ height: fadeSize, backgroundImage: `linear-gradient(to top, ${surfaceColor}, transparent)` }}
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
      {showTopGradient && (
        <button
          type="button"
          aria-label="Scroll up"
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
          className="absolute left-1/2 -translate-x-1/2 w-[18px] h-[16px] flex items-center justify-center rounded-full border-[length:var(--border-hair)] border-[var(--ink)] text-[8px] leading-none text-[var(--ink)] opacity-0 group-hover/scroll:opacity-100 transition-opacity cursor-pointer z-[var(--z-overlay)]"
          style={{ top: topInset, backgroundColor: surfaceColor }}
        >
          ▲
        </button>
      )}
      {showBottomGradient && (
        <button
          type="button"
          aria-label="Scroll down"
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
          className="absolute bottom-[2px] left-1/2 -translate-x-1/2 w-[18px] h-[16px] flex items-center justify-center rounded-full border-[length:var(--border-hair)] border-[var(--ink)] text-[8px] leading-none text-[var(--ink)] opacity-0 group-hover/scroll:opacity-100 transition-opacity cursor-pointer z-[var(--z-overlay)]"
          style={{ backgroundColor: surfaceColor }}
        >
          ▼
        </button>
      )}
      {stickyOverlay}
    </div>
  );
}

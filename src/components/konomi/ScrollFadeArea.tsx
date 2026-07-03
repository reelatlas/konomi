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
  // Height of the top/bottom fade gradients, in px. Callers with a real
  // peek already showing (TagScrollArea) want this small or 0 — the
  // gradient's job is exactly what the peek already does, and a full-size
  // fade actively works against a peek by obscuring the very row it's
  // supposed to preview. Callers with no peek (the Tag Pool) keep the
  // default, where the gradient is the only "there's more" signal.
  fadeSize?: number;
  children: React.ReactNode;
}

const DEFAULT_SCROLL_STEP = 32;
const DEFAULT_FADE_SIZE = 18;
// Below this holding time, a press is treated as a plain click (one
// scrollStep). At or beyond it, continuous scrolling takes over instead —
// for anyone without a trackpad/scroll wheel who'd otherwise need to click
// repeatedly to get through more than a couple of rows.
const LONG_PRESS_MS = 300;
// Deliberately independent of scrollStep — that's sized around "one
// press = a couple of rows," a single discrete jump; this is a smooth
// per-frame rate for continuous scrolling once a press turns into a hold,
// a different kind of quantity that shouldn't be derived from the same
// number.
const CONTINUOUS_SCROLL_PX_PER_FRAME = 6;

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
  fadeSize = DEFAULT_FADE_SIZE,
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
    const step = () => {
      // behavior: "auto" (instant), not "smooth" — this already runs every
      // frame on its own, so it doesn't need the browser's own scroll
      // animation stacking on top; "smooth" here would compound into
      // increasingly laggy catch-up as frames pile up.
      scrollRef.current?.scrollBy({ top: direction * CONTINUOUS_SCROLL_PX_PER_FRAME, behavior: "auto" });
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

  return (
    <div className="group/scroll relative">
      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        style={scrollPaddingTop ? { scrollPaddingTop } : undefined}
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
          className="pointer-events-none absolute inset-x-0 bg-gradient-to-b from-[var(--surface)] to-transparent"
          style={{ top: topInset, height: fadeSize }}
        />
      )}
      {showBottomGradient && fadeSize > 0 && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[var(--surface)] to-transparent"
          style={{ height: fadeSize }}
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
          className="absolute left-1/2 -translate-x-1/2 w-[18px] h-[16px] flex items-center justify-center rounded-full border-[length:var(--border-hair)] border-[var(--ink)] bg-[var(--surface)] text-[8px] leading-none text-[var(--ink)] opacity-0 group-hover/scroll:opacity-100 transition-opacity cursor-pointer z-10"
          style={{ top: topInset + 2 }}
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
          className="absolute bottom-[2px] left-1/2 -translate-x-1/2 w-[18px] h-[16px] flex items-center justify-center rounded-full border-[length:var(--border-hair)] border-[var(--ink)] bg-[var(--surface)] text-[8px] leading-none text-[var(--ink)] opacity-0 group-hover/scroll:opacity-100 transition-opacity cursor-pointer z-10"
        >
          ▼
        </button>
      )}
    </div>
  );
}

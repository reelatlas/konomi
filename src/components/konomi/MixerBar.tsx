"use client";

import { useEffect, useRef } from "react";
import type { MatchKey, MixerError, Slot, TagInfo } from "@/lib/konomi/types";
import { ActionButton } from "./ActionButton";
import { DiceIcon, EraserIcon, GreaterEqualIcon, TagIcon } from "./icons";
import { IconButton } from "./IconButton";
import { MatchSelector } from "./MatchSelector";
import { RecommendButton } from "./RecommendButton";
import { ScrollFadeArea } from "./ScrollFadeArea";
import { TagSlot } from "./TagSlot";

interface MixerBarProps {
  slots: Slot[];
  // Resolves slot ids to display names (THE IDENTITY CONTRACT, types.ts).
  tagInfoById: Map<string, TagInfo>;
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
  // The tag pool overlay's open state + open/close (KonomiApp's editMode).
  // This bar no longer renders or hosts the pool in any form (search v2
  // Phase 3 — the panel lives in TagPoolOverlay, invoked from the
  // persistent header); these exist ONLY for the empty-slot tap toggle
  // (see handleSlotClick), the one pool affordance this bar keeps.
  editMode: boolean;
  onOpenEditMode: () => void;
  onCloseEditMode: () => void;
}

// The app's one mixer bar — the always-present "mix deck": 3 tag slots,
// Clear, Min Match, Random, and RECOMMEND, in a single bordered card at
// the bottom of the shell.
//
// HISTORY (search v2 Phase 3, 2026-07-26): this file was ~3,300 lines
// until the tag pool / edit-mode machinery was deleted wholesale. For its
// whole prior life the bar EXPANDED UPWARD into the tag-pool edit sheet,
// which required: a negative-marginTop growth mechanism so slots/controls
// never moved, pin-scroll loops, live-drag height pinning + clip-path
// reveals (four recorded rounds), worst-case overhead constants
// (EDIT_MODE_FIXED_ROWS_HEIGHT), document-level Escape/click-outside
// listeners, dialog focus management, [contain:layout] jitter fixes, and
// the WebKit stroke-shimmer layer promotion. The pool now renders as
// TagPoolOverlay (a floating card under the persistent results header)
// where NONE of that machinery is needed — an overlay pushes no layout —
// so it was deleted here rather than left dormant. The full case history
// lives in DESIGN_SYSTEM.md (MixerBar sections, Rounds 1-6, and "Search
// v2 — global relocation"); git history has the code.
//
// What deliberately REMAINS from that era, still load-bearing for the
// browse-mode bar:
//
// position:sticky bottom-0 — the last child of the page's shared content
// column (see KonomiApp.tsx). Since the app-shell rewrite nothing above
// it scrolls, so sticky is effectively a no-op for position — kept (not
// reverted to static) because it's harmless and preserves the z-index/
// positioned-value invariants the stacking below assumes. The bar's
// bottom gap comes from KonomiApp's root pb-[space-2xl], matching the
// uniform 24px frame gutter every edge uses.
//
// The wheel/touch containment effect — this bar is a self-contained
// control surface; gestures over it must never scroll the page behind it
// (see the effect's own comment).
//
// Row 2's one-line priority-hide ladder — @container rungs against the
// bar's own content box (see the ladder comment at the row).
export function MixerBar({
  slots,
  tagInfoById,
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
}: MixerBarProps) {
  // Tapping an empty slot opens the tag pool overlay instead of the no-op
  // CLEAR_SLOT dispatch it used to trigger; a filled slot still clears as
  // before. This decision has to live here (not in TagSlot or the
  // reducer) since "open the pool" is UI state the reducer deliberately
  // doesn't own. While the pool is already open, tapping an empty slot
  // closes it instead of no-op-reopening it — the same toggle behavior
  // the header's Tag Pool button and click-outside already give, just
  // reachable from a second, already-visible spot. This is the ONE pool
  // affordance this bar kept through the search v2 relocation (its own
  // Tag Pool button was removed in Phase 3 — the header owns invocation).
  function handleSlotClick(index: number) {
    if (slots[index]) {
      onSlotClick(index);
    } else if (editMode) {
      onCloseEditMode();
    } else {
      onOpenEditMode();
    }
  }

  // The one bordered/shadowed box. Only referenced by the wheel/touch
  // containment effect below now — the growth machinery that used to
  // measure and animate it is gone (see the top-of-file history note).
  const cardRef = useRef<HTMLDivElement>(null);

  // Wheel/touch scroll anywhere over this bar — desktop or mobile — must
  // never fall through to scroll the page behind it: hovering/touching
  // this bar reads as interacting with a self-contained control surface,
  // not a transparent window onto the page scrolling underneath.
  //
  // The one exception is this bar's own genuinely scrollable area — the
  // slots' ScrollFadeArea — which must keep scrolling internally. The
  // exclusion is keyed off data-scroll-fade-orientation (an attribute
  // ScrollFadeArea stamps on its own scroll viewport), found via
  // target.closest(), and only a gesture whose own axis matches that
  // instance's orientation is let through — a vertical gesture over the
  // (horizontal-only) slots row still gets preventDefault like anywhere
  // else on the bar. Direction is derived, not assumed: WheelEvent
  // carries deltaX/deltaY directly, but touchmove doesn't, so the touch
  // case tracks the gesture's start point and locks an axis off the
  // first move that clears a small noise threshold, holding that lock
  // for the rest of the gesture (a diagonal start would otherwise flip
  // between "let through" and "block" as it settles).
  //
  // Both wheel and touchmove are native, non-passive addEventListener
  // calls, not JSX onWheel/onTouchMove props — confirmed live this is
  // required: React registers its delegated listener for both event
  // types as passive by default, so a JSX prop's preventDefault() is
  // silently a no-op (an actual console error the first time it was
  // tried as props).
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
    // actually moving anything (confirmed live: a brief but real visual
    // glitch, distinct from the scroll-through behavior itself).
    // html.hide-scrollbar-while-blocked (globals.css) sets
    // overflow: hidden for as long as this stays applied. Re-armed (not
    // just set once) on every blocked event so a sustained gesture keeps
    // it hidden rather than flickering the class between wheel ticks;
    // removed shortly after the last blocked event.
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

  return (
    <div
      // w-full: the bar always FILLS its column, so its width is constant
      // regardless of how much the current content happens to be. (mx-auto
      // was tried and made it worse: auto margins on a flex item DISABLE
      // cross-axis stretch — removed long ago.)
      //
      // max-w-full, NOT a repeated pixel cap: this bar is a flex item in
      // KonomiApp's own already-capped column (so the cap is inherited).
      // A definite max-width also CAPS this flex item's automatic minimum
      // size (CSS Flexbox spec) — without it, a wide inner row forced the
      // item's min-content past the viewport and the whole bar overflowed
      // on small screens; min-width:0 alone does NOT cap a flex item's
      // auto-minimum. Paired with the min-w-0 shrink chain down to the
      // slots' ScrollFadeArea, an over-wide row scrolls instead of
      // overflowing.
      //
      // data-mixer-bar: allowlisted by TagPoolOverlay's click-outside
      // listener (search v2) — slots/min-match/Random/RECOMMEND must stay
      // usable against the open pool overlay (chip-drag into slots is the
      // core flow), so a click anywhere on this bar never dismisses it.
      data-mixer-bar
      className="sticky bottom-0 z-[var(--z-overlay)] w-full max-w-full touch-none"
    >
      <div
        ref={cardRef}
        // The one card: border/padding/background/shadow drawn once around
        // the bar's whole content. box-shadow (not filter:drop-shadow) —
        // a filter promotes the subtree to a compositor layer WebKit
        // re-uploads per frame; box-shadow paints inline with the border
        // (an earned on-device lesson from the panel era, still the right
        // choice for a static bar).
        className="px-[var(--space-2xl)] py-[var(--space-xl)] border-[length:var(--border-base)] border-[var(--ink)] bg-[var(--surface)] shadow-[var(--elev-4)]"
      >
        {/* The controls row: 3 tag slots and every control on ONE line,
            always — it never wraps at any width. The responsive ladder is
            one priority-hide chain: each rung gives up a little more, in a
            fixed order, each breakpoint originally live-bisected to sit
            exactly where the previous rung's fit stops holding.

            NOTE — these are @container thresholds against the wrapper
            below (the bar's own content box), NOT viewport media queries:
            every number is its old viewport value minus 96px (KonomiApp's
            48px root gutter + this card's own 48px padding).

              - @min-[975px]  Full form: every control shows its text
                              label, and the Random/Recommend divider is
                              visible.
              - @max-[974px]  RUNG 1: the divider disappears. RUNG 2 (same
                              threshold): Clear, Random, and Recommend
                              drop to icon-only; Min Match loses only its
                              "MIN MATCH" text label.
              - @max-[654px]  RUNG 3: Min Match loses the Tag icon AND
                              switches to the single-tap-cycle collapsed
                              control, as one combined step.
              - @max-[525px]  RUNG 4: Clear hidden entirely.
              - @max-[481px]  RUNG 5: Random hidden entirely. Final
                              composition below this point: 3 slots, Min
                              Match (1 icon, collapsed), Recommend.
            Below @415px even that final composition no longer fits — the
            3 slots' own sub-group scrolls internally instead of the row
            wrapping (the last, most expensive rung).

            ⚠️ These rungs were bisected while the bar still carried its
            own Tag Pool button (removed in search v2 Phase 3 — the
            header owns pool invocation now; its old rung was @max-[561px],
            mirrored by the empty-state surfaced button, also removed).
            With that button's width freed, Clear/Random now hide slightly
            EARLIER than strictly necessary — safe (no overflow is
            possible, only premature hiding), but the 525/481 rungs are
            worth an on-device re-bisection pass when convenient. The 481
            literal is still MIRRORED in RecommendationsBody.tsx's
            empty-state surfaced Random — if re-bisected, update it there
            too (duplicated literal on purpose: Tailwind container-query
            classes must be static source text).

            Adding a new rung: give it its own breakpoint, and re-bisect
            the WHOLE chain from that point down — every threshold above
            is only correct in reference to which others are already
            hidden at that width. */}
        {/* @container query context for the ladder. A dedicated wrapper —
            historically because container-type on the card itself
            interfered with the (now-deleted) growth machinery; still the
            right shape: this wrapper has no padding or role beyond the
            query context, so its content box equals the width the
            controls actually lay out in. */}
        <div className="@container">
          <div className="mixbar-controls-row flex flex-nowrap items-center gap-x-[var(--space-lg)]">
            {/* LEFT group. min-w-0: lets this flex item (and the slots
                sub-group inside it) actually shrink below natural content
                width once the row runs out of room. */}
            <div className="flex items-center gap-[var(--space-lg)] min-w-0">
              {/* Sub-group A: the 3 tag slots. min-w-0 on this wrapper is
                  what lets it shrink once everything else has claimed
                  what it needs — the slots are the LAST thing to give
                  way, scrolling internally (ScrollFadeArea) instead of
                  the row ever wrapping. scrollStep={90}: one slot's own
                  width (78px) plus this row's shared gap-lg (12px), so a
                  click/arrow-tap scrolls one slot at a time. */}
              {/* -mb-[4px]/-mr-[4px] cancel the pb-[4px]/pr-[4px] on the
                  scrollable content below — the established pad-then-
                  cancel shadow-clipping fix (see DESIGN_SYSTEM.md):
                  ScrollFadeArea's viewport is overflow-x-auto/
                  overflow-y-hidden, which otherwise clips a filled
                  TagSlot's own shadow-[var(--elev-3-accent)] (a flat
                  4px/4px offset — the 4px matches that token exactly) at
                  the bottom edge for every slot and the right edge for
                  the last one. */}
              <div className="min-w-0 -mb-[4px] -mr-[4px]">
                <ScrollFadeArea orientation="horizontal" scrollStep={90} fadeSize={12} fitContent restrictTouchAction>
                  <div className="flex gap-[var(--space-lg)] pb-[4px] pr-[4px]">
                    {slots.map((tag, index) => (
                      <TagSlot
                        key={index}
                        index={index}
                        tag={tag}
                        // Display name resolved from the slot id — slots hold
                        // TagInfo.ids since Phase 3a (THE IDENTITY CONTRACT).
                        label={tag ? (tagInfoById.get(tag)?.name ?? tag) : null}
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
              {/* Sub-group B: Clear. (Tag Pool sat here first until search
                  v2 Phase 3 — the header owns pool invocation now; an
                  empty slot tap still opens it, see handleSlotClick.)
                  shrink-0: this sub-group never shrinks/scrolls, only the
                  slots do. Below @max-[525px] a tag can still be removed
                  from its slot directly (tap it, or drag it back out)
                  even without this button. */}
              <div className="flex items-center gap-[var(--space-lg)] shrink-0">
                <div className="@min-[975px]:hidden @max-[525px]:hidden">
                  <IconButton size="md" border="base" shadow="elev-2" backgroundColor="transparent" title="Clear" aria-label="Clear" onClick={onClearSlots}>
                    <EraserIcon className="text-[var(--ink)]" />
                  </IconButton>
                </div>
                <div className="hidden @min-[975px]:block">
                  <ActionButton variant="outline" onClick={onClearSlots}>
                    <span className="inline-flex items-center gap-[var(--space-sm)]">
                      Clear
                      <EraserIcon className="text-[var(--ink)]" />
                    </span>
                  </ActionButton>
                </div>
              </div>
            </div>
            {/* RIGHT group. shrink-0: never shrinks either — only the
                slots' own ScrollFadeArea absorbs the squeeze, so these
                controls never get compressed, just individually hidden by
                their own rungs. */}
            <div className="ml-auto flex items-center gap-[var(--space-lg)] shrink-0">
              <div className="@max-[654px]:hidden flex items-center gap-[var(--space-sm)]">
                {/* @max-[975px]:hidden: the "Min Match" label drops at the
                    shared icon-only rung; the control keeps its 2 icons
                    and 3-segment form through that rung. */}
                <span className="@max-[975px]:hidden font-mono font-bold text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] uppercase whitespace-nowrap">
                  Min Match
                </span>
                <TagIcon className="text-[var(--ink)]" />
                <GreaterEqualIcon className="text-[var(--ink)]" />
                <MatchSelector value={minMatch} onChange={onSetMatch} />
              </div>
              <div className="hidden @max-[654px]:flex items-center gap-[var(--space-sm)]">
                {/* RUNG 3 — the only rung that changes a control itself
                    instead of just losing a label: the Tag icon goes
                    (GreaterEqual alone still reads as "match count") AND
                    the 3-segment control collapses to single-tap-cycle,
                    together, as one requested combined step. */}
                <GreaterEqualIcon className="text-[var(--ink)]" />
                <MatchSelector value={minMatch} onChange={onSetMatch} collapsed />
              </div>
              {/* Random. Both hide conditions on this SAME div, not nested
                  — nesting left an empty-but-not-display:none box still
                  collecting gap-lg on both sides (a real, reported doubled
                  gap). ⚠️ SHARED BREAKPOINT (481) — mirrored by the
                  empty-state surfaced Random (RecommendationsBody.tsx);
                  re-bisect both together. */}
              <div className="@min-[975px]:hidden @max-[481px]:hidden">
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
              <div className="hidden @min-[975px]:block">
                <ActionButton variant="filled" onClick={onRandomTags}>
                  <span className="inline-flex items-center gap-[var(--space-sm)]">
                    Random
                    <DiceIcon className="text-[var(--ink)]" />
                  </span>
                </ActionButton>
              </div>
              {/* ml-[3px], not a plain gap-lg on both sides: RANDOM's own
                  flat 3px shadow bleeds into the raw gap on ITS side of
                  the divider while RECOMMEND's bleeds away from it —
                  measured: both layout gaps were an identical 12px, but
                  the VISUAL gap read smaller on Random's side. The extra
                  3px gives the shadow exactly the room it bleeds into
                  ("match the rendered distance, not just the token" —
                  DESIGN_SYSTEM.md). */}
              <div className="hidden @min-[975px]:block ml-[3px] w-[length:var(--border-thin)] h-[32px] bg-[var(--ink)]" />
              <RecommendButton filledCount={filledCount} onRecommend={onRecommend} error={error} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

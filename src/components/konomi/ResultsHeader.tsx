"use client";

import { useEffect, useRef, useState } from "react";
import type { LevelKey } from "@/lib/konomi/types";
import { ActionButton } from "./ActionButton";
import { CloseIcon, ExistingIcon, LockClosedIcon, LockOpenIcon, NewIcon } from "./icons";
import { IconButton } from "./IconButton";
import { ResultsFilterButton } from "./ResultsFilterButton";

interface ResultsHeaderProps {
  hasResults: boolean;
  // Left-aligned result-set metadata, three icon+count readouts (results state
  // only): LOCKED (how many current results are locked), NEW (fresh this batch),
  // EXISTING (were in the previous batch and came back). The three partition the
  // result set: locked + new + existing === total. lockedCount also drives the
  // unlock-all affordance (glow on hover, click clears all via onUnlockAll →
  // UNLOCK_ALL). Counts are computed in KonomiApp from results/locked/
  // prevResultTitles.
  lockedCount: number;
  newCount: number;
  existingCount: number;
  onUnlockAll: () => void;
  onClearRecs: () => void;
  onLevelChange: (level: LevelKey) => void;
}

// How long the "unlocked" confirmation shows after clicking unlock-all before
// the readout settles back to the (now 0) locked count. A brief beat, matching
// the app's other quick state-change feedbacks.
const UNLOCKED_FEEDBACK_MS = 1100;

// Results-state chrome only: the Clear ✕ button and the Filter popover,
// right-aligned. There is NO "Recommendations" title text anymore (dropped to
// condense the page), and the Clear ✕ / Filter CONTENT shows only when there
// are results — in the empty state the Tag Density/Sort filters live inside the
// empty-state box itself (RecommendationsBody), so there's nothing to show here.
//
// The row's own HEIGHT (min-h-[30px] + mb-[space-lg]) is ALWAYS reserved,
// including the empty state — only its CONTENT is gated on hasResults. This is
// the whole mechanism that keeps the empty state's vertical footprint identical
// to the results footprint (header + cards): because this row never collapses,
// RecommendationsBody's own height — and therefore the 100cqh that drives
// --result-card-height — is the same whether it holds the cards or the empty-
// state box, so the two match automatically at every width/height with NO
// per-breakpoint sizing (see RecommendationsBody's empty-state comment and
// DESIGN_SYSTEM.md). A previous version collapsed this row when empty (an
// earlier reserveRow / onResultsGridVisibleChange dance driven from KonomiApp),
// which made the empty box sit shorter than the results block above the mixer
// (reported); always-reserving removes that whole mechanism AND the jump.
// Cards also can't jump on Clear anymore because the row is simply always here,
// not held up for the exit and then dropped.
export function ResultsHeader({ hasResults, lockedCount, newCount, existingCount, onUnlockAll, onClearRecs, onLevelChange }: ResultsHeaderProps) {
  // Transient "unlocked" confirmation after a click: the locked readout flips to
  // an open lock + the word "unlocked" for a beat, then settles back to the
  // closed lock + its (now 0) count. Timer ref so a rapid re-click resets it.
  const [justUnlocked, setJustUnlocked] = useState(false);
  const unlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (unlockTimer.current) clearTimeout(unlockTimer.current); }, []);
  const handleUnlockAll = () => {
    onUnlockAll();
    setJustUnlocked(true);
    if (unlockTimer.current) clearTimeout(unlockTimer.current);
    unlockTimer.current = setTimeout(() => setJustUnlocked(false), UNLOCKED_FEEDBACK_MS);
  };
  // The locked readout is interactive (glow + click-to-unlock) only when there
  // is actually something locked; at 0 it's a plain static indicator.
  const lockInteractive = lockedCount > 0;
  // Shared look for the three metadata readouts (mono, small, lowercase — the
  // uppercase treatment was dropped per request; tabular-nums so counts don't
  // jitter width).
  const metaBase = "inline-flex items-center gap-[var(--space-xs)] font-mono text-[length:var(--text-2xs)] tracking-[var(--tracking-lg)] lowercase shrink-0";
  const iconBox = "inline-flex items-center justify-center w-[15px] h-[15px] shrink-0";
  // Unified colour rule for ALL THREE readouts (requested): a 0/empty count uses
  // the app's INACTIVE-tab colour (--muted), a non-zero count the ACTIVE-tab
  // colour (--ink) — the exact pair SectionTabStrip uses (active ? --ink :
  // --muted). Each readout colours off its OWN count. The locked readout follows
  // the same rule; its hover glow (globals.css) is a separate accent layered on
  // top when interactive.
  const metaColor = (n: number) => (n > 0 ? "text-[var(--ink)]" : "text-[var(--muted)]");
  // Thin vertical divider between readouts.
  const divider = <span aria-hidden className="w-px h-[13px] bg-[var(--muted)] shrink-0" />;
  return (
    // Always flex-row, never flex-col — this row must never wrap to two
    // lines: wrapping would push the card row's own spawn position down,
    // breaking the header+card+mixer "fits one viewport" group (see
    // globals.css's --result-card-height comment) at whatever breakpoint
    // it happened to wrap. The old flex-col/min-[417px]:flex-row switch
    // (this row's previous behavior) is gone entirely, not just retuned.
    //
    // Staying single-line at narrow widths instead relies on dropping the
    // title's own JP companion span (see TitleWithSubtitle's subtitleClassName
    // below) rather than wrapping — min-w-0 lets this group actually
    // shrink to make room for it before that breakpoint, and stops the
    // row itself from ever being forced wider than available space.
    //
    // min-h-[30px]: Clear ✕'s and the Filter button's own shared, measured
    // rendered height (see ActionButton.tsx's sm size) — pins the row so it
    // doesn't jitter as those buttons mount. mb-[var(--space-lg)]: 12px, half
    // the app's usual 24px frame gutter — a deliberate exception here so the
    // Clear/Filter controls read as belonging TO the results row directly below
    // them (requested "feel more connected"), rather than as a separate band.
    // justify-between: result-set metadata (count + unlock-all) sits at the
    // LEFT, the Filter/Clear controls at the right. Both halves are gated on
    // hasResults, so the empty state leaves the row visually empty (its height
    // still always reserved, above).
    <div className="flex flex-row items-center justify-between min-h-[30px] gap-x-[var(--space-lg)] mb-[var(--space-lg)]">
      {/* LEFT: result-set metadata — three icon+count readouts, divider-
          separated: LOCKED · NEW · EXISTING. Locked leftmost (it owns the
          unlock-all interaction), then the two results buckets. locked + new +
          existing === total results. All three always show while hasResults
          (locked shows 0 too, so unlock-all can settle to 🔒 0). */}
      {hasResults && (
        <div className="flex items-center gap-[var(--space-sm)] min-w-0">
          {/* LOCKED — the unlock-all affordance. Interactive only when > 0:
              .unlock-btn enables the hover/focus glow (globals.css, the same
              bloom the MixerBar grip uses, in --primary), and the click clears
              every lock, then flashes "unlocked" (open lock + word) for a beat
              before settling to a closed lock + 0. --primary throughout so the
              held cards read as active vs the muted new/existing counts. */}
          <button
            type="button"
            onClick={lockInteractive ? handleUnlockAll : undefined}
            title={lockInteractive ? "unlock all" : undefined}
            aria-label={
              lockInteractive
                ? `unlock all ${lockedCount} locked ${lockedCount === 1 ? "card" : "cards"}`
                : `${lockedCount} locked`
            }
            className={`${metaBase} ${metaColor(lockedCount)} ${lockInteractive ? "unlock-btn cursor-pointer" : "cursor-default"}`}
          >
            <span className={iconBox}>
              {justUnlocked ? <LockOpenIcon className="lock-glow" /> : <LockClosedIcon className="lock-glow" />}
            </span>
            {justUnlocked ? <span>unlocked</span> : <span className="tabular-nums">{lockedCount}</span>}
          </button>
          {divider}
          {/* NEW — fresh picks this batch (not in the previous batch). Text
              label "new" in front of the icon+count (requested). */}
          <span className={`${metaBase} ${metaColor(newCount)}`} title="new">
            <span>new</span>
            <span className={iconBox}>
              <NewIcon />
            </span>
            <span className="tabular-nums">{newCount}</span>
          </span>
          {divider}
          {/* EXISTING — results re-appearing from the previous batch (recycle
              glyph). Text label "existing" in front of the icon+count. */}
          <span className={`${metaBase} ${metaColor(existingCount)}`} title="existing">
            <span>existing</span>
            <span className={iconBox}>
              <ExistingIcon />
            </span>
            <span className="tabular-nums">{existingCount}</span>
          </span>
        </div>
      )}
      {/* RIGHT: the Filter popover + Clear ✕ controls (unchanged). */}
      {hasResults && (
        <div className="flex items-center gap-[var(--space-lg)] flex-wrap">
          {/* Filter popover first (left), Clear ✕ second (right) — requested
              order swap; the row is a plain left-to-right flex, so listing
              ResultsFilterButton before the Clear span puts Clear on the right. */}
          <ResultsFilterButton onLevelChange={onLevelChange} />
          {
            // data-clear-results + contents: lets MixerBar's click-outside-
          // closes-edit-mode listener allowlist this button via a single
          // closest() check (see that file's own comment) without this
          // wrapper affecting layout — display:contents removes the span
          // itself from the flex layout, so ActionButton's own rendered
          // button participates in the row exactly as if this wrapper
          // weren't there. ActionButton itself has no prop for arbitrary
          // data-* passthrough (a narrow, intentional interface — see its
          // own comment), so this wraps it instead of extending it.
          //
          // relative z-[var(--z-raised)] on the button itself: the results
          // carousel's own ScrollFadeArea wrappers (RecommendationsBody.tsx)
          // carry real, invisible pt/pb-40px flip-bulge padding that makes
          // them geometrically overlap this button's own bottom ~24px
          // (confirmed live via getBoundingClientRect on both) — previously
          // papered over by making those wrappers pointer-events-none, which
          // also — an unrelated side effect nobody had reason to check at
          // the time — disqualified the carousel's real overflow-x-auto
          // viewport from native touch-scroll-gesture-chaining, breaking
          // mobile carousel swipe whenever a card's tag area wasn't itself
          // an active (overflowing) scroll container. Fixed at the source
          // instead: this button now explicitly wins the hit-test at that
          // overlap by paint order (z-index) rather than by disqualifying
          // the carousel's wrappers from hit-testing altogether — so the
          // carousel's own pointer-events can go back to the default auto
          // (see RecommendationsBody.tsx) and still receive the gesture.
          <span data-clear-results className="contents">
            {/* shrink-0 grow-0: reported live as an intermittent, mobile-
                only bug — this button occasionally stretched horizontally
                toward the results card's own width instead of staying a
                tight fit around "Clear ✕". Not reproducible in this
                project's own headless-Chromium testing (fresh mount,
                repeated RECOMMEND clicks, several widths, all stable at a
                fixed content width) — consistent with a real-device-only
                WebKit quirk, the same class of issue as this app's own
                documented iOS dashed-border clipping (see
                DESIGN_SYSTEM.md). display:contents on the wrapping span
                (above) promotes this button to be a direct flex item of
                the row it sits in; Safari has known bugs where a
                contents-promoted child doesn't reliably keep the spec's
                default flex-grow:0/flex-shrink:1 sizing. Pinning both
                explicitly is a defensive fix for that class of bug, not a
                guess at a different root cause — confirm on-device that
                this actually resolves it, since it couldn't be verified
                by direct reproduction here. */}
            {/* Two full sibling forms below 480px, not one button with
                internal conditional content — same idiom LevelSelector/
                SortSelect already use for their own collapsed form,
                needed here because the collapsed state isn't just "hide
                the text," it's a differently-shaped button: IconButton's
                own fixed 30×30 size="sm" box (border-base, no shadow —
                same treatment as the ActionButton form's own shadowless
                inverted look), matching the Filter button
                (ResultsFilterButton) it now sits directly beside,
                requested directly so the two read as the same size.
                ActionButton's padding-based sizing has no equivalent fixed
                box, so swapping its own content for just an icon doesn't
                get there on its own. */}
            <ActionButton
              variant="inverted"
              size="sm"
              onClick={onClearRecs}
              aria-label="Clear results"
              className="hidden min-[480px]:inline-flex relative z-[var(--z-raised)] shrink-0 grow-0"
            >
              Clear ✕
            </ActionButton>
            <IconButton
              size="sm"
              border="base"
              backgroundColor="var(--ink)"
              textColor="var(--bg)"
              title="Clear results"
              aria-label="Clear results"
              onClick={onClearRecs}
              display="flex min-[480px]:hidden"
              className="relative z-[var(--z-raised)] shrink-0 grow-0"
            >
              <CloseIcon />
            </IconButton>
          </span>
          }
        </div>
      )}
    </div>
  );
}

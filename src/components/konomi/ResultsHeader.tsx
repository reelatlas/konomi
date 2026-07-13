import type { LevelKey } from "@/lib/konomi/types";
import { ActionButton } from "./ActionButton";
import { CloseIcon } from "./icons";
import { IconButton } from "./IconButton";
import { ResultsFilterButton } from "./ResultsFilterButton";

interface ResultsHeaderProps {
  hasResults: boolean;
  onClearRecs: () => void;
  onLevelChange: (level: LevelKey) => void;
}

// Results-state chrome only: the Clear ✕ button and the Filter popover,
// right-aligned. There is NO "Recommendations" title text anymore (dropped to
// condense the page), and this whole row renders ONLY when there are results —
// in the empty state the Tag Density/Sort filters live inside the empty-state
// box itself (RecommendationsBody), so there's no header or filter control to
// show here at all. Returning null (rather than an empty row) lets the empty
// state reclaim that vertical space.
export function ResultsHeader({ hasResults, onClearRecs, onLevelChange }: ResultsHeaderProps) {
  if (!hasResults) return null;
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
    // doesn't jitter as those buttons mount. mb-[var(--space-2xl)]: a flat 24px
    // now, no title-slack subtraction anymore — with the "Recommendations"
    // title gone, the row's content is just the 30px-tall buttons filling it
    // edge to edge, so there's no invisible centering slack below the text to
    // compensate for; the margin IS the visual gap to the card row (24px, the
    // same uniform gutter as card→mixer). justify-end: buttons sit at the right,
    // where the Clear+Filter cluster always was.
    <div className="flex flex-row items-center justify-end min-h-[30px] gap-x-[var(--space-lg)] mb-[var(--space-2xl)]">
      <div className="flex items-center gap-[var(--space-lg)] flex-wrap">
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
        <ResultsFilterButton onLevelChange={onLevelChange} />
      </div>
    </div>
  );
}

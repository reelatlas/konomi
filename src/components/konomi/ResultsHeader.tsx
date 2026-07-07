import { ActionButton } from "./ActionButton";
import { TitleWithSubtitle } from "./TitleWithSubtitle";

interface ResultsHeaderProps {
  hasResults: boolean;
  onClearRecs: () => void;
}

// Extracted from the retired PanelToggleHeader's Recommendations-active
// branch — Results is now the only surface, so this header is unconditional
// instead of tab-gated. Title/JP-subtitle classes match the app's own
// title-row rule exactly (leading-display on the title, leading-tight on
// the companion span), same as Mixer/MixerBar's own title row.
export function ResultsHeader({ hasResults, onClearRecs }: ResultsHeaderProps) {
  return (
    // flex-col by default, min-[417px]:flex-row — a real breakpoint switch
    // (title on its own line, Clear ✕ below, when narrow; one row, title
    // left / Clear ✕ right, when wide), not flex-wrap letting the two
    // groups wrap independently. Re-bisected live after the metadata hint
    // span (the old "N recs · N tags · ..." text) was removed — that was
    // this row's previous worst-case content, driving the old 853px
    // number. With just the title and Clear ✕ now, the row itself fits far
    // narrower, but a *different* constraint sets the actual floor: below
    // 417px, TitleWithSubtitle's own JP companion span ("おすすめ") wraps
    // to two lines once it's sharing the row with Clear ✕ instead of
    // having the full row to itself — confirmed live: 417px keeps it on
    // one line, 416px is the first width that wraps it.
    //
    // No min-height needed in stacked (flex-col, <417px) mode — the title
    // sits on its own line regardless of whether Clear ✕ is mounted, so
    // mounting it only changes the *second* line's own height, never
    // shifts the title. Tested, not assumed: with no min-height at all,
    // stacked mode showed zero title movement when results appeared.
    //
    // Row mode (417px+) is a different story — tested that too, and the
    // jump *does* come back there: the title's own line-height (22.36px)
    // is shorter than Clear ✕'s rendered height (36.5px), so once they're
    // side-by-side flex siblings again, mounting Clear ✕ still grows the
    // row from 22.36px to 36.5px, and with items-center the (now off-
    // center) title visibly drops by half that delta (confirmed live:
    // 7.06px). So min-[417px]:min-h-[36.5px] brings the height pin back,
    // scoped to exactly the mode that still needs it — re-confirmed live
    // at the new breakpoint: title's own top position is byte-identical
    // between zero state and results state. 36.5px is Clear ✕'s own
    // measured rendered height (ActionButton size="sm") — retune by hand
    // if that ever changes.
    <div className="flex flex-col min-[417px]:flex-row min-[417px]:items-center min-[417px]:justify-between min-[417px]:min-h-[36.5px] gap-x-[var(--space-lg)] gap-y-[var(--space-sm)] mb-[var(--space-xl)]">
      <div className="flex items-center gap-[var(--space-md)]">
        <TitleWithSubtitle title="Recommendations" subtitle="おすすめ" />
      </div>
      <div className="flex items-center gap-[var(--space-lg)] flex-wrap">
        {hasResults && (
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
            <ActionButton variant="inverted" size="sm" onClick={onClearRecs} className="relative z-[var(--z-raised)]">
              Clear ✕
            </ActionButton>
          </span>
        )}
      </div>
    </div>
  );
}

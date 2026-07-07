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
    // min-h-[36.5px], unconditional now (was min-[417px]:min-h-[36.5px]):
    // the title's own line-height (22.36px) is shorter than Clear ✕'s
    // rendered height (36.5px), so mounting Clear ✕ would otherwise grow
    // the row and — with items-center — visibly drop the title by half
    // that delta (confirmed live: 7.06px, back when this row could still
    // be in flex-col mode without it). Pinning the height directly avoids
    // that regardless of hasResults. 36.5px is Clear ✕'s own measured
    // rendered height (ActionButton size="sm") — retune by hand if that
    // ever changes.
    //
    // mb-[calc(var(--space-2xl)_-_7.08px)]: the *visual* gap from the
    // title's own text to the card row below, which is the one that has
    // to match card→mixer's 24px, not the raw margin value alone. Because
    // this row is items-center (required — see below) and min-h pins it to
    // Clear ✕'s 36.5px while the title's own text is only ~22.36px tall,
    // centering leaves ~7.08px of invisible slack *below* the text before
    // this margin even starts (the same slack sits above it too, harmless —
    // it's just breathing room under the masthead gap). Left as a flat
    // space-2xl, the text-to-card gap would visually read as ~31px
    // (7.08 + 24), noticeably bigger than the mixer's tight 24px — confirmed
    // live. Subtracting the slack here means margin + slack = 24 again,
    // matching visually rather than just matching the token. Not swapping
    // to items-end instead (which would remove the slack at its source):
    // that would also un-center Clear ✕ from the title text (Clear already
    // spans the row's full 36.5px either way, so its own alignment never
    // moves it — only the title's alignment is actually in play here, and
    // center is what keeps Clear vertically centered on the title, a
    // separate, confirmed-correct requirement this fix must not undo).
    // 7.08 = half of (36.5 − 22.36), both already-documented measured
    // constants above — not a fresh guess, but also not expressible purely
    // in existing tokens (the title's exact rendered line-height isn't one),
    // so it's recorded here the same way this file already records 36.5
    // and 417.
    //
    // --header-row-height in globals.css (36.5px, a single flat value
    // since this row can't wrap anymore) is this row's own *content*
    // height only, read independently by the card-height clamp — that
    // constant and this margin must never both change without checking
    // the other.
    <div className="flex flex-row items-center justify-between min-h-[36.5px] gap-x-[var(--space-lg)] mb-[calc(var(--space-2xl)_-_7.08px)]">
      <div className="flex items-center gap-[var(--space-md)] min-w-0">
        {/* max-[417px]:hidden on the JP span — bisected live against this
            row's own worst-case content (title + Clear ✕ both mounted):
            おすすめ wraps to two lines below 417px, which this row no
            longer permits (see the row's own comment above), so it's
            dropped instead. 417 (not 416) because max-[Npx]: compiles to
            "width < Npx" — the JP span's own single-line fit boundary is
            exactly 417px, so 417 is the smallest value that still hides
            it at 416px and below. */}
        <TitleWithSubtitle title="Recommendations" subtitle="おすすめ" subtitleClassName="max-[417px]:hidden" />
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

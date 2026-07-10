import type { LevelKey } from "@/lib/konomi/types";
import { ActionButton } from "./ActionButton";
import { CloseIcon } from "./icons";
import { IconButton } from "./IconButton";
import { ResultsFilterButton } from "./ResultsFilterButton";
import { TitleWithSubtitle } from "./TitleWithSubtitle";

interface ResultsHeaderProps {
  hasResults: boolean;
  onClearRecs: () => void;
  onLevelChange: (level: LevelKey) => void;
}

// Extracted from the retired PanelToggleHeader's Recommendations-active
// branch — Results is now the only surface, so this header is unconditional
// instead of tab-gated. Title/JP-subtitle classes match the app's own
// title-row rule exactly (leading-display on the title, leading-tight on
// the companion span), same as Mixer/MixerBar's own title row.
export function ResultsHeader({ hasResults, onClearRecs, onLevelChange }: ResultsHeaderProps) {
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
    // min-h-[30px] (was 36.5px, retuned when Clear ✕/Filter both dropped
    // to a shared 30px height — see ActionButton.tsx's own comment on its
    // sm size): the title's own line-height (22.36px) is still shorter
    // than either button's rendered height (30px now, not 36.5px), so
    // mounting Clear ✕ would otherwise grow the row and — with
    // items-center — visibly drop the title by half that delta. Pinning
    // the height directly avoids that regardless of hasResults. 30px is
    // Clear ✕'s and the Filter button's own shared, measured rendered
    // height — retune by hand if that ever changes.
    //
    // mb-[calc(var(--space-2xl)_-_3.82px)]: the *visual* gap from the
    // title's own text to the card row below, which is the one that has
    // to match card→mixer's 24px, not the raw margin value alone. Because
    // this row is items-center (required — see below) and min-h pins it to
    // 30px while the title's own text is only ~22.36px tall, centering
    // leaves ~3.82px of invisible slack *below* the text before this
    // margin even starts (the same slack sits above it too, harmless —
    // it's just breathing room under the masthead gap). Left as a flat
    // space-2xl, the text-to-card gap would visually read bigger than the
    // mixer's tight 24px. Subtracting the slack here means margin + slack
    // = 24 again, matching visually rather than just matching the token.
    // Not swapping to items-end instead (which would remove the slack at
    // its source): that would also un-center Clear ✕/Filter from the title
    // text (both already span the row's full 30px either way, so their own
    // alignment never moves — only the title's alignment is actually in
    // play here, and center is what keeps them vertically centered on the
    // title, a separate, confirmed-correct requirement this fix must not
    // undo). 3.82 = half of (30 − 22.36), both live-measured — not a fresh
    // guess, but also not expressible purely in existing tokens (the
    // title's exact rendered line-height isn't one), so it's recorded here
    // the same way this file already records 30 and 417.
    //
    // --header-row-height in globals.css (30px, a single flat value since
    // this row can't wrap anymore) is this row's own *content* height
    // only, read independently by the card-height clamp — that constant
    // and this margin must never both change without checking the other.
    <div className="flex flex-row items-center justify-between min-h-[30px] gap-x-[var(--space-lg)] mb-[calc(var(--space-2xl)_-_3.82px)]">
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
        )}
        <ResultsFilterButton onLevelChange={onLevelChange} />
      </div>
    </div>
  );
}

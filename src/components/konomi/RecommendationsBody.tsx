import { useRef } from "react";
import type { ResultEntry, TagInfo } from "@/lib/konomi/types";
import { ResultCard } from "./ResultCard";
import { ScrollFadeArea } from "./ScrollFadeArea";
import { useLevel, useSort } from "./tagPoolPrefs";

interface RecommendationsBodyProps {
  results: ResultEntry[];
  hasResults: boolean;
  selectedTags: string[];
  filledCount: number;
  minNum: number;
  recommendGen: number;
  locked: Record<string, boolean>;
  flipped: Record<string, boolean>;
  canSwap: boolean;
  onFlip: (title: string) => void;
  onToggleLock: (title: string) => void;
  onReplace: (title: string) => void;
  onChipToggle: (tag: string) => void;
  tagInfoByName: Map<string, TagInfo>;
  totalSeriesCount: number;
}

// Body-only — the section-level chrome (border/shadow/padding) and the
// title/resultsHint/Clear✕ header all moved out to
// TagPoolRecommendationsPanel and PanelToggleHeader respectively, once
// Recommendations became a tab sharing one card with Tag Pool instead of
// its own independent, unbordered section.
export function RecommendationsBody({
  results,
  hasResults,
  selectedTags,
  filledCount,
  minNum,
  recommendGen,
  locked,
  flipped,
  canSwap,
  onFlip,
  onToggleLock,
  onReplace,
  onChipToggle,
  tagInfoByName,
  totalSeriesCount,
}: RecommendationsBodyProps) {
  const level = useLevel();
  const sort = useSort();
  // ScrollFadeArea (horizontal orientation) now owns the scroll/fade/arrow
  // mechanics here — the same primitive the Tag Pool's section tab strip
  // uses (SectionTabStrip.tsx) — via getScrollStep/scrollResetKey/arrow*
  // props rather than a bespoke rowRef + scroll-edge-state implementation.
  // rowRef still exists, but now points only at this component's own
  // grid/carousel row (ScrollFadeArea's *children*, not its scroll
  // viewport), purely so getScrollStep below can measure a live card width
  // off it — ScrollFadeArea deliberately doesn't expose its own internal
  // scroll element to callers.
  const rowRef = useRef<HTMLDivElement>(null);
  // One card's current rendered width plus the row's own gap-xl — not a
  // fixed number, since card width steps down through 4 responsive tiers
  // (see ResultCard.tsx). Doesn't need to be pixel-exact: snap-mandatory
  // corrects any scrollBy amount to the nearest real snap point, so this
  // just needs to land closer to the next card than the current one, which
  // it reliably does at every tier.
  const getScrollStep = () => {
    const card = rowRef.current?.querySelector("article");
    const cardWidth = card?.getBoundingClientRect().width ?? 208;
    return cardWidth + 16; // mirrors --space-xl, the row's own gap-xl
  };

  return (
    // flow-root (a new block formatting context), not a plain fragment —
    // the carousel row below cancels its own shadow-clipping padding with a
    // negative margin (see that div's comment). Negative margins collapse
    // through any number of unbroken parent/child edges, so without a BFC
    // boundary right here, that -5px silently ate into this section's own
    // external mb-3xl in the parent instead of staying contained to the
    // padding it was meant to cancel. flow-root stops it at this component's
    // own edge, exactly where the compensation should end.
    <div className="flow-root">
      {!hasResults && (
        // !hasResults, not `empty` (!generated) — a RECOMMEND that fails
        // with an error (impossible-min/no-match) still sets `generated:
        // true` (see recommend() in useKonomi.ts), but leaves `results`
        // untouched. On a first-ever attempt (or right after Clear ✕),
        // `results` is already `[]`, so `empty` goes false the moment the
        // error is set while `hasResults` stays false too — with the
        // condition as `empty`, NEITHER this placeholder nor the results
        // grid below would render, collapsing the whole section down to
        // just its header. `!hasResults` covers both "never generated" and
        // "generated but errored with nothing to show," so the placeholder
        // (and the height it reserves) stays put until an actual result
        // set replaces it — no jarring collapse-then-jump when the user
        // fixes the error and hits RECOMMEND again.
        //
        // min-h-[var(--result-card-height)] (the same token ResultCard's
        // own height reads from, and the same one TagPoolBody's scroll area
        // now targets too — see that file) instead of a measured literal:
        // the empty state and the results grid must always be the exact
        // same height, or the page visibly jumps the instant results
        // replace this placeholder. flex/items-center/justify-center
        // centers the content within that now-taller box (previously this
        // relied on py-huge padding to both establish height and center
        // content at once — min-height needs a real centering mechanism
        // instead, since padding alone doesn't grow to fill leftover
        // min-height space).
        <div className="border-[length:var(--border-base)] border-dashed border-[var(--muted)] bg-[var(--surface)] min-h-[var(--result-card-height)] flex flex-col items-center justify-center gap-[var(--space-md)] px-[var(--space-2xl)] py-[var(--space-2xl)] text-center">
          <div className="font-display text-[length:var(--text-2xl)] text-[var(--muted)] uppercase">mix tags</div>
          <p className="font-mono text-[length:var(--text-base)] text-[var(--primary)] m-0">
            load 1–3 tags into the mixer then RECOMMEND
          </p>
        </div>
      )}

      {hasResults && (
        // Grid above 1152px (unchanged); below it, a single-row snap
        // carousel instead of the grid wrapping into multiple rows.
        // 1152px = 5×208px (DEFAULT_RESULT_COUNT × the grid's min column
        // width) + 4×16px (gap-xl between them) + 48px (the page's own
        // px-2xl margins) — the width where all 5 result cards stop
        // fitting in a single grid row. Confirmed live via 1px-step
        // bisection: 5 cards render on one row at exactly 1152px, wrap to
        // 2 rows at 1151px.
        //
        // An earlier version used 480px (the grid's own natural 1-column
        // breakpoint) instead — confirmed live to be wrong: the grid
        // already wraps to 2-3 rows well above 480px (only 2 of 5 cards
        // fit per row once width drops below ~1152px), so a carousel that
        // only kicked in below 480px left most of the resize range still
        // wrapping into multiple rows, defeating the actual goal (stay a
        // single row, keep the mixer co-visible without scrolling past a
        // tall stack). Tradeoff of the fix: this breakpoint is now coupled
        // to DEFAULT_RESULT_COUNT (config.ts) — re-derive it if that count
        // ever changes.
        //
        // ScrollFadeArea (orientation="horizontal") supplies the actual
        // overflow-x-auto viewport, snap, peek, wheel/press-hold, and
        // arrows now — see this component's own top-of-file comment. What
        // stays here, on the row itself (ScrollFadeArea's children): the
        // grid↔flex-nowrap breakpoint switch (ScrollFadeArea has no concept
        // of "static grid above N px," so that decision has to live in the
        // caller's own markup), and each ResultCard's own snap-start
        // (max-[1152px]:snap-start, in ResultCard.tsx) — snap points come
        // from the children, same as TagScrollArea's chips.
        <div className="-mr-[5px] -mb-[5px]">
          {/* ScrollFadeArea's scroll viewport is unconditionally
              overflow-x-auto/overflow-y-hidden now (not gated to
              max-[1152px] the way the old bespoke implementation was), so
              the elev-4 shadow-clipping risk this pr/pb-[5px] + -mr/-mb-[5px]
              pair fixes is no longer confined to the carousel breakpoint —
              a card flush against the grid's own right/bottom edge above
              1152px is just as exposed. Both halves of the fix are
              unconditional here for exactly that reason (see
              ScrollFadeArea.tsx's own overflow-x/-y comment for the root
              cause: setting only one axis non-visible silently coerces the
              other from `visible` to `auto`, clipping any box-shadow
              bleeding past that edge). */}
          <ScrollFadeArea
            orientation="horizontal"
            snap
            scrollPaddingStart="6%"
            scrollResetKey={recommendGen}
            getScrollStep={getScrollStep}
            fadeSize={0}
            arrowWidth={36}
            arrowShadow
            arrowInset="var(--space-md)"
          >
            <div ref={rowRef} className="grid grid-cols-[repeat(auto-fill,minmax(208px,1fr))] gap-[var(--space-xl)] pr-[5px] pb-[5px] max-[1152px]:flex max-[1152px]:flex-nowrap">
              {results.map((entry) => (
                <ResultCard
                  key={entry.series.title}
                  entry={entry}
                  selectedTags={selectedTags}
                  filledCount={filledCount}
                  minNum={minNum}
                  locked={Boolean(locked[entry.series.title])}
                  flipped={Boolean(flipped[entry.series.title])}
                  canSwap={canSwap}
                  onFlip={onFlip}
                  onToggleLock={onToggleLock}
                  onReplace={onReplace}
                  onChipToggle={onChipToggle}
                  tagInfoByName={tagInfoByName}
                  totalSeriesCount={totalSeriesCount}
                  level={level}
                  sort={sort}
                />
              ))}
            </div>
          </ScrollFadeArea>
        </div>
      )}
    </div>
  );
}

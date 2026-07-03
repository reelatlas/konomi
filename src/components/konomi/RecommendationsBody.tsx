import { useEffect, useRef, useState } from "react";
import type { ResultEntry, TagInfo } from "@/lib/konomi/types";
import { IconButton } from "./IconButton";
import { ResultCard } from "./ResultCard";
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
  const rowRef = useRef<HTMLDivElement>(null);
  // Resets the carousel back to the first card on a fresh RECOMMEND batch
  // (recommendGen only bumps on that success path — see useKonomi.ts), but
  // deliberately does NOT reset on a single-card swap, which produces a new
  // `results` array too but leaves recommendGen untouched — the user is
  // very likely still looking at the card they just swapped. Harmless
  // no-op above the carousel breakpoint (nothing to scroll there) and when
  // results is empty.
  useEffect(() => {
    rowRef.current?.scrollTo({ left: 0 });
  }, [recommendGen]);

  // Arrow affordance for anyone without a trackpad/horizontal-scroll mouse
  // wheel — same idea as ScrollFadeArea's hover-triggered ▲/▼ buttons
  // (mount only while there's somewhere left to scroll, reveal on hover of
  // the row, not a permanent fixture), sized up to match this row's own
  // 30px icon buttons rather than ScrollFadeArea's tiny 18×16px (tuned for
  // a much shorter vertical scroll area — these needed to read clearly
  // against a 421px-tall card, not a few lines of chips). Not reused as
  // the ScrollFadeArea component itself: that component's mechanics
  // (ResizeObserver'd inner content div, top/bottom gradient placement,
  // topInset for sticky headers) are all specific to a fixed-height
  // vertical viewport and don't transfer to a horizontal, always-scrolling
  // carousel — same underlying *idea*, different, simpler implementation.
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);
  const updateScrollEdges = () => {
    const el = rowRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 0);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  };
  useEffect(() => {
    updateScrollEdges();
  }, [results]);
  const scrollByCard = (direction: 1 | -1) => {
    const el = rowRef.current;
    const card = el?.querySelector("article");
    if (!el || !card) return;
    // Doesn't need to be pixel-exact — snap-mandatory corrects any
    // scrollBy amount to the nearest real snap point, so "one card's
    // current rendered width plus the gap" just needs to land closer to
    // the next card than the current one, which it reliably does across
    // every width tier (card width isn't a fixed px — it steps down
    // through breakpoints — so it's measured live here rather than
    // hardcoded per tier).
    const cardWidth = card.getBoundingClientRect().width;
    const gap = 16; // mirrors --space-xl, the row's own gap-xl
    el.scrollBy({ left: direction * (cardWidth + gap), behavior: "smooth" });
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
        // Plain native overflow-x-auto + snap-x — no custom gesture/
        // pointer handling, same underlying mechanism as TagScrollArea's
        // overflow-y-auto (draggable + clickable chips coexist with native
        // scroll there for free; this is the same thing on the other
        // axis). Scrollbar hidden to read as a carousel, not a scroll pane.
        //
        // scroll-padding-left (6% of the row's own width) is what gives a
        // "previous card" peek on the left without switching to
        // snap-center: each ResultCard still uses snap-start, but
        // scroll-padding shifts *where* "start" lands relative to the
        // scrollport — a start-aligned card comes to rest 6% in from the
        // true left edge instead of flush against it, leaving exactly that
        // much of the previous card visible. The very first card is
        // unaffected: there's nothing before it to scroll to, so the
        // browser clamps scrollLeft at 0 and it sits flush-left on its
        // own — no special-casing needed for "first card, no previous."
        // relative + group/reveal wraps the scrollable row (not applied
        // to the row itself) so the two arrow buttons — positioned
        // absolute, as siblings of the row rather than children of it —
        // stay fixed in place as the row scrolls beneath them, instead of
        // scrolling away with the cards. group/reveal (not a carousel-
        // specific name) is the same shared hover-reveal group name
        // ScrollFadeArea's arrows use — see IconButton's own doc comment
        // for why the group name had to be unified rather than parameterized.
        <div className="relative group/reveal max-[1152px]:-mr-[5px] max-[1152px]:-mb-[5px]">
          {/* Setting overflow-x without overflow-y doesn't leave overflow-y
              at its default `visible` — CSS computes it as `auto` too
              whenever exactly one axis is non-visible (see the CSS Overflow
              spec's "overflow-x/-y interaction" rule). That silently clips
              each card's elev-4 shadow (5px 5px 0, bottom-right only, no
              blur) wherever it bleeds past this row's own box. pr/pb-[5px]
              here (matching the shadow's offset exactly, not a guess) gives
              the now-auto overflow room to paint the shadow instead of
              cutting it off; the wrapper's matching -mr/-mb-[5px] cancels
              the added size back out so nothing below/right of the row
              shifts. */}
          <div
            ref={rowRef}
            onScroll={updateScrollEdges}
            className="grid grid-cols-[repeat(auto-fill,minmax(208px,1fr))] gap-[var(--space-xl)] max-[1152px]:flex max-[1152px]:overflow-x-auto max-[1152px]:pr-[5px] max-[1152px]:pb-[5px] max-[1152px]:snap-x max-[1152px]:snap-mandatory max-[1152px]:[scroll-padding-left:6%] max-[1152px]:[scrollbar-width:none] max-[1152px]:[&::-webkit-scrollbar]:hidden"
          >
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

          {/* hidden by default (grid mode, no scrolling); in carousel mode,
              mounted only while there's actually somewhere to scroll to in
              that direction (mirrors ScrollFadeArea's hasOverflow gating),
              and visible only on hover of the row via IconButton's
              `revealOnHover` (the same `group/reveal` mechanism
              ScrollFadeArea's own arrows use) — a permanent pair of arrows
              sitting on top of the peek affordance would be redundant
              chrome most of the time. z-overlay + shadow (not
              ScrollFadeArea's flatter, shadowless treatment) since these
              sit over arbitrary cover art, not a flat surface color. */}
          {!atStart && (
            <IconButton
              width={36}
              shape="circle"
              border="hair"
              shadow
              revealOnHover
              display="hidden max-[1152px]:flex"
              aria-label="Scroll to previous result"
              onClick={() => scrollByCard(-1)}
              className="absolute top-1/2 -translate-y-1/2 left-[var(--space-md)] text-[length:var(--text-sm)] leading-none z-[var(--z-overlay)]"
            >
              ◀
            </IconButton>
          )}
          {!atEnd && (
            <IconButton
              width={36}
              shape="circle"
              border="hair"
              shadow
              revealOnHover
              display="hidden max-[1152px]:flex"
              aria-label="Scroll to next result"
              onClick={() => scrollByCard(1)}
              className="absolute top-1/2 -translate-y-1/2 right-[var(--space-md)] text-[length:var(--text-sm)] leading-none z-[var(--z-overlay)]"
            >
              ▶
            </IconButton>
          )}
        </div>
      )}
    </div>
  );
}

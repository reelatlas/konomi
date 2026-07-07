import { useRef, useState } from "react";
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
  // Which grid position just had its card swapped, so the brand-new
  // ResultCard instance that mounts there can seed its own hoveredIcon
  // state to "swap" (see ResultCard's own startWithSwapHint comment) —
  // confirmed live as a real bug otherwise: ResultCard keys each card by
  // series.title (see the map below), and swap replaces that title, so
  // React tears down the old instance and mounts a brand new one for the
  // new series — resetting ResultCard's own local hoveredIcon state along
  // with it, unlike lock (which never changes the title, so the same
  // instance and its state persist across a toggle). Indexed by grid
  // position, not title — the whole point is surviving a title change at
  // the same slot, which a title-keyed tracker couldn't do by definition.
  const [justSwappedIndex, setJustSwappedIndex] = useState<number | null>(null);
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
        // border-dashed clips its left/right edges on iOS WebKit (all iOS
        // browsers) — cosmetic, empty-state only. Accepted. Do not "fix"
        // by swapping to outline-dashed (also clips) or SVG stroke
        // (corners slide on resize). See DESIGN_SYSTEM.md.
        // bg-[var(--slot-empty)], not --surface — matches TagSlot's own
        // empty-state background exactly, so both of the app's "zero
        // state" surfaces (an empty mixer slot, no results yet) read as
        // one consistent color rather than two similar-but-different
        // near-whites. (--slot-empty and --disabled-bg are already the
        // same value in every theme by design — see tokens.ts/themes.ts —
        // so this also already matches RECOMMEND's own disabled-state
        // background for free.)
        <div className="border-[length:var(--border-base)] border-dashed border-[var(--muted)] bg-[var(--slot-empty)] min-h-[var(--result-card-height)] flex flex-col items-center justify-center gap-[var(--space-md)] px-[var(--space-2xl)] py-[var(--space-2xl)] text-center">
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
        // max-[1152px]:-ml-[22px] / -mr-[22px] below: a measured constant,
        // not an arbitrary round number — 22 = the trailing/leading
        // spacer's own w-[6px] (both further down, near their
        // results.map) + this row's gap-[var(--space-xl)] (16px), which
        // also applies before/after each spacer the same as between every
        // card. If gap-xl's value changes, or either spacer's own width
        // changes, these two margins must be re-derived to match (6+16
        // again, with whatever the new numbers are) or the corresponding
        // edge card will drift off the content column's edge again — same
        // "retune by hand if this changes" coupling as MIXER_BAR_SPACER/
        // EDIT_MODE_FIXED_ROWS_HEIGHT elsewhere in this app, and for the
        // same reason those stayed comments instead of a shared JS
        // constant: Tailwind's arbitrary-value classes need to be static
        // source text for its scanner to generate CSS for them at all — a
        // computed `-ml-[${n}px]` string would silently produce no rule,
        // not a wrong one, which is a worse failure mode than a comment
        // someone has to remember to update.
        <div className="-mt-[40px] -mr-[5px] -mb-[40px] max-[1152px]:-ml-[22px] max-[1152px]:-mr-[22px]">
          {/* ScrollFadeArea's scroll viewport is unconditionally
              overflow-x-auto/overflow-y-hidden now (not gated to
              max-[1152px] the way the old bespoke implementation was), so
              the elev-4 shadow-clipping risk the pr/pb + -mr/-mb pair below
              fixes is no longer confined to the carousel breakpoint — a
              card flush against the grid's own right/bottom edge above
              1152px is just as exposed.

              pt/pb are 40px, not the original 5px: a flip in progress
              (ResultCard's rotateY, [transform:rotateY]) needs far more
              room than the static shadow does. Confirmed live via
              Animation.setPlaybackRate(0.02)/Animation.seekAnimations +
              getBoundingClientRect on the rotating faces mid-flip: the
              rotation's real bulge is mostly *vertical* (top/bottom) — up
              to ~33.5px above and ~28.5px below the card's own resting box
              at the widest measured tier (the 85%-width mobile carousel
              card; desktop's 22%-width grid cards bulge a bit less,
              ~27/22px). 40px covers both measured maxes with a small
              buffer, and — since 40 > 5 — also covers the original shadow
              bleed on its own, so pb doesn't need to account for both
              separately.

              Padding this side of ScrollFadeArea's own real overflow-hidden
              clip (scrollRef, inside ScrollFadeArea.tsx) reserves 40px of
              *clipped-but-unclipped-relative-to-content* space above/below
              the grid for the flip to bleed into. The matching -mt/-mb on
              this wrapper — outside ScrollFadeArea's clip boundary
              entirely — cancels that padding back out at rest: it pulls
              this whole wrapper (clip boundary included) up/in by the same
              40px the grid's own padding pushed its content down/in by, so
              the *visible* card position and height are unchanged. Same
              net-zero trick the original 5px pair already used, just
              extended to the axis (vertical) the flip actually needs.
              Confirmed live: first-card top, last-card bottom, and the
              gaps to the header above and the "+ Tag Pool" affordance
              below are byte-identical before and after this change, at
              both a desktop grid width and the mobile carousel's tightest
              tier — the padding is genuinely inert at rest, not merely
              small. flow-root on this component's own root div (above)
              is what makes -mt safe here the same way it already made -mb
              safe: without that BFC boundary, a negative *top* margin
              collapses through parent/child edges just as readily as a
              negative bottom one, and would have eaten into
              ResultsHeader's own spacing above this row instead of
              staying contained to the padding it's meant to cancel.

              Below 1152px, both the first and last card get a small real
              spacer *inside* the row instead of more padding on this same
              grid — see those two divs' own comments for why padding can't
              do this job on the horizontal axis the way pt/pb does
              vertically. Both need a matching margin on THIS wrapper
              (max-[1152px]:-ml-[22px] / -mr-[22px]) for the same net-zero
              reason as -mt/-mb above, just aimed at a different problem: a
              plain visible gap after the *visual* card (before the true
              scroll edge) reads as an unintentional dead zone once you
              scroll all the way over — confirmed live, an earlier version
              without this margin left the last card sitting 22px short of
              the content column's own right edge, an obvious "indent" that
              didn't match the grid tier's flush alignment. Pulling this
              wrapper (and so ScrollFadeArea's own scroll container) 22px
              wider on BOTH sides pushes each spacer's real, reachable
              buffer out past the content column's own edges — into the
              page's own gutter, where it's invisible margin either way —
              while the actual first/last *card* renders exactly flush with
              that edge, matching the grid tier's look. Confirmed live at
              multiple carousel-tier widths: card width, left edge, and
              right edge all landed within a fraction of a px of the
              content column's own edges, both at rest and scrolled to the
              true end. (An even earlier version added only -mr, sized to
              the spacer's raw width with no thought for the row's own
              gap-xl also contributing — that one really was wrong, and
              genuinely widened the visible row itself rather than just
              relocating the spacer into the gutter; the difference is
              accounting for the *total* footprint, gap included, not just
              the spacer's own declared width.) */}
          <ScrollFadeArea
            orientation="horizontal"
            snap
            scrollPaddingStart="6%"
            scrollResetKey={recommendGen}
            getScrollStep={getScrollStep}
            fadeSize={0}
            arrowWidth={36}
            arrowHeight={36}
            arrowShadow
            arrowInset="var(--space-md)"
          >
            {/* This grid keeps its own pointer-events-none (still real,
                still needed — the pt/pb-[40px] pair below is genuine, empty
                layout space, not just a visual illusion, and this grid still
                geometrically occupies that 40px above/below the cards).
                ScrollFadeArea's own three structural wrappers
                (root/scrollRef/contentRef) do NOT get pointer-events-none
                here anymore, though — disableWrapperPointerEvents was
                removed from the prop above. It fixed a real bug (Clear ✕
                getting its lower ~24px silently swallowed by this same
                invisible padding, confirmed live via elementFromPoint) but
                did so by making scrollRef itself pointer-events-none — and
                scrollRef is this carousel's actual overflow-x-auto viewport,
                the one native touch-scroll-gesture-chaining needs to find.
                Confirmed live (mobile, real device): with that in place, a
                horizontal swipe starting anywhere on a card's tag area
                failed to reach the carousel whenever the tag area itself
                wasn't an active/overflowing scroll container — pointer-
                events-none disqualified scrollRef from gesture-chaining
                candidacy entirely, not just from click hit-testing.
                Re-scoped instead of reverted outright: Clear ✕ now wins its
                own hit-test via paint order (relative z-[var(--z-raised)],
                see ResultsHeader.tsx) rather than via scrollRef being
                excluded from hit-testing altogether — so scrollRef (and
                root/contentRef) are back to the default pointer-events:auto,
                and the carousel can receive the gesture regardless of
                whether a card's tag area happens to be active. This grid's
                own pointer-events-none is untouched by that change (it's a
                separate, still-valid concern — its own invisible padding
                could still swallow clicks meant for content behind/below
                the carousel elsewhere, e.g. below the last row); each
                card's own pointer-events-auto (ResultCard.tsx) and every
                IconButton's own unconditional pointer-events-auto
                (IconButton.tsx, covers the arrow buttons here) still opt the
                real interactive content back in regardless. */}
            <div
              ref={rowRef}
              className="grid grid-cols-[repeat(auto-fill,minmax(208px,1fr))] gap-[var(--space-xl)] pt-[40px] pr-[5px] pb-[40px] max-[1152px]:flex max-[1152px]:flex-nowrap pointer-events-none"
            >
              {/* Leading spacer, carousel tier only (hidden above 1152px,
                  same reasoning as the trailing one below: display:none
                  removes it from the grid entirely, so it's never a 6th
                  grid cell). Guards the first card's left edge specifically
                  during the *reverse* flip (back face rotating to show the
                  front again) — confirmed live this is the one direction
                  that clips: a forward flip (front→back) never showed any
                  left excess at any width, but the reverse animation's
                  second half peaked at ~2.4px of real excess past the
                  scroll container's true left edge (measured via
                  Animation.seekAnimations at 450px width, a single-card
                  carousel tier).

                  w-[6px] (space-sm), plus this row's own gap-xl (16px)
                  before it — 22px total, comfortably past the ~2.4px
                  measured bulge. This 6+16=22 pairs with the outer
                  wrapper's own max-[1152px]:-ml-[22px] (this row's
                  top-of-block comment) — change this width or the row's
                  gap-xl and that margin needs to move to match, or this
                  spacer's buffer stops landing invisibly in the page's own
                  gutter and starts showing as a real indent again. Not w-0:
                  a first pass used w-0 here (relying on the gap alone) and,
                  symmetrically with the trailing
                  spacer (see its own comment), a *separate* first pass tried
                  netting an even smaller total via a negative margin eating
                  into that gap. Both were reverted for the same reason
                  documented there: a zero-width flex item at the overflowing
                  edge of a flex-nowrap row doesn't reliably get its
                  preceding/following gap counted toward scrollWidth, and
                  negative margins compound that further — confirmed live via
                  the trailing spacer's case (this one doesn't depend on
                  scrollWidth math the same way, since it's about the
                  *resting*, not reachable-via-scroll, position, but kept the
                  same real-width fix for consistency once the trailing
                  side's fix was known-good).

                  This wrapper's own max-[1152px]:-ml-[22px] (below) cancels
                  that 22px back out at rest, relocating it into the page's
                  own left gutter instead of a visible gap before card 1 —
                  see this row's top-of-block comment for why the trailing
                  spacer needs the equivalent -mr treatment too, even though
                  it's only ever visible once scrolled to the end.

                  [scroll-snap-align:start] on this spacer (not just
                  flex-none) is load-bearing, not decoration: a first
                  attempt gave the spacer real width with no snap-align of
                  its own, and that alone made scroll-snap treat resting
                  scrollLeft 0 as "unaligned" — confirmed live the browser
                  force-corrected scrollLeft to 17 on load and kept
                  snapping straight back to 17 even after an explicit reset
                  to 0, because shifting the first *card's* own offset away
                  from 0 meant 0 no longer matched any card's snap-start
                  math. Making the spacer itself a valid snap-start target
                  means scrollLeft 0 (spacer visible, card 1 right behind
                  it) is a legitimate resting position again — confirmed
                  live this keeps scrollLeft at 0 at rest. */}
              <div aria-hidden className="hidden max-[1152px]:block max-[1152px]:w-[6px] flex-none [scroll-snap-align:start]" />
              {results.map((entry, index) => (
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
                  // Notes which grid position initiated the swap (see
                  // justSwappedIndex's own comment above) before actually
                  // performing it, so the brand-new instance that mounts
                  // here already knows to seed its hint on its very first
                  // render.
                  onReplace={(title) => {
                    setJustSwappedIndex(index);
                    onReplace(title);
                  }}
                  startWithSwapHint={justSwappedIndex === index}
                  onChipToggle={onChipToggle}
                  tagInfoByName={tagInfoByName}
                  totalSeriesCount={totalSeriesCount}
                  level={level}
                  sort={sort}
                />
              ))}
              {/* Trailing spacer, carousel tier only (hidden — display:none
                  removes it from the grid entirely above 1152px, so it
                  never becomes a 6th grid cell or perturbs that tier's
                  1152px-tuned column math). Guards the last card's right
                  edge — its elev-4 shadow (5px) and any right-side flip
                  bulge. A real DOM child, not padding on the row above,
                  because a flex-nowrap row whose children overflow their
                  own container renders the *container's own box* at its
                  available (viewport) width, not its overflowing children's
                  true combined width — confirmed live (getBoundingClientRect
                  on the grid itself reported exactly clientWidth, not the
                  wider content extent), so pr *padding on that box* sits at
                  the edge of a box narrower than the real scrollable
                  content, nowhere near the actual last card. Also confirmed
                  live that scroll-padding-right doesn't help either: it only
                  adjusts where a *snap-end/center*-aligned target settles,
                  and every card here is snap-*start* (ResultCard.tsx), so
                  padding on the trailing edge never enters that alignment
                  calculation at all — the row kept settling with ~0 buffer
                  at the true scroll-max regardless. A real flex child, by
                  contrast, IS part of the overflowing content, so it
                  reliably sits directly next to the last card, and — unlike
                  the leading spacer above — doesn't shift any existing
                  card's own offset, so it doesn't need scroll-snap-align:
                  resting at the true scroll-max is always a valid mandatory-
                  snap position with nothing further to snap to, confirmed
                  live scrollLeft settles there cleanly.

                  w-[6px] (space-sm), not w-0 or a negative margin — both
                  tried first, both reverted. This 6+16(gap)=22 pairs with
                  the outer wrapper's own max-[1152px]:-mr-[22px] (this
                  row's top-of-block comment) — change this width or the
                  row's gap-xl and that margin needs to move to match, same
                  coupling as the leading spacer's own note above. This
                  row's own gap-xl (16px) applies before this spacer too, so
                  the temptation is to
                  let the gap alone be the buffer (w-0) or shrink it further
                  with a negative margin eating into that gap for something
                  closer to the exact 5px the shadow needs. Confirmed live
                  that *either* one breaks scrollWidth accounting for a
                  zero-width trailing flex item in an overflowing
                  flex-nowrap row: getBoundingClientRect on the spacer showed
                  it rendering past the scroll container's own right edge
                  even at scrollLeft set to the true max (scrollWidth −
                  clientWidth) — the browser silently doesn't count a
                  zero-width last item's own preceding gap toward
                  scrollWidth, so the "reachable" buffer this spacer exists
                  to create was never actually reachable. A real, non-zero
                  width (6px here) is what makes the browser count it
                  correctly — confirmed live, scrollWidth then matches the
                  spacer's true rendered extent and the last card's shadow
                  renders fully unclipped once scrolled to the end. Total
                  reachable trailing space is 16 (gap) + 6 = 22px — see the
                  outer wrapper's own max-[1152px]:-mr-[22px] (this row's
                  top-of-block comment) for why that 22px lands in the
                  page's own gutter rather than as a visible gap after this
                  spacer's own card. */}
              <div aria-hidden className="hidden max-[1152px]:block max-[1152px]:w-[6px] flex-none" />
            </div>
          </ScrollFadeArea>
        </div>
      )}
    </div>
  );
}

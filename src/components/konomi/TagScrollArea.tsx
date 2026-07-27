import { ScrollFadeArea } from "./ScrollFadeArea";
import { TagChip } from "./TagChip";

interface TagScrollAreaProps {
  tags: { id: string; name: string }[];
  selectedTagIds: string[];
  onChipToggle: (tag: string) => void;
  // Forwarded straight to ScrollFadeArea's own surfaceColor (the fade
  // gradient) — defaults to that component's own default (--surface),
  // which is what every caller except ResultCard wants. ResultCard
  // overrides this to match its own tag-area background (a translucent
  // veil over a blurred cover reflection, see that file's own comment) so
  // the fade blends into it instead of showing as a mismatched opaque
  // rectangle at the scroll edges.
  surfaceColor?: string;
  // Forwarded straight to ScrollFadeArea's own arrowBackgroundColor —
  // separate from surfaceColor above because ResultCard's translucent
  // surfaceColor made the arrow buttons themselves hard to see against the
  // image behind them (confirmed live as a real regression); ResultCard
  // passes an opaque color here specifically so the arrows stay legible
  // while the fade still blends into the veil.
  arrowBackgroundColor?: string;
  // Forwarded straight to ScrollFadeArea's own fadeSize — defaults to 4
  // (this component's original value, correct for the flat-color
  // fallback). ResultCard passes 0 when its translucent veil is active:
  // a translucent surfaceColor fading *on top of* the same translucent
  // veil already covering the whole area compounds into a visibly
  // stronger tint right at the scroll edges than the rest of the area —
  // confirmed live as a real, distracting seam, not a hypothetical. The
  // peek (a partially-visible next row) already carries the "there's more
  // to scroll" signal on its own here, so losing this 4px depth cue only
  // in the veiled case isn't a regression.
  fadeSize?: number;
}

// Row geometry: 36px step (30px chip + 6px gap — the dense-tier chip box,
// --control-h-sm, sizing unification 2b), 3 rows fully visible by
// design at this component's own natural (unshrunk) height, one row
// peeking at each edge. ROW_STEP_PX and VISIBLE_ROWS are the two real
// inputs everything else below is derived from, including scrollStep
// (VISIBLE_ROWS * ROW_STEP_PX, passed to ScrollFadeArea below): that stays
// fixed at "3 rows" even once TAG_AREA_HEIGHT shrinks and fewer rows are
// actually visible at once, so a single arrow click can jump further than
// one screen's worth of content at the smallest card heights. Accepted,
// not fixed: a bigger jump on an already-small card is a minor rough edge,
// not a broken interaction, and continuous (held) scrolling is unaffected
// either way.
const ROW_STEP_PX = 36;
const VISIBLE_ROWS = 3;
// scrollPaddingTop's own reservation, at the top. Only 8px of this 14px
// actually shows as a visible "previous row" peek in the steady (mid-list)
// state: the remaining 6px is the row-to-row gap itself (empty space, no
// content).
const TOP_RESERVE_PX = 14;
// TAG_AREA_HEIGHT was a deliberate compromise even before it became
// variable, not a value that gives an identical peek in every scroll
// position: that turns out to be impossible with this mechanism. At the
// very first row, reaching it wants scrollTop = 0 - TOP_RESERVE_PX
// (negative), which the browser clamps to 0, so row 0's reservation goes
// entirely unused there, and that unused 14px doesn't vanish, it becomes
// 14px of *extra* room at the bottom instead. That means the bottom peek
// at row 0 is mathematically always exactly TOP_RESERVE_PX bigger than the
// bottom peek anywhere else in the list, for any single fixed height:
// there's no height where both match.
//
// A content padding-top matching TOP_RESERVE_PX was tried first, to make
// row 0 consume its reservation like every other row instead of being a
// special case: confirmed live that it does fix the peek-size mismatch,
// but at the cost of a real regression: a permanently empty 14px gap
// between whatever precedes this component and the first chip row,
// visible even when there's nothing to peek yet, which read as broken
// spacing rather than a peek. Reverted in favor of this simpler
// compromise: pick one height that keeps *both* the row-0 case and every
// other position showing a genuinely partial (non-zero, non-full) peek,
// rather than eliminating the mismatch outright. 130px (this component's
// own natural, unshrunk height: TOP_RESERVE 14 + 3×36 + 8 bottom peek —
// was 121 in the 27px-chip era) gives an 8px peek at every position after
// row 0 (matching the top peek's own 8px) and a 22px peek at row 0
// specifically: bigger, but still visibly short of the full 30px chip.
//
// That 130px math is exact only at ResultCard's own tallest card height
// (--result-card-height's 445px ceiling, globals.css). TAG_AREA_HEIGHT now
// reads --result-card-tag-scroll-height instead of a flat 121px, which
// shrinks this area first as the card itself shrinks, down to a floor that
// still guarantees two full rows plus the usual top peek (see that token's
// own comment in globals.css for the exact derivation). Below 130px the
// specific 8px/22px peek amounts above stop being exact, since they were
// tuned against that one fixed number, but the underlying scroll/snap
// mechanics, and the one-row floor, keep working at every size in between.
const TAG_AREA_HEIGHT = "h-[var(--result-card-tag-scroll-height)]";

export function TagScrollArea({ tags, selectedTagIds, onChipToggle, surfaceColor, arrowBackgroundColor, fadeSize = 4 }: TagScrollAreaProps) {
  return (
    // scrollStep = exactly VISIBLE_ROWS worth of rows (108px), not the
    // viewport's own pixel height. Those aren't the same number — the
    // viewport also includes both peek reservations — and a first attempt
    // that used the raw viewport height turned out to reliably round to
    // the *wrong* neighboring snap point: snap points sit at 36k − 14, an
    // irregular sequence, and a scrollStep matching the viewport height
    // happened to land closer to the point 4 rows ahead than 3 rows ahead,
    // so a click consistently advanced one row further than intended.
    // VISIBLE_ROWS × ROW_STEP_PX sidesteps the whole rounding question by
    // aiming directly at "3 rows over," which is the actual quantity being
    // asked for ("the row that was peeking becomes the new fully-visible
    // one") — confirmed live in both directions, including from the very
    // bottom of a short card, where a single click up correctly recognized
    // less than a full "page" remained above and landed exactly at the
    // top.
    //
    // scrollPaddingStart mirrors the results carousel's scroll-padding-left,
    // just the vertical axis: a snapped row settles TOP_RESERVE_PX in from
    // the true top instead of flush against it. fadeSize shrunk from the
    // default 18px to 4px —
    // confirmed live that the full gradient was fading out exactly the
    // peeking row it was supposed to preview, working against the peek
    // instead of reinforcing it. A small amount is kept, not removed
    // outright, purely for the depth cue at the edge, not as the "there's
    // more" signal — the peek carries that now.
    //
    // continuousScrollSpeed: 6px/frame (ScrollFadeArea's own default, what
    // the Tag Pool uses) felt roughly 4x too fast here, then 1.5px/frame
    // still felt roughly 6x too fast on top of that, landing on 0.25px/frame
    // (6 → 1.5 → 0.25) — but that measurement was taken before
    // ScrollFadeArea's scrollBy accumulator fix (see that component), while a
    // scroll-snap-mandatory jump artifact was masquerading as the actual
    // continuous-scroll motion. With that artifact gone and real sub-pixel
    // accumulation in place, 0.25 read as roughly 1.5x too slow (→ 0.375),
    // then still roughly 2.5x too slow on top of that (→ 0.9375), then a bit
    // more (→ 1.25) — all confirmed live against this specific, much smaller
    // scroll area — settling on 1.5 as the final rate
    // (0.25 → 0.375 → 0.9375 → 1.25 → 1.5).
    <ScrollFadeArea
      height={TAG_AREA_HEIGHT}
      // "reveal-nested", not ScrollFadeArea's own "reveal" default: this
      // instance is nested inside the results carousel's own ScrollFadeArea
      // (RecommendationsBody), which also uses hover-reveal arrows under
      // the same default name. Sharing that name meant hovering anywhere
      // in the outer carousel — an ancestor of every card — satisfied
      // *every* nested card's own group-hover condition simultaneously
      // (confirmed live as a real bug: hovering a card's title revealed
      // every card's tag-scroll arrows at once, not just that card's own).
      // See RevealGroup's comment in IconButton.tsx for the full mechanism.
      groupName="reveal-nested"
      scrollStep={VISIBLE_ROWS * ROW_STEP_PX}
      snap
      scrollPaddingStart={TOP_RESERVE_PX}
      fadeSize={fadeSize}
      continuousScrollSpeed={1.5}
      surfaceColor={surfaceColor}
      arrowBackgroundColor={arrowBackgroundColor}
      // Fixed at 2px, not threaded up as a prop like fadeSize/surfaceColor
      // above — this is a plain visual soft-edge on the chips themselves
      // (see ScrollFadeArea's own comment on edgeMaskSize), and every
      // caller of this component wants the same small dissolve regardless
      // of whatever background happens to be behind it, unlike
      // fadeSize/surfaceColor which genuinely differ per background
      // (ResultCard's reflection vs. this component's other, unstyled
      // callers, if any are ever added).
      edgeMaskSize={2}
    >
      {/* [&_button]:snap-start (not scroll-snap-align added to TagChip
          itself): every chip in a row shares that row's vertical position,
          so giving every chip its own snap point still resolves to one
          snap point per row — without TagChip needing to know anything
          about scroll-snap, which it shouldn't, since it's also used
          un-snapped in the Tag Pool. This targets it via a descendant
          selector on this wrapping div instead, which only this caller
          opts into. */}
      <div className="flex flex-wrap content-start gap-[var(--space-sm)] [&_button]:snap-start">
        {tags.map((tag) => (
          <TagChip key={tag.id} id={tag.id} name={tag.name} active={selectedTagIds.includes(tag.id)} onToggle={onChipToggle} />
        ))}
      </div>
    </ScrollFadeArea>
  );
}

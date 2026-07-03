import { ScrollFadeArea } from "./ScrollFadeArea";
import { TagChip } from "./TagChip";

interface TagScrollAreaProps {
  tags: string[];
  selectedTags: string[];
  onChipToggle: (tag: string) => void;
}

// Row geometry: 33px step (27px chip + 6px gap), 3 rows fully visible by
// design, one row peeking at each edge. ROW_STEP_PX and VISIBLE_ROWS are
// the two real inputs everything else below is derived from.
const ROW_STEP_PX = 33;
const VISIBLE_ROWS = 3;
// scrollPaddingTop's own reservation, at the top. Only 8px of this 14px
// actually shows as a visible "previous row" peek in the steady (mid-list)
// state — the remaining 6px is the row-to-row gap itself (empty space, no
// content).
const TOP_RESERVE_PX = 14;
// TAG_AREA_HEIGHT_PX is a deliberate compromise, not a value that gives an
// identical peek in every scroll position — that turns out to be
// impossible with this mechanism. At the very first row, reaching it wants
// scrollTop = 0 − TOP_RESERVE_PX (negative), which the browser clamps to
// 0 — so row 0's reservation goes entirely unused there, and that unused
// 14px doesn't vanish, it becomes 14px of *extra* room at the bottom
// instead. That means the bottom peek at row 0 is mathematically always
// exactly TOP_RESERVE_PX bigger than the bottom peek anywhere else in the
// list, for any single fixed height — there's no height where both match.
//
// A content padding-top matching TOP_RESERVE_PX was tried first, to make
// row 0 consume its reservation like every other row instead of being a
// special case — confirmed live that it does fix the peek-size mismatch,
// but at the cost of a real regression: a permanently empty 14px gap
// between whatever precedes this component and the first chip row,
// visible even when there's nothing to peek yet, which read as broken
// spacing rather than a peek. Reverted in favor of this simpler
// compromise: pick one height that keeps *both* the row-0 case and every
// other position showing a genuinely partial (non-zero, non-full) peek,
// rather than eliminating the mismatch outright. 121px gives an 8px peek
// at every position after row 0 (matching the top peek's own 8px) and a
// 22px peek at row 0 specifically — bigger, but still visibly short of
// the full 27px row, confirmed live.
const TAG_AREA_HEIGHT = "h-[121px]";

export function TagScrollArea({ tags, selectedTags, onChipToggle }: TagScrollAreaProps) {
  return (
    // scrollStep = exactly VISIBLE_ROWS worth of rows (99px), not the
    // viewport's own pixel height. Those aren't the same number — the
    // viewport also includes both peek reservations — and a first attempt
    // that used the raw viewport height turned out to reliably round to
    // the *wrong* neighboring snap point: snap points sit at 33k − 14, an
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
    // scrollPaddingTop mirrors the results carousel's scroll-padding-left:
    // a snapped row settles TOP_RESERVE_PX in from the true top instead of
    // flush against it. fadeSize shrunk from the default 18px to 4px —
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
      scrollStep={VISIBLE_ROWS * ROW_STEP_PX}
      snap
      scrollPaddingTop={TOP_RESERVE_PX}
      fadeSize={4}
      continuousScrollSpeed={1.5}
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
          <TagChip key={tag} name={tag} size="small" active={selectedTags.includes(tag)} onToggle={onChipToggle} />
        ))}
      </div>
    </ScrollFadeArea>
  );
}

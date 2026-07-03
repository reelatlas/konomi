import { ScrollFadeArea } from "./ScrollFadeArea";
import { TagChip } from "./TagChip";

interface TagScrollAreaProps {
  tags: string[];
  selectedTags: string[];
  onChipToggle: (tag: string) => void;
}

// 3 full rows of small tag chips (33px row step: 27px chip + 6px gap,
// measured directly against the live component) plus a ~13px partial peek
// of a 4th row — the same "show a sliver of the next thing" affordance as
// the results carousel, adapted to a vertical, row-snapped context instead
// of horizontal cards. Growing this by 15px (97px → 112px) also means
// --result-card-height (globals.css) had to grow by the same 15px, since
// ResultCard's overall height and this inner area aren't independently
// sized — see that token's own comment for why the two must move together.
const TAG_AREA_HEIGHT = "h-[112px]";

export function TagScrollArea({ tags, selectedTags, onChipToggle }: TagScrollAreaProps) {
  return (
    // scrollPaddingTop mirrors the results carousel's scroll-padding-left:
    // a snapped row settles ~14px in from the true top instead of flush
    // against it, revealing a "previous row" peek symmetric to the ~13px
    // "next row" peek TAG_AREA_HEIGHT already bakes in below. fadeSize
    // shrunk from the default 18px to 4px — confirmed live that the full
    // gradient was fading out exactly the peeking row it was supposed to
    // preview, working against the peek instead of reinforcing it. A small
    // amount is kept, not removed outright, purely for the depth cue at
    // the edge, not as the "there's more" signal — the peek carries that
    // now.
    <ScrollFadeArea height={TAG_AREA_HEIGHT} scrollStep={66} snap scrollPaddingTop={14} fadeSize={4}>
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

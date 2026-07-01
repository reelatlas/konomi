import { ScrollFadeArea } from "./ScrollFadeArea";
import { TagChip } from "./TagChip";

interface TagScrollAreaProps {
  tags: string[];
  selectedTags: string[];
  onChipToggle: (tag: string) => void;
}

// Exact rendered height of 3 rows of small tag chips (27px chip + 6px gap,
// three times over, plus box-model rounding) — measured directly against the
// live component, not estimated. This is the fixed height for every card's
// tag area: content up to 3 rows needs no scrolling at all; 4+ rows becomes
// internally scrollable at this same height, so the card itself never grows
// or clips.
const TAG_AREA_HEIGHT = "h-[97px]";

export function TagScrollArea({ tags, selectedTags, onChipToggle }: TagScrollAreaProps) {
  return (
    <ScrollFadeArea height={TAG_AREA_HEIGHT}>
      <div className="flex flex-wrap content-start gap-[var(--space-sm)]">
        {tags.map((tag) => (
          <TagChip key={tag} name={tag} size="small" active={selectedTags.includes(tag)} onToggle={onChipToggle} />
        ))}
      </div>
    </ScrollFadeArea>
  );
}

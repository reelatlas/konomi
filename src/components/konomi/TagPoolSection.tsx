import { genreTags, TAG_SECTIONS, tagsForCategories } from "@/lib/konomi/tagPool";
import type { TagInfo } from "@/lib/konomi/types";
import { CollapsibleSection } from "./CollapsibleSection";
import { ScrollFadeArea } from "./ScrollFadeArea";
import { TagChip } from "./TagChip";

interface TagPoolSectionProps {
  allTags: TagInfo[];
  selectedTags: string[];
  onChipToggle: (tag: string) => void;
}

// ~7-8 rows of base-size chips before scrolling — measured directly against
// the live component (46px row step: 38px chip + 8px gap) with headroom for
// the first section's header line, not estimated.
const POOL_AREA_HEIGHT = "h-[380px]";
// Rendered height of a sticky CollapsibleSection header button (text-lg
// line + py-xs top/bottom padding) — measured live against the live
// component, not estimated. Keeps ScrollFadeArea's top gradient/arrow from
// rendering underneath the sticky header.
const SECTION_HEADER_HEIGHT = 38;

function ChipRow({
  tags,
  selectedTags,
  onChipToggle,
}: {
  tags: TagInfo[];
  selectedTags: string[];
  onChipToggle: (tag: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-[var(--space-md)]">
      {tags.map((tag) => (
        <TagChip key={tag.name} name={tag.name} active={selectedTags.includes(tag.name)} onToggle={onChipToggle} />
      ))}
    </div>
  );
}

export function TagPoolSection({ allTags, selectedTags, onChipToggle }: TagPoolSectionProps) {
  return (
    <section className="border-[length:var(--border-base)] border-[var(--ink)] bg-[var(--surface)] shadow-[var(--elev-5)] p-[var(--space-2xl)] mb-[var(--space-xl)]">
      <div className="flex items-center gap-[var(--space-md)] mb-[var(--space-xl)]">
        <h2 className="font-display text-[length:var(--text-xl)] m-0 uppercase tracking-[var(--tracking-sm)]">Tag Pool</h2>
        <span className="font-body font-bold text-[var(--primary)] text-[length:var(--text-md)]">タグ</span>
        <span className="ml-auto font-mono text-[length:var(--text-xs)] text-[var(--muted)]">drag or tap to load a slot</span>
      </div>

      <ScrollFadeArea height={POOL_AREA_HEIGHT} topInset={SECTION_HEADER_HEIGHT}>
        {TAG_SECTIONS.map((section) => (
          <CollapsibleSection key={section.key} title={section.label} storageKey={section.key} defaultExpanded={section.defaultExpanded}>
            {section.subsections ? (
              <div className="flex flex-col gap-[var(--space-lg)]">
                {section.subsections.map((sub) => {
                  const subTags = tagsForCategories(allTags, sub.categories);
                  if (!subTags.length) return null;
                  return (
                    <div key={sub.label}>
                      <span className="block font-mono text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] text-[var(--muted)] uppercase mb-[var(--space-sm)]">
                        {sub.label}
                      </span>
                      <ChipRow tags={subTags} selectedTags={selectedTags} onChipToggle={onChipToggle} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <ChipRow
                tags={section.key === "genres" ? genreTags(allTags) : tagsForCategories(allTags, section.categories ?? [])}
                selectedTags={selectedTags}
                onChipToggle={onChipToggle}
              />
            )}
          </CollapsibleSection>
        ))}
      </ScrollFadeArea>
    </section>
  );
}

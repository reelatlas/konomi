import { genreTags, sortTags, TAG_SECTIONS, tagsForCategories, tagsForSection } from "@/lib/konomi/tagPool";
import type { LevelKey, TagInfo } from "@/lib/konomi/types";
import { CollapsibleSection } from "./CollapsibleSection";
import { LevelSelector } from "./LevelSelector";
import { ScrollFadeArea } from "./ScrollFadeArea";
import { SortSelect } from "./SortSelect";
import { TagChip } from "./TagChip";
import { setSortPref, useSort } from "./tagPoolPrefs";

interface TagPoolSectionProps {
  allTags: TagInfo[];
  selectedTags: string[];
  totalSeriesCount: number;
  level: LevelKey;
  onLevelChange: (level: LevelKey) => void;
  onChipToggle: (tag: string) => void;
}

// Cap, not a fixed height: max-h + overflow-auto hugs shorter content (e.g.
// several sections collapsed) and only clamps + shows scroll fade once
// content actually exceeds ~7-8 rows of base-size chips. Measured directly
// against the live component (46px row step: 38px chip + 8px gap) with
// headroom for the first section's header line, not estimated.
const POOL_AREA_HEIGHT = "max-h-[380px]";
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

export function TagPoolSection({ allTags, selectedTags, totalSeriesCount, level, onLevelChange, onChipToggle }: TagPoolSectionProps) {
  const sort = useSort();

  return (
    <section className="border-[length:var(--border-base)] border-[var(--ink)] bg-[var(--surface)] shadow-[var(--elev-5)] p-[var(--space-2xl)] mb-[var(--space-xl)]">
      <div className="flex items-center gap-[var(--space-md)] mb-[var(--space-xl)]">
        <h2 className="font-display text-[length:var(--text-xl)] m-0 uppercase tracking-[var(--tracking-sm)]">Tag Pool</h2>
        <span className="font-body font-bold text-[var(--primary)] text-[length:var(--text-md)]">タグ</span>
        <span className="ml-auto font-mono text-[length:var(--text-xs)] text-[var(--muted)]">drag or tap to load a slot</span>
      </div>

      <div className="flex items-center gap-[var(--space-lg)] flex-wrap mb-[var(--space-xl)]">
        <LevelSelector value={level} onChange={onLevelChange} />
        <SortSelect value={sort} onChange={setSortPref} />
      </div>

      <ScrollFadeArea height={POOL_AREA_HEIGHT} topInset={SECTION_HEADER_HEIGHT}>
        {TAG_SECTIONS.map((section) => {
          const sectionTags = tagsForSection(allTags, section, level, totalSeriesCount);
          // Hidden entirely, not just visually collapsed, when nothing at
          // this level qualifies (e.g. every non-Genres section at Level
          // 1). CollapsibleSection's expand state lives in localStorage,
          // untouched by mounting/unmounting, so this is a pure render
          // guard — the section remembers its expand state for whenever it
          // reappears at a higher level.
          if (sectionTags.length === 0) return null;
          const selectedCount = sectionTags.filter((t) => selectedTags.includes(t.name)).length;
          return (
            <CollapsibleSection
              key={section.key}
              title={section.label}
              storageKey={section.key}
              defaultExpanded={section.defaultExpanded}
              selectedCount={selectedCount}
            >
              {section.subsections ? (
                <div className="flex flex-col gap-[var(--space-lg)]">
                  {section.subsections.map((sub) => {
                    const subTags = sortTags(tagsForCategories(allTags, sub.categories, level, totalSeriesCount), sort);
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
                  tags={sortTags(
                    section.key === "genres" ? genreTags(allTags) : tagsForCategories(allTags, section.categories ?? [], level, totalSeriesCount),
                    sort,
                  )}
                  selectedTags={selectedTags}
                  onChipToggle={onChipToggle}
                />
              )}
            </CollapsibleSection>
          );
        })}
      </ScrollFadeArea>
    </section>
  );
}

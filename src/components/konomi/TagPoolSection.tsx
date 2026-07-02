import { genreTags, sortTags, TAG_SECTIONS, tagsForCategories, tagsForSection } from "@/lib/konomi/tagPool";
import type { LevelKey, TagInfo } from "@/lib/konomi/types";
import { CollapsibleSection } from "./CollapsibleSection";
import { SortIcon, TagIcon } from "./icons";
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
// Reserves clearance for the header row's two now-absolute hints (the
// subtext and the Level hint), neither of which contributes flow height
// anymore — confirmed live: with no extra clearance the Level hint sits
// ~1px from the first Tag Pool section (Chrome DevTools bounding-box
// measurement, not estimated); --space-lg leaves a comfortable ~13-17px.
const HEADER_HINT_CLEARANCE = "pb-[var(--space-lg)]";
// The subtext is `absolute` (see below), so its real rendered width is
// invisible to the flex row's wrap-width calculation, which would otherwise
// only account for the much-narrower title row — confirmed live, this let
// the subtext visually overlap the controls in a ~40px window right before
// the row wrapped (e.g. 11px of real overlap at a 740px viewport). Giving
// the title block a min-width matching the subtext's measured natural width
// (172px) plus a small buffer makes the flex row treat that block as
// needing this much space, so it wraps before any overlap can occur.
const HEADER_TITLE_MIN_WIDTH = "min-w-[190px]";
// When the controls wrap below the title block (narrow viewports), the flex
// container's own wrap-gap is computed from in-flow content only — it can't
// see the absolutely-positioned subtext hanging below the title row, so the
// wrapped controls line landed directly on top of it (confirmed live before
// this fix). This is `gap-y` on the *container*, not `margin-bottom` on the
// title-block item — margin on a flex item counts toward that item's own
// height for every cross-axis alignment purpose, including items-center's
// same-line comparison, which is exactly what a first version of this fix
// broke (it silently added 24px to the title block's effective height,
// skewing items-center's title-vs-controls centering by half of that even
// when both sat on the same line). row-gap only inserts space *between*
// wrapped lines and never touches any single item's own box, so it can
// solve the wrap-collision without touching same-line centering at all.
const HEADER_TITLE_WRAP_CLEARANCE = "gap-y-[var(--space-3xl)]";

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
      {/* items-center compares each side's PRIMARY row only — the title row
          here, the button row in the controls group — not the combined
          height including each side's secondary hint. Both hints
          ("drag or tap...", the Level hint) are `absolute`, out of flow, so
          they hang below their primary row without affecting this
          comparison: two parallel primary+hint structures, centered on
          their primary elements. HEADER_HINT_CLEARANCE below reserves the
          space the now-out-of-flow hints need so neither overlaps the
          first Tag Pool section. */}
      <div className={`flex items-center justify-between gap-x-[var(--space-lg)] ${HEADER_TITLE_WRAP_CLEARANCE} flex-wrap ${HEADER_HINT_CLEARANCE} mb-[var(--space-xl)]`}>
        <div className={`relative ${HEADER_TITLE_MIN_WIDTH}`}>
          <div className="flex items-center gap-[var(--space-md)]">
            <h2 className="font-display text-[length:var(--text-xl)] leading-[var(--leading-display)] m-0 uppercase tracking-[var(--tracking-sm)]">Tag Pool</h2>
            <span className="font-body font-bold text-[var(--primary)] text-[length:var(--text-md)]">タグ</span>
          </div>
          {/* left-0 + whitespace-nowrap, not inset-x-0: the relative parent's
              width now comes from just the title row (narrower than this
              phrase), so inset-x-0 would force-wrap it to the parent's
              width instead of letting it render at its natural single-line
              width. */}
          <span className="absolute top-full left-0 mt-[var(--space-xs)] whitespace-nowrap font-mono text-[length:var(--text-xs)] text-[var(--muted)]">
            drag or tap to load a slot
          </span>
        </div>

        {/* One atomic flex item so Sort+Level move together when wrapped —
            justify-between above then degenerates to flex-start for this
            lone item on its own line, matching the header's alignment
            rather than staying docked right once stacked. Level sits last
            (rightmost) so its hint — always right-aligned to its own box —
            lines up flush with the whole group's right edge. Sort/Level stay
            items-start against each other so their top edges line up. Each
            icon is paired with its own control in a nested items-center row
            so it centers against that control's height specifically, not
            the row's overall height. */}
        <div className="flex items-start gap-[var(--space-lg)] flex-wrap">
          <div className="flex items-center gap-[var(--space-sm)]">
            <SortIcon className="text-[var(--ink)]" />
            <SortSelect value={sort} onChange={setSortPref} />
          </div>
          <div className="flex items-center gap-[var(--space-sm)]">
            <TagIcon className="text-[var(--ink)]" />
            <LevelSelector value={level} onChange={onLevelChange} />
          </div>
        </div>
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

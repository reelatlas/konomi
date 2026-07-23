import type { Domain, TagSection } from "./domain";
import type { LevelKey, SortKey, TagInfo } from "./types";

// Domain-generic tag pool helpers. Everything side-specific — the section
// tree, the level ladder, the visibility rule — lives on the Domain object
// (domain.ts) and is passed in explicitly, so nothing in here closes over
// one side's constants. The anime side's data lives in animeDomain.ts.
//
// Sort is the one deliberately SHARED surface: both sides sort by item
// count and name, so SORT_OPTIONS/sortTags stay side-free.

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "popular", label: "Popular" },
  { key: "unpopular", label: "Unpopular" },
  { key: "az", label: "A-Z" },
  { key: "za", label: "Z-A" },
];

export function sortTags(tags: TagInfo[], sort: SortKey): TagInfo[] {
  const sorted = [...tags];
  switch (sort) {
    case "popular":
      return sorted.sort((a, b) => b.seriesCount - a.seriesCount);
    case "unpopular":
      return sorted.sort((a, b) => a.seriesCount - b.seriesCount);
    case "az":
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case "za":
      return sorted.sort((a, b) => b.name.localeCompare(a.name));
  }
}

// Tags for one subsection/flat category list, floored at the given level.
export function tagsForCategories(
  domain: Domain,
  allTags: TagInfo[],
  categories: string[],
  level: LevelKey,
  totalCount: number,
): TagInfo[] {
  return allTags.filter((t) => !t.isGenre && domain.isTagVisible(t, level, totalCount) && categories.includes(t.category ?? ""));
}

export function genreTags(allTags: TagInfo[]): TagInfo[] {
  return allTags.filter((t) => t.isGenre);
}

// All tags belonging to a section, regardless of its internal shape (flat
// categories, subsections, or genres) — used for the section header's
// selected-count badge, which counts across the whole section rather than
// per-subsection.
export function tagsForSection(
  domain: Domain,
  allTags: TagInfo[],
  section: TagSection,
  level: LevelKey,
  totalCount: number,
): TagInfo[] {
  if (section.key === "genres") return genreTags(allTags);
  if (section.subsections) {
    return tagsForCategories(
      domain,
      allTags,
      section.subsections.flatMap((sub) => sub.categories),
      level,
      totalCount,
    );
  }
  return tagsForCategories(domain, allTags, section.categories ?? [], level, totalCount);
}

// The single canonical definition of "visible in the pool at this level" —
// the union of every domain section's tags, not just domain.isTagVisible
// alone. That distinction matters: anime Technical/Sexual Content tags can
// clear a level's rank/count threshold but are never mapped into any
// section, so they must never come out of this regardless of level.
// Anything that picks or prunes tag *selections* (Random ×3, the
// level-change deselect cascade) should use this, not isTagVisible
// directly, so those surfaces can never drift from what the pool actually
// renders.
export function visiblePoolTagNames(domain: Domain, allTags: TagInfo[], level: LevelKey, totalCount: number): string[] {
  const names = new Set<string>();
  for (const section of domain.sections) {
    for (const tag of tagsForSection(domain, allTags, section, level, totalCount)) {
      names.add(tag.name);
    }
  }
  return [...names];
}

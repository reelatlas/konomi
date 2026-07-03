import { AVG_RANK_BASELINE, POPULAR_AVG_RANK_THRESHOLD, POPULAR_SERIES_COUNT_PCT } from "./config";
import type { LevelKey, SortKey, TagInfo } from "./types";

// Static mapping of the tag pool's hierarchy: 5 top-level sections, each one
// a tab in SectionTabStrip.tsx. Only Theme splits into labeled subsections
// (plain inline group labels within that tab's content, not a second nav
// level) — Setting and Cast merge their categories into one flat, unlabeled
// list per section (same tags, just no subsection grouping shown). Technical
// and Sexual Content are deliberately omitted — hidden entirely.
export interface TagSubsection {
  label: string;
  categories: string[];
}

export interface TagSection {
  key: string;
  label: string;
  // Theme only. When present, tags render grouped under each label instead
  // of the flat `categories` list below.
  subsections?: TagSubsection[];
  // Setting/Cast/Demographic: categories merged into one flat list. Genres
  // has neither — it's filtered by isGenre, not category.
  categories?: string[];
}

export const TAG_SECTIONS: TagSection[] = [
  { key: "genres", label: "Genres" },
  {
    key: "theme",
    label: "Theme",
    subsections: [
      { label: "Action", categories: ["Theme-Action"] },
      { label: "Fantasy", categories: ["Theme-Fantasy"] },
      { label: "Romance", categories: ["Theme-Romance"] },
      { label: "Drama", categories: ["Theme-Drama"] },
      { label: "Comedy", categories: ["Theme-Comedy"] },
      { label: "Sci-Fi", categories: ["Theme-Sci-Fi", "Theme-Sci-Fi-Mecha"] },
      { label: "Slice of Life", categories: ["Theme-Slice of Life"] },
      { label: "Arts", categories: ["Theme-Arts", "Theme-Arts-Music"] },
      { label: "Game & Sport", categories: ["Theme-Game", "Theme-Game-Sport", "Theme-Game-Card & Board Game"] },
      { label: "Other", categories: ["Theme-Other", "Theme-Other-Organisations", "Theme-Other-Vehicle"] },
    ],
  },
  { key: "setting", label: "Setting", categories: ["Setting-Scene", "Setting-Time", "Setting-Universe"] },
  // "Characters" is display-only — key/categories stay "cast"/Cast-* so
  // storageKey and the section-mapping logic are untouched.
  { key: "cast", label: "Characters", categories: ["Cast-Traits", "Cast-Main Cast"] },
  { key: "demographic", label: "Demographic", categories: ["Demographic"] },
];

export const LEVEL_OPTIONS: { key: LevelKey; label: string; hint: string }[] = [
  { key: "1", label: "Casual", hint: "light enjoyer ☕" },
  { key: "2", label: "Seasoned", hint: "not my first rodeo 𓄀" },
  { key: "3", label: "Otaku", hint: ">9000 ⋆˙⟡(っ•̀,•́)っ≡≡≡≡〇" },
];

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "popular", label: "Popular" },
  { key: "unpopular", label: "Unpopular" },
  { key: "az", label: "A-Z" },
  { key: "za", label: "Z-A" },
];

// Whether a tag shows at a given level — the single rule both the pool and
// result cards defer to, so "what's visible" never drifts between them.
// Genres always pass (isGenre short-circuits before any level check), which
// is also why callers never need to level-filter genreTags() below.
export function isTagVisibleAtLevel(tag: TagInfo, level: LevelKey, totalSeriesCount: number): boolean {
  if (tag.isGenre) return true;
  if (level === "1") return false;
  if (level === "2") return tag.avgRank >= POPULAR_AVG_RANK_THRESHOLD && tag.seriesCount >= POPULAR_SERIES_COUNT_PCT * totalSeriesCount;
  return tag.avgRank >= AVG_RANK_BASELINE;
}

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
export function tagsForCategories(allTags: TagInfo[], categories: string[], level: LevelKey, totalSeriesCount: number): TagInfo[] {
  return allTags.filter((t) => !t.isGenre && isTagVisibleAtLevel(t, level, totalSeriesCount) && categories.includes(t.category ?? ""));
}

export function genreTags(allTags: TagInfo[]): TagInfo[] {
  return allTags.filter((t) => t.isGenre);
}

// All tags belonging to a section, regardless of its internal shape (flat
// categories, subsections, or genres) — used for the section header's
// selected-count badge, which counts across the whole section rather than
// per-subsection.
export function tagsForSection(allTags: TagInfo[], section: TagSection, level: LevelKey, totalSeriesCount: number): TagInfo[] {
  if (section.key === "genres") return genreTags(allTags);
  if (section.subsections) {
    return tagsForCategories(
      allTags,
      section.subsections.flatMap((sub) => sub.categories),
      level,
      totalSeriesCount,
    );
  }
  return tagsForCategories(allTags, section.categories ?? [], level, totalSeriesCount);
}

// The single canonical definition of "visible in the pool at this level" —
// the union of every TAG_SECTIONS entry's tags, not just isTagVisibleAtLevel
// alone. That distinction matters: Technical/Sexual Content tags can clear
// a level's rank/count threshold but are never mapped into any section, so
// they must never come out of this regardless of level. Anything that picks
// or prunes tag *selections* (Random ×3, the level-change deselect cascade)
// should use this, not isTagVisibleAtLevel directly, so those surfaces can
// never drift from what the pool actually renders.
export function visiblePoolTagNames(allTags: TagInfo[], level: LevelKey, totalSeriesCount: number): string[] {
  const names = new Set<string>();
  for (const section of TAG_SECTIONS) {
    for (const tag of tagsForSection(allTags, section, level, totalSeriesCount)) {
      names.add(tag.name);
    }
  }
  return [...names];
}

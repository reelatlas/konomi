import { AVG_RANK_BASELINE, POPULAR_AVG_RANK_THRESHOLD, POPULAR_SERIES_COUNT_PCT } from "./config";
import type { Domain, TagSection } from "./domain";
import type { LevelKey, TagInfo } from "./types";

// Static mapping of the anime tag pool's hierarchy: 5 top-level sections,
// each one a tab in SectionTabStrip.tsx. Only Theme splits into labeled
// subsections (plain inline group labels within that tab's content, not a
// second nav level) — Setting and Cast merge their categories into one flat,
// unlabeled list per section (same tags, just no subsection grouping shown).
// Technical and Sexual Content are deliberately omitted — hidden entirely.
const ANIME_TAG_SECTIONS: TagSection[] = [
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

// Anime visibility is COMPUTED from catalog stats (unlike film, whose tags
// carry a stored min_level — see Domain.isTagVisible in domain.ts). Genres
// always pass (isGenre short-circuits before any level check), which is
// also why callers never need to level-filter genreTags(). avgRank is null
// only on film tags, which never reach this rule — the ?? -1 just keeps the
// null branch honest (fails every threshold) without a non-null assertion.
function isAnimeTagVisible(tag: TagInfo, level: LevelKey, totalCount: number): boolean {
  if (tag.isGenre) return true;
  if (level === "1") return false;
  const rank = tag.avgRank ?? -1;
  if (level === "2") return rank >= POPULAR_AVG_RANK_THRESHOLD && tag.seriesCount >= POPULAR_SERIES_COUNT_PCT * totalCount;
  return rank >= AVG_RANK_BASELINE;
}

export const animeDomain: Domain = {
  key: "anime",
  label: "Anime",
  route: "/anime",
  // Historical un-suffixed prefix — keeps existing users' saved level/sort.
  storagePrefix: "konomi",
  sections: ANIME_TAG_SECTIONS,
  levels: [
    { key: "1", label: "Casual", hint: "light enjoyer ☕" },
    { key: "2", label: "Seasoned", hint: "not my first rodeo 𓄀" },
    { key: "3", label: "Otaku", hint: ">9000 ⋆˙⟡(っ•̀,•́)っ≡≡≡≡〇" },
  ],
  isTagVisible: isAnimeTagVisible,
  // Verbatim the line ResultCard used to build inline — year/eps can
  // genuinely be null (unreleased media), so each part drops independently.
  cardMeta: (item) => [item.year ?? "TBA", item.eps != null ? `${item.eps} EP` : null].filter(Boolean).join(" · "),
};

import { AVG_RANK_BASELINE } from "./config";
import type { TagInfo } from "./types";

// Static mapping of the tag pool's hierarchy: 5 top-level sections. Only
// Theme splits into labeled, non-collapsible subsections — Setting and Cast
// merge their categories into one flat, unlabeled list per section (same
// tags, just no subsection grouping shown). Technical and Sexual Content are
// deliberately omitted — hidden entirely.
export interface TagSubsection {
  label: string;
  categories: string[];
}

export interface TagSection {
  key: string;
  label: string;
  defaultExpanded: boolean;
  // Theme only. When present, tags render grouped under each label instead
  // of the flat `categories` list below.
  subsections?: TagSubsection[];
  // Setting/Cast/Demographic: categories merged into one flat list. Genres
  // has neither — it's filtered by isGenre, not category.
  categories?: string[];
}

export const TAG_SECTIONS: TagSection[] = [
  { key: "genres", label: "Genres", defaultExpanded: true },
  {
    key: "theme",
    label: "Theme",
    defaultExpanded: true,
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
  { key: "setting", label: "Setting", defaultExpanded: true, categories: ["Setting-Scene", "Setting-Time", "Setting-Universe"] },
  { key: "cast", label: "Cast", defaultExpanded: true, categories: ["Cast-Traits", "Cast-Main Cast"] },
  { key: "demographic", label: "Demographic", defaultExpanded: true, categories: ["Demographic"] },
];

// Tags for one subsection/flat category list: rank-floored, sorted by popularity.
export function tagsForCategories(allTags: TagInfo[], categories: string[]): TagInfo[] {
  return allTags
    .filter((t) => !t.isGenre && t.avgRank >= AVG_RANK_BASELINE && categories.includes(t.category ?? ""))
    .sort((a, b) => b.seriesCount - a.seriesCount);
}

export function genreTags(allTags: TagInfo[]): TagInfo[] {
  return allTags.filter((t) => t.isGenre).sort((a, b) => b.seriesCount - a.seriesCount);
}

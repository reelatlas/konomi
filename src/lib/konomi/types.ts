export interface Series {
  title: string;
  // Nullable because AniList genuinely lacks these for some entries (e.g.
  // "Not Yet Released" media) — components must handle the null case.
  year: number | null;
  eps: number | null;
  tags: string[];
  coverImageUrl: string | null;
  genres: string[];
}

export interface ResultEntry {
  series: Series;
  score: number;
}

// Catalog-level tag metadata for the tag pool UI — kept separate from
// Series.tags (which stays plain string[], since scoring only ever needs tag
// names, not category/popularity stats). Genres are represented here too
// (isGenre: true, avgRank: 100, category: null) so they flow through the same
// pool/selection/mixer infrastructure as real tags — see queries.ts.
export interface TagInfo {
  name: string;
  category: string | null;
  seriesCount: number;
  avgRank: number;
  isGenre: boolean;
}

export type ThemeKey = "default" | "dark" | "third";

export interface ThemeColors {
  name: string;
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  fill: string;
  primary: string;
  secondary: string;
  onPrimary: string;
  onSecondary: string;
  disabledBg: string;
  disabledText: string;
  slotEmpty: string;
}

export type MatchKey = "1" | "2" | "3";

export type Slot = string | null;

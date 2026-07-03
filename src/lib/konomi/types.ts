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
  // A bold, high-contrast variant of `primary` — darkened for light-surface
  // themes, lightened for dark-surface ones (same blend ratio, opposite
  // direction — darkening in a dark-surface theme would move toward the
  // background, not away from it). Used where something needs to read as
  // "the same accent family as primary" but stand out sharply regardless of
  // what it's sitting on, e.g. the mixer error hint stars/text.
  primaryDeep: string;
  secondary: string;
  onPrimary: string;
  onSecondary: string;
  disabledBg: string;
  disabledText: string;
  slotEmpty: string;
}

export type MatchKey = "1" | "2" | "3";

// Set only by a RECOMMEND click that can't produce results — never by
// changing tags or min-match alone (those only drive live filtering of
// what's already on screen). "impossible-min": tag count < min-match.
// "no-match": min-match is achievable but the catalog rescore found nothing
// new. See DESIGN_SYSTEM.md's "Mixer error system" for the full model.
export type MixerError = "impossible-min" | "no-match" | null;

// Tag pool visibility tier — "1" (Genres only) through "3" (All, the
// existing baseline). Global, applies to both the pool and result cards.
export type LevelKey = "1" | "2" | "3";

// Tag pool/result-card sort order — independent of LevelKey (level decides
// which tags show, sort decides what order).
export type SortKey = "popular" | "unpopular" | "az" | "za";

export type Slot = string | null;

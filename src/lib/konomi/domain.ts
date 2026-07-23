import type { LevelKey, TagInfo } from "./types";

// A "side" is a catalog partition — anime (AniList data) or film (TMDB
// data). The partitions never mix (disjoint tag pools, separate DB tables;
// see DATA_SOURCING.md's isolation section); what they share is this app's
// entire component tree and interaction model. A Domain bundles everything
// that is genuinely side-specific — the section tree, the level ladder, and
// the tag-visibility rule — so components read those through the active
// domain instead of importing one side's constants directly. Theme stays a
// separate axis (user chrome, not catalog partition): the root carries both
// data-theme and data-side, and they compose freely.
export type SideKey = "anime" | "film";

export interface TagSubsection {
  label: string;
  categories: string[];
}

// One tab in the tag pool's section strip. Three shapes, discriminated by
// which optional field is present: `subsections` (tags render grouped under
// inline labels), `categories` (one flat list), or neither (the genres
// section, filtered by TagInfo.isGenre rather than category). See
// TagPoolBody for how each renders.
export interface TagSection {
  key: string;
  label: string;
  subsections?: TagSubsection[];
  categories?: string[];
}

export interface LevelOption {
  key: LevelKey;
  label: string;
  hint: string;
}

export interface Domain {
  key: SideKey;
  // The tag pool's section tree — every section this side's pool can show.
  // Empty sections (no visible tag at the current level) are hidden by the
  // pool at render time (TagPoolBody's visibleSections), so this is the
  // full tree, not a pre-filtered one.
  sections: TagSection[];
  // The level ladder (anime: Casual/Seasoned/Otaku). Both sides use the
  // same LevelKey "1"|"2"|"3" — only labels/hints and the visibility rule
  // below differ.
  levels: LevelOption[];
  // Whether a tag shows at a given level — the single rule the pool, result
  // cards, Random ×3, and the level-change prune all defer to. Per-domain
  // because the *mechanism* differs by side: anime computes visibility from
  // avgRank/seriesCount thresholds; film reads a stored min_level. Neither
  // side may fake the other's fields to reuse its rule.
  isTagVisible(tag: TagInfo, level: LevelKey, totalCount: number): boolean;
}

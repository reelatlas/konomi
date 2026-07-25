// The shared catalog item shape for BOTH sides (anime series and films) —
// kept under its historical name to avoid a cosmetic mass-rename. Film rows
// are adapted into this shape by getFilmCatalog (filmQueries.ts): each side
// fills the shared core, plus its own optional fields below; presentation
// differences (eps vs runtime, rating scale) live in the Domain's cardMeta
// mapping, not in per-side card components.
// ---- THE IDENTITY CONTRACT (locked 2026-07-25, census-backed) ----
// Every selectable and every series-tag membership is id-addressable;
// display strings NEVER key anything — not React keys, not state maps,
// not scoring. Ids are opaque provider-scoped strings so the two sides
// (and any future source) can never collide with each other:
//   series   anilist:<anilist_id>            tmdb:<tmdb_id>
//   tags     anilist-tag:<anilist_id>        tmdb-tag:<film_tags.key>
//   genres   anilist-genre:<name>            tmdb-genre:<name>
//   synth    —                               tmdb-synth:<kind>:<value>
// film_tags.key is already the stable typed identity (person:actor:1032,
// saga:645, studio:2, kw:heist — provider ids, not display names); mint
// from it, never from a display name. Measured motivation: 241 film
// titles collide (504 rows, Godzilla/Dracula/…) and 498 film tag names
// collide (1,071 rows, Tarantino ×4) — display strings are ~6-7% ambiguous
// in this corpus. Anime measured 0 collisions everywhere, which is why
// title-keying survived the anime era; it does not survive film.
// Migration state: Phase 1 (ids carried through adapters) DONE · Phase 2
// (series state: locked/flipped/newIds/swap → id-keyed) DONE · Phase 3a (tag
// payload + selection → id; removes filmQueries' name-merge — NOTE the
// expected behavior change: one chip stops unioning same-named entities/
// roles, selecting actor-De Niro no longer matches producer-only credits)
// · Phase 3b (multi-role display UX, see DESIGN_SYSTEM parking lot).

export interface Series {
  // See THE IDENTITY CONTRACT above.
  id: string;
  title: string;
  // Nullable because AniList genuinely lacks these for some entries (e.g.
  // "Not Yet Released" media) — components must handle the null case.
  year: number | null;
  // Anime-only (episode count); null for films — runtimeMin is the film
  // counterpart. Both feed the card meta line via Domain.cardMeta.
  eps: number | null;
  tags: string[];
  coverImageUrl: string | null;
  genres: string[];
  // 0-100 scale on BOTH sides — AniList's weighted average natively; TMDB's
  // 0-10 vote_average is ×10-normalized at adaptation so RatingBadge's
  // tiers/format need no per-side branching. Null when genuinely absent.
  averageScore: number | null;
  // Pre-cleaned plain text (real newlines, no <br> tags, no trailing
  // "(Source: ...)" citation, no ~!spoiler!~ markup), see
  // cleanDescription() in scripts/import-anilist.ts. Null when AniList
  // genuinely has none, same "absent, not faked" reasoning as averageScore.
  description: string | null;
  // Real per-series watch links, filtered to a curated allow-list of known
  // platforms at import time (see STREAMING_ALLOW_LIST in
  // scripts/import-anilist.ts), not every platform AniList tracks. Empty,
  // not null, when nothing on the allow-list matched, same "absent is an
  // empty array, not null" reasoning genres already uses. icon/color are
  // both nullable (AniList's own schema doesn't guarantee either for every
  // link, though every allow-listed platform has always had both,
  // confirmed live) so the chip UI has to handle a label-only, ink-filled
  // fallback either way.
  streamingServices: { name: string; url: string; icon: string | null; color: string | null }[];
  // ---- Film-only optionals (absent on anime items) ----
  // Runtime in minutes; the film counterpart of eps.
  runtimeMin?: number | null;
  // US certification (G/PG/PG-13/R/NC-17/NR), already trimmed.
  certification?: string | null;
  // Saga/collection name (" Collection" suffix stripped), for card display.
  // Set for EVERY saga member including singletons — a singleton's saga is
  // a read-only card fact whose name is deliberately NOT a selectable tag
  // (see adapter-config.json sagas.singletons); shelf (≥2) sagas also exist
  // as real tags in `tags`, so this field is purely display.
  sagaName?: string | null;
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
  // See THE IDENTITY CONTRACT above (Series). Phase 1: carried but not
  // yet keying selection/scoring — that's Phase 3a.
  id: string;
  name: string;
  category: string | null;
  seriesCount: number;
  // Anime-only: AniList's mean tag rank, read by animeDomain's COMPUTED
  // visibility rule. Null on film tags — film visibility is STORED
  // (minLevel below), and neither side may fake the other's field to
  // borrow its rule (no fabricated ranks).
  avgRank: number | null;
  isGenre: boolean;
  // Film-only: the stored level gate ("1" moviegoer / "2" film buff / "3"
  // cinephile), from film_tags.min_level for DB tags or assigned at
  // synthesis for column-derived tags (reception/origin/certification).
  // Absent on anime tags.
  minLevel?: LevelKey;
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
// changing tags, min-match, or locks alone (those only drive live filtering
// of what's already on screen). One error at a time, in guided-flow priority
// order (surface the blocker that needs immediate action; fixing it reveals
// the next one on the following press, never all at once):
//   "impossible-min": tag count < min-match — nothing can even be attempted.
//   "all-locked": every result slot is held by a lock (or every qualifying
//     title is locked), so a roll has nowhere to land — unlocking is the fix.
//   "no-new-matches": the mix works and cards are showing, but every
//     qualifying title is already on screen — a roll would change nothing.
//     Loosen the mix, or Clear ✕ to re-roll the same pool fresh.
//   "no-match": nothing in the catalog qualifies at all.
// See DESIGN_SYSTEM.md's "Mixer error system" for the full model.
export type MixerError = "impossible-min" | "all-locked" | "no-new-matches" | "no-match" | null;

// Tag pool visibility tier — "1" (Genres only) through "3" (All, the
// existing baseline). Global, applies to both the pool and result cards.
export type LevelKey = "1" | "2" | "3";

// Tag pool/result-card sort order — independent of LevelKey (level decides
// which tags show, sort decides what order).
export type SortKey = "popular" | "unpopular" | "az" | "za";

export type Slot = string | null;

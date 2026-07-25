import type { Domain, TagSection } from "./domain";
import type { LevelKey, TagInfo } from "./types";

// The film tag pool's hierarchy. Top strip = the two wt-100/always layers
// (Genres, Reception), the four kw pillars (Feel/Setting/Story/Style —
// subsection order inside each is EXACTLY tag-rules/master.json's
// pillar_tree order, per adapter-config.json rules.section_order), then
// People and Origin. This top-level arrangement is a PROPOSED IA — where
// Genres/Reception/People/Origin sit relative to the pillars was left open
// at adapter design time; rearranging is config-only, rule freely.
//
// Pillars use subsectionsAsTabs (Story alone has 17 sections — a second tab
// tier, not one giant scroll). Subsection categories are the kw section
// names as stored in film_tags, or the TYPE_CATEGORY strings filmQueries.ts
// assigns to credit/saga/origin tags — the two files are a contract.
const FILM_TAG_SECTIONS: TagSection[] = [
  { key: "genres", label: "Genres" },
  {
    key: "reception",
    label: "Reception",
    subsectionsAsTabs: true,
    // "Impact" = how the film is regarded (acclaimed · era-defining ·
    // famous · divisive · infamous · underseen · niche favourite ·
    // buzzing); "Box office" = the money story (blockbuster · big-budget ·
    // the four ROI bands). Names user-ruled 2026-07-24: "Impact" + "Box office".
    subsections: [
      { label: "Impact", categories: ["Reception-Impact"] },
      { label: "Box office", categories: ["Reception-Box office"] },
    ],
  },
  {
    key: "feel",
    label: "Feel",
    subsectionsAsTabs: true,
    subsections: [
      { label: "Mood", categories: ["Mood"] },
      { label: "Attitude", categories: ["Attitude"] },
    ],
  },
  {
    key: "setting",
    label: "Setting",
    subsectionsAsTabs: true,
    subsections: [
      { label: "Era", categories: ["Era"] },
      { label: "Time of year", categories: ["Time of year"] },
      { label: "Map", categories: ["Map"] },
      { label: "Regions", categories: ["Regions"] },
      { label: "Natural world", categories: ["Natural world"] },
      { label: "Built world", categories: ["Built world"] },
      { label: "Vessels", categories: ["Vessels"] },
    ],
  },
  {
    key: "story",
    label: "Story",
    subsectionsAsTabs: true,
    subsections: [
      { label: "Archetypes & people", categories: ["Archetypes & people"] },
      { label: "Professions", categories: ["Professions"] },
      { label: "Love & family", categories: ["Love & family"] },
      { label: "Identity", categories: ["Identity"] },
      { label: "Mind & health", categories: ["Mind & health"] },
      { label: "Themes", categories: ["Themes"] },
      { label: "Events & actions", categories: ["Events & actions"] },
      { label: "Engines of society", categories: ["Engines of society"] },
      { label: "Crime", categories: ["Crime"] },
      { label: "War & conflict", categories: ["War & conflict"] },
      { label: "Faith", categories: ["Faith"] },
      { label: "Sports", categories: ["Sports"] },
      { label: "Arts & performance", categories: ["Arts & performance"] },
      { label: "Vices", categories: ["Vices"] },
      { label: "Pursuits & hobbies", categories: ["Pursuits & hobbies"] },
      { label: "Animals & nature", categories: ["Animals & nature"] },
      { label: "Objects & weapons", categories: ["Objects & weapons"] },
    ],
  },
  {
    key: "style",
    label: "Style",
    subsectionsAsTabs: true,
    subsections: [
      { label: "Sub-genres", categories: ["Sub-genres"] },
      { label: "Wondrous worlds", categories: ["Wondrous worlds"] },
      { label: "Bestiary", categories: ["Bestiary"] },
      { label: "Arcana", categories: ["Arcana"] },
      { label: "Filmcraft", categories: ["Filmcraft"] },
      { label: "Cinema waves", categories: ["Cinema waves"] },
      { label: "Based on", categories: ["Based on"] },
      // The 5 franchise-mechanics kw (sequel/prequel/remake/reboot/spin
      // off) — taste tags about a film's relation to another film, sitting
      // beside "Based on" (where it came from / what line it belongs to).
      // Until the Sagas dissolve (master.json sweep "sagas-dissolve",
      // 2026-07-25) these shared one "Sagas" section with the ~595 named
      // franchise entities, which now live in the top-level Franchise
      // section below.
      { label: "Lineage", categories: ["Lineage"] },
    ],
  },
  {
    // The named-saga shelf (type: saga, moviegoer, assigned category
    // "Franchise" in filmQueries — read-time, the rows carry no section in
    // the DB). Its own top-level section, NOT a People subsection: People's
    // sub-tabs are all credit roles and these are works, and entity-vs-
    // taste is the axis the search treatment keys off (see the
    // sagas-dissolve ruling). Placed beside People so the two entity
    // sections read as one zone ahead of Origin. Flat list — one category,
    // no sub-tier.
    key: "franchise",
    label: "Franchise",
    categories: ["Franchise"],
    capped: true, // ~600 entities — see TagSection.capped
  },
  {
    key: "people",
    label: "People",
    subsectionsAsTabs: true,
    capped: true, // ~13k entities across sub-tabs — see TagSection.capped
    subsections: [
      { label: "Actors", categories: ["People-Actors"] },
      { label: "Directors", categories: ["People-Directors"] },
      { label: "Producers", categories: ["People-Producers"] },
      { label: "Cinematographers", categories: ["People-Cinematographers"] },
      { label: "Composers", categories: ["People-Composers"] },
      { label: "Studios", categories: ["People-Studios"] },
    ],
  },
  {
    key: "origin",
    label: "Origin",
    subsectionsAsTabs: true,
    subsections: [
      { label: "Decade", categories: ["Origin-Decade"] },
      { label: "Country", categories: ["Origin-Country"] },
      { label: "Language", categories: ["Origin-Language"] },
      { label: "Rated", categories: ["Origin-Rated"] },
    ],
  },
];

// Film visibility is STORED, not computed: every non-genre film tag carries
// minLevel (from film_tags.min_level, or assigned at synthesis — see
// filmQueries.ts). A tag missing it is a wiring bug; failing closed (hidden
// everywhere) surfaces that as an absence rather than a leak. totalCount is
// unused — that's the anime side's computed-threshold input.
function isFilmTagVisible(tag: TagInfo, level: LevelKey): boolean {
  if (tag.isGenre) return true;
  if (!tag.minLevel) return false;
  return Number(level) >= Number(tag.minLevel);
}

// "2H 19M" mirrors the anime card's "24 EP" register (uppercase, terse).
function formatRuntime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}H ${m}M` : `${m}M`;
}

export const filmDomain: Domain = {
  key: "film",
  label: "Film",
  route: "/film",
  storagePrefix: "konomi:film",
  sections: FILM_TAG_SECTIONS,
  // Level names are the loosely-settled trio (see DATA_SOURCING). Hint text
  // user-ruled 2026-07-24, static single emoji (a 3-frame flipbook per
  // level was tried and reverted same day — glyph animation here is a
  // maybe-later; the machinery is hintGlyphs, see GlyphCycle, still live
  // on the theme subtext).
  levels: [
    { key: "1", label: "Moviegoer", hint: "where is my popcorn? 🍿" },
    { key: "2", label: "Film buff", hint: "stay for the credits 🎞️" },
    { key: "3", label: "Cinephile", hint: "rosebud 🛷" },
  ],
  isTagVisible: isFilmTagVisible,
  cardMeta: (item) =>
    [item.year ?? "TBA", item.runtimeMin != null ? formatRuntime(item.runtimeMin) : null, item.certification ?? null]
      .filter(Boolean)
      .join(" · "),
  // Required by TMDB's terms wherever provider data displays.
  streamingAttribution: "streaming via JustWatch",
};

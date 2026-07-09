// Imports anime series + tags from the AniList GraphQL API into Supabase.
//
// Run with: npm run import:anilist
// (uses `tsx --env-file=.env.local`, so SUPABASE_SECRET_KEY etc. are loaded
// without needing a dotenv dependency)
//
// Safe to re-run: everything is upserted on anilist_id (or the series_id +
// tag_id pair for links), so a rerun updates existing rows instead of
// duplicating them. Nothing is deleted on rerun — if a series drops out of
// AniList's current top-N popular list, its row just stays as-is.

import { createClient } from "@supabase/supabase-js";

// ── config — bump SERIES_LIMIT to import more later ─────────────────────
const SERIES_LIMIT = 500;
const PER_PAGE = 50; // AniList's Page query hard cap
const TOP_TAGS_PER_SERIES = 10;
const REQUEST_DELAY_MS = 1500; // courtesy delay between successful requests
const MAX_RETRIES_PER_PAGE = 5;
const UPSERT_CHUNK_SIZE = 500;
const FETCH_TIMEOUT_MS = 30_000;

const ANILIST_URL = "https://graphql.anilist.co";

// Curated, not "every externalLinks entry AniList tags STREAMING": that set
// also includes promo-only YouTube playlists and regional platforms (iQiyi,
// WeTV, Bilibili) that aren't a real "watch the whole series here" option
// for this app's audience. Keyed by AniList's own exact `site` string
// (confirmed live against the real API, not guessed), valued by the display
// name to store, handles real naming mismatches found the same way (e.g.
// AniList's "Amazon Prime Video"/"Disney Plus" vs. this app's shorter
// "Prime Video"/"Disney+"). Hand-maintained, same "retune by hand" precedent
// already used for --masthead-height/--mixer-bar-height in globals.css, not
// attempted as fuzzy matching: if a legitimate platform is missing here,
// add its exact AniList site string.
const STREAMING_ALLOW_LIST: Record<string, string> = {
  Crunchyroll: "Crunchyroll",
  Netflix: "Netflix",
  Hulu: "Hulu",
  "Amazon Prime Video": "Prime Video",
  Max: "Max",
  "Disney Plus": "Disney+",
  HIDIVE: "HIDIVE",
};

const PAGE_QUERY = `
  query ($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        hasNextPage
        currentPage
        lastPage
        total
      }
      media(sort: POPULARITY_DESC, type: ANIME, isAdult: false) {
        id
        title {
          romaji
          english
          native
        }
        episodes
        startDate {
          year
        }
        coverImage {
          large
        }
        genres
        averageScore
        description(asHtml: false)
        externalLinks {
          site
          url
          type
          icon
          color
        }
        tags {
          id
          name
          rank
          isGeneralSpoiler
          isMediaSpoiler
          isAdult
          category
        }
      }
    }
  }
`;

interface AniListTag {
  id: number;
  name: string;
  rank: number | null;
  isGeneralSpoiler: boolean;
  isMediaSpoiler: boolean;
  isAdult: boolean;
  category: string | null;
}

interface AniListExternalLink {
  site: string;
  url: string;
  type: string | null; // "STREAMING" | "INFO" | "SOCIAL", per AniList's ExternalLinkType enum
  // Transparent 64x64 PNG on AniList's own CDN, per their own schema docs.
  // Nullable per that same schema ("not available for all links"), though
  // confirmed live across a 50-series sample that every allow-listed
  // platform (STREAMING_ALLOW_LIST, below) always has one, same URL every
  // time regardless of which series it's attached to (the URL itself
  // encodes AniList's own fixed per-site id, e.g. the "5-" in Crunchyroll's
  // own icon path), consistent with this being a property of the site
  // itself, not of any one (series, platform) pairing.
  icon: string | null;
  // The site's own brand color (hex), same "property of the site, not the
  // pairing" behavior as icon, confirmed live the same way: every
  // allow-listed platform had exactly one consistent, non-null value
  // across the same 50-series sample (Crunchyroll #F88B24, Netflix
  // #E50914, Hulu #1CE783, etc). Nullable anyway, same reasoning as icon,
  // AniList's schema doesn't guarantee it for every link.
  color: string | null;
}

interface AniListMedia {
  id: number;
  title: { romaji: string | null; english: string | null; native: string | null };
  episodes: number | null;
  startDate: { year: number | null } | null;
  coverImage: { large: string | null } | null;
  genres: string[] | null;
  // 0-100, AniList's own weighted-average viewer score. Null for media with
  // too few scores (e.g. very new/unreleased) — genuinely absent, not 0.
  averageScore: number | null;
  // Raw prose summary, asHtml:false, still contains literal <br> tags and
  // often a trailing "(Source: ...)" citation in practice (confirmed live
  // against the real API), cleaned up by cleanDescription() below before
  // it's ever stored.
  description: string | null;
  externalLinks: AniListExternalLink[] | null;
  tags: AniListTag[] | null;
}

interface PageData {
  Page: {
    pageInfo: { hasNextPage: boolean; currentPage: number; lastPage: number; total: number };
    media: AniListMedia[];
  };
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string; status?: number }[];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// AniList's raw description text, cleaned up for plain-text rendering (the
// app uses CSS white-space handling, never dangerouslySetInnerHTML, so raw
// HTML has no use once stored, see 0007_add_series_description.sql).
function cleanDescription(raw: string | null): string | null {
  if (!raw) return null;
  let text = raw;
  // AniList's own spoiler markup, remove the wrapped text entirely, not
  // just the ~! !~ delimiters. This is a short teaser summary, not a
  // plot-details view, so unmasking spoiler text isn't the right default.
  // Runs first, so a general tag-strip below never has to reason about tags
  // that might appear inside a spoiler-wrapped span.
  text = text.replace(/~![\s\S]*?!~/g, "");
  // Literal <br>/<br/>/<br /> tags (present even with asHtml:false) become
  // real newlines, so CSS white-space:pre-line can render them as line
  // breaks without needing to render actual HTML. Has to run BEFORE the
  // general tag-strip below, not after: that pass removes tag markup with
  // no replacement at all, so <br> would just vanish (no line break left
  // behind) if it ran first instead of being converted here.
  text = text.replace(/<br\s*\/?>/gi, "\n");
  // General HTML-tag strip, not an allow-list of specific tags. The
  // earlier version only ever handled <br>, so any other inline tag
  // AniList's markup includes (<i>, <b>, <a href="...">, etc.) passed
  // straight through untouched, confirmed live on real cards (e.g. a
  // literal "<i>Fairy Tail</i>" in one description) once this was reported
  // as a bug. Strips the tag markup itself, keeps the text between tags
  // (e.g. "<i>Fairy Tail</i>" becomes "Fairy Tail", not empty).
  text = text.replace(/<[^>]+>/g, "");
  // Trailing "(Source: Crunchyroll)"-style citation, AniList's own
  // convention, not part of the actual summary. Runs after the general
  // tag-strip, in case the citation itself is ever wrapped in a tag.
  text = text.replace(/\(Source:[^)]*\)\s*$/i, "");
  // Collapse runs of 3+ newlines (left behind by the strips above) down to
  // one blank line, and trim the edges.
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text.length > 0 ? text : null;
}

// Filters AniList's own externalLinks down to this app's curated
// STREAMING_ALLOW_LIST, see that constant's own comment for why this isn't
// just "every type: STREAMING link." Drops any entry whose url isn't a
// plain https link too, defensive: this ends up as a stored, later-rendered
// <a href>, and there's no reason a legitimate streaming link would ever be
// anything else.
function streamServicesFor(media: AniListMedia): { name: string; url: string; icon: string | null; color: string | null }[] {
  const seen = new Set<string>();
  const out: { name: string; url: string; icon: string | null; color: string | null }[] = [];
  for (const link of media.externalLinks ?? []) {
    if (link.type !== "STREAMING" || !(link.site in STREAMING_ALLOW_LIST) || !link.url.startsWith("https://")) continue;
    const name = STREAMING_ALLOW_LIST[link.site];
    // Defensive dedupe, same reasoning as the per-series tag dedupe below:
    // a malformed/duplicate externalLinks entry (e.g. two regional
    // Crunchyroll URLs) shouldn't produce two rows for the same platform.
    if (seen.has(name)) continue;
    seen.add(name);
    // icon/color come straight from AniList's own link entry, the same as
    // url, not hardcoded into STREAMING_ALLOW_LIST the way name is: unlike
    // the display name (which genuinely needs a manual override for cases
    // like "Amazon Prime Video" to "Prime Video"), both are already
    // exactly what this app wants as-is, confirmed live, so there's
    // nothing to correct.
    out.push({ name, url: link.url, icon: link.icon, color: link.color });
  }
  return out;
}

async function fetchPage(page: number, perPage: number): Promise<PageData> {
  for (let attempt = 1; attempt <= MAX_RETRIES_PER_PAGE; attempt++) {
    const res = await fetch(ANILIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: PAGE_QUERY, variables: { page, perPage } }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after")) || 60;
      console.warn(`  rate limited on page ${page} (attempt ${attempt}/${MAX_RETRIES_PER_PAGE}) — waiting ${retryAfter}s...`);
      await sleep(retryAfter * 1000);
      continue;
    }

    const json = (await res.json()) as GraphQLResponse<PageData>;
    if (!res.ok || json.errors) {
      const message = json.errors?.map((e) => e.message).join("; ") ?? res.statusText;
      throw new Error(`AniList request failed on page ${page}: ${message}`);
    }
    if (!json.data) {
      throw new Error(`AniList request for page ${page} returned no data`);
    }
    return json.data;
  }
  throw new Error(`Gave up on page ${page} after ${MAX_RETRIES_PER_PAGE} rate-limited attempts`);
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY environment variables.");
  }
  const supabase = createClient(supabaseUrl, secretKey);

  console.log(`Importing up to ${SERIES_LIMIT} series from AniList (perPage=${PER_PAGE})...`);

  // ── fetch all requested pages ──────────────────────────────────────────
  const totalPages = Math.ceil(SERIES_LIMIT / PER_PAGE);
  const allMedia: AniListMedia[] = [];

  for (let page = 1; page <= totalPages; page++) {
    console.log(`Fetching page ${page}/${totalPages}...`);
    const data = await fetchPage(page, PER_PAGE);
    allMedia.push(...data.Page.media);
    console.log(`  got ${data.Page.media.length} series (running total: ${allMedia.length})`);

    if (!data.Page.pageInfo.hasNextPage) {
      console.log("  AniList reports no more pages available.");
      break;
    }
    if (page < totalPages) await sleep(REQUEST_DELAY_MS);
  }

  const series = allMedia.slice(0, SERIES_LIMIT);
  console.log(`Fetched ${series.length} series total.\n`);

  // ── build tag selections per series + the deduped global tag set ──────
  const tagsByAnilistId = new Map<number, { anilist_id: number; name: string; category: string | null }>();
  const seriesTagSelections = new Map<number, { anilistTagId: number; rank: number }[]>();
  let seriesWithNoTags = 0;

  for (const media of series) {
    const validTags = (media.tags ?? []).filter(
      (t) => t.rank != null && !t.isGeneralSpoiler && !t.isMediaSpoiler && !t.isAdult,
    );

    // Dedupe by tag id within this one series — defensive against a
    // malformed/duplicate tag entry, which would otherwise make one upsert
    // batch touch the same (series_id, tag_id) row twice; Postgres rejects
    // that ("ON CONFLICT DO UPDATE command cannot affect row a second time").
    const uniqueByTagId = new Map<number, AniListTag>();
    for (const t of validTags) if (!uniqueByTagId.has(t.id)) uniqueByTagId.set(t.id, t);

    const topTags = [...uniqueByTagId.values()]
      .sort((a, b) => (b.rank as number) - (a.rank as number))
      .slice(0, TOP_TAGS_PER_SERIES);

    if (topTags.length === 0) {
      seriesWithNoTags++;
      console.warn(`  warning: "${media.title.romaji ?? `AniList #${media.id}`}" has 0 usable tags after filtering`);
    }

    for (const t of topTags) {
      if (!tagsByAnilistId.has(t.id)) tagsByAnilistId.set(t.id, { anilist_id: t.id, name: t.name, category: t.category });
    }

    seriesTagSelections.set(
      media.id,
      topTags.map((t) => ({ anilistTagId: t.id, rank: t.rank as number })),
    );
  }

  console.log(`Found ${tagsByAnilistId.size} unique tags across the batch.`);
  if (seriesWithNoTags > 0) {
    console.warn(`${seriesWithNoTags} series have no usable tags after filtering.`);
  }
  console.log("");

  // ── phase 1: upsert tags ───────────────────────────────────────────────
  console.log("Upserting tags...");
  const tagIdMap = new Map<number, string>(); // anilist tag id -> uuid
  for (const batch of chunk([...tagsByAnilistId.values()], UPSERT_CHUNK_SIZE)) {
    const { data, error } = await supabase.from("tags").upsert(batch, { onConflict: "anilist_id" }).select("id, anilist_id");
    if (error) throw new Error(`Tag upsert failed: ${error.message}`);
    for (const row of data ?? []) tagIdMap.set(row.anilist_id, row.id);
  }
  console.log(`  upserted ${tagIdMap.size} tags.\n`);

  // ── phase 2: upsert series ──────────────────────────────────────────────
  console.log("Upserting series...");
  const seriesRows = series.map((media) => ({
    anilist_id: media.id,
    title_romaji: media.title.romaji ?? `Untitled (AniList #${media.id})`,
    title_english: media.title.english,
    title_native: media.title.native,
    year: media.startDate?.year ?? null,
    episodes: media.episodes ?? null,
    cover_image_url: media.coverImage?.large ?? null,
    genres: media.genres ?? [],
    average_score: media.averageScore ?? null,
    description: cleanDescription(media.description),
    streaming_services: streamServicesFor(media),
  }));

  const seriesIdMap = new Map<number, string>(); // anilist media id -> uuid
  for (const batch of chunk(seriesRows, UPSERT_CHUNK_SIZE)) {
    const { data, error } = await supabase.from("series").upsert(batch, { onConflict: "anilist_id" }).select("id, anilist_id");
    if (error) throw new Error(`Series upsert failed: ${error.message}`);
    for (const row of data ?? []) seriesIdMap.set(row.anilist_id, row.id);
  }
  console.log(`  upserted ${seriesIdMap.size} series.\n`);

  // ── phase 3: upsert series_tags (needs both maps from above) ───────────
  console.log("Upserting series-tag links...");
  const seriesTagRows: { series_id: string; tag_id: string; rank: number }[] = [];
  for (const [anilistMediaId, selections] of seriesTagSelections) {
    const seriesUuid = seriesIdMap.get(anilistMediaId);
    if (!seriesUuid) continue; // shouldn't happen; don't fail the whole run over one row
    for (const { anilistTagId, rank } of selections) {
      const tagUuid = tagIdMap.get(anilistTagId);
      if (!tagUuid) continue;
      seriesTagRows.push({ series_id: seriesUuid, tag_id: tagUuid, rank });
    }
  }

  let linkCount = 0;
  for (const batch of chunk(seriesTagRows, UPSERT_CHUNK_SIZE)) {
    const { error } = await supabase.from("series_tags").upsert(batch, { onConflict: "series_id,tag_id" });
    if (error) throw new Error(`series_tags upsert failed: ${error.message}`);
    linkCount += batch.length;
  }
  console.log(`  upserted ${linkCount} series-tag links.\n`);

  console.log(`Done. ${seriesIdMap.size} series, ${tagIdMap.size} tags, ${linkCount} series-tag links.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

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
const SERIES_LIMIT = 50;
const PER_PAGE = 50; // AniList's Page query hard cap
const TOP_TAGS_PER_SERIES = 10;
const REQUEST_DELAY_MS = 1500; // courtesy delay between successful requests
const MAX_RETRIES_PER_PAGE = 5;
const UPSERT_CHUNK_SIZE = 500;
const FETCH_TIMEOUT_MS = 30_000;

const ANILIST_URL = "https://graphql.anilist.co";

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
        tags {
          id
          name
          rank
          isGeneralSpoiler
          isMediaSpoiler
          isAdult
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
}

interface AniListMedia {
  id: number;
  title: { romaji: string | null; english: string | null; native: string | null };
  episodes: number | null;
  startDate: { year: number | null } | null;
  coverImage: { large: string | null } | null;
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
  const tagsByAnilistId = new Map<number, { anilist_id: number; name: string }>();
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
      if (!tagsByAnilistId.has(t.id)) tagsByAnilistId.set(t.id, { anilist_id: t.id, name: t.name });
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

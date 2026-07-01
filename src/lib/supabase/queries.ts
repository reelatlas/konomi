import { supabase } from "./client";
import type { Series, TagInfo } from "@/lib/konomi/types";

// Raw shape of a `series` row with its tags embedded via PostgREST's
// resource-embedding syntax (series_tags -> tags), matching the schema in
// supabase/migrations/0001_init.sql (plus 0004/0005 for category/genres).
interface RawSeriesRow {
  title_romaji: string;
  title_english: string | null;
  year: number | null;
  episodes: number | null;
  cover_image_url: string | null;
  genres: string[];
  series_tags: { rank: number; tags: { name: string; category: string | null } | null }[] | null;
}

export interface Catalog {
  series: Series[];
  tags: TagInfo[];
  genres: string[];
}

// Fetches the whole catalog in one query and adapts it into the app's
// existing Series shape, so useKonomi/scoring never need to know the data
// came from a normalized tags/series_tags join rather than a flat array.
export async function getCatalog(): Promise<Catalog> {
  const { data, error } = await supabase
    .from("series")
    .select("title_romaji, title_english, year, episodes, cover_image_url, genres, series_tags(rank, tags(name, category))")
    .order("title_romaji", { ascending: true })
    .returns<RawSeriesRow[]>();

  if (error) {
    throw new Error(`Failed to load series catalog from Supabase: ${error.message}`);
  }

  const rows = data ?? [];

  // seriesCount/avgRank are computed here from the same fetch rather than
  // stored in the DB — they're derived stats over series_tags, not facts
  // about a tag on its own, so they'd go stale the moment the catalog
  // changed if we materialized them as columns.
  const tagStats = new Map<string, { category: string | null; rankSum: number; count: number }>();
  const allGenreNames = new Set<string>();

  const series: Series[] = rows.map((row) => {
    const seriesTags = (row.series_tags ?? [])
      .filter((st): st is { rank: number; tags: { name: string; category: string | null } } => Boolean(st.tags))
      .sort((a, b) => b.rank - a.rank);

    for (const st of seriesTags) {
      const existing = tagStats.get(st.tags.name);
      if (existing) {
        existing.rankSum += st.rank;
        existing.count += 1;
      } else {
        tagStats.set(st.tags.name, { category: st.tags.category, rankSum: st.rank, count: 1 });
      }
    }

    const genres = row.genres ?? [];
    genres.forEach((g) => allGenreNames.add(g));

    return {
      title: row.title_english ?? row.title_romaji,
      year: row.year,
      eps: row.episodes,
      tags: seriesTags.map((st) => st.tags.name),
      coverImageUrl: row.cover_image_url,
      genres,
    };
  });

  const tags: TagInfo[] = [...tagStats.entries()]
    .map(([name, stat]) => ({
      name,
      category: stat.category,
      seriesCount: stat.count,
      avgRank: stat.rankSum / stat.count,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { series, tags, genres: [...allGenreNames].sort() };
}

import { supabase } from "./client";
import type { Series } from "@/lib/konomi/types";

// Raw shape of a `series` row with its tags embedded via PostgREST's
// resource-embedding syntax (series_tags -> tags), matching the schema in
// supabase/migrations/0001_init.sql.
interface RawSeriesRow {
  title_romaji: string;
  title_english: string | null;
  year: number | null;
  episodes: number | null;
  cover_image_url: string | null;
  series_tags: { rank: number; tags: { name: string } | null }[] | null;
}

export interface Catalog {
  series: Series[];
  tags: string[];
}

// Fetches the whole catalog in one query and adapts it into the app's
// existing Series shape, so useKonomi/scoring never need to know the data
// came from a normalized tags/series_tags join rather than a flat array.
export async function getCatalog(): Promise<Catalog> {
  const { data, error } = await supabase
    .from("series")
    .select("title_romaji, title_english, year, episodes, cover_image_url, series_tags(rank, tags(name))")
    .order("title_romaji", { ascending: true })
    .returns<RawSeriesRow[]>();

  if (error) {
    throw new Error(`Failed to load series catalog from Supabase: ${error.message}`);
  }

  const rows = data ?? [];
  const allTagNames = new Set<string>();

  const series: Series[] = rows.map((row) => {
    const tags = (row.series_tags ?? [])
      .filter((st): st is { rank: number; tags: { name: string } } => Boolean(st.tags))
      .sort((a, b) => b.rank - a.rank)
      .map((st) => st.tags.name);

    tags.forEach((t) => allTagNames.add(t));

    return {
      title: row.title_english ?? row.title_romaji,
      year: row.year,
      eps: row.episodes,
      tags,
      coverImageUrl: row.cover_image_url,
    };
  });

  return { series, tags: [...allTagNames].sort() };
}

import type { NextRequest } from "next/server";
import { DEFAULT_RESULT_COUNT, SLOT_COUNT } from "@/lib/konomi/config";
import type { Series } from "@/lib/konomi/types";
import { supabase } from "@/lib/supabase/client";
import { adaptFilmRow, type RawFilmRow } from "@/lib/supabase/filmQueries";

// GET /api/pool?side=film&tags=<id>&tags=<id>&min=<1-3>&exclude=<id>&exclude=<id>
//
// `tags`/`exclude` are REPEATED params, not comma-joined: two keyword ids
// carry commas ("kw:based on song, poem or rhyme"), measured when the
// first comma-split draft was checked against the catalog.
//
// The remote half of the reducer's pool mode (useKonomi.ts): "how many
// films qualify for this mix, minus what is on screen", plus a random
// sample of them, straight from recommend_films (migration 0013). The
// reducer never scores the film catalog client-side any more, so this is
// what /film can afford to not prerender. Anime is still scored in the
// browser (0.76 MB packed is fine), hence the side check — one code path
// per side until the anime catalog is worth the same treatment.
//
// Every id is validated against THE IDENTITY CONTRACT prefixes (types.ts)
// before it reaches the database; the function parses by prefix, so a
// stray id would only ever score zero, but a 400 is the honest answer.
// No caching: the sample is random by design, and the exclusions are per
// screen state.

const FILM_TAG_ID = /^tmdb-(tag|genre|synth):./;
const FILM_SERIES_ID = /^tmdb:\d+$/;
const MAX_EXCLUDE = 50;

function bad(message: string): Response {
  return Response.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
}

function list(raw: string[]): string[] {
  return raw.map((s) => s.trim()).filter(Boolean);
}

type RecommendRow = RawFilmRow & { total: number; tag_keys: string[] | null };

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;

  if (q.get("side") !== "film") return bad("only side=film is served here");

  const tags = [...new Set(list(q.getAll("tags")))];
  if (tags.length === 0 || tags.length > SLOT_COUNT) return bad(`tags: 1 to ${SLOT_COUNT} ids`);
  if (!tags.every((t) => FILM_TAG_ID.test(t))) return bad("tags: film tag ids only");

  const min = Number(q.get("min"));
  if (!Number.isInteger(min) || min < 1 || min > SLOT_COUNT) return bad(`min: 1 to ${SLOT_COUNT}`);

  const exclude = [...new Set(list(q.getAll("exclude")))];
  if (exclude.length > MAX_EXCLUDE) return bad(`exclude: at most ${MAX_EXCLUDE} ids`);
  if (!exclude.every((e) => FILM_SERIES_ID.test(e))) return bad("exclude: film ids only");

  const { data, error } = await supabase.rpc("recommend_films", {
    tag_ids: tags,
    min_match: min,
    exclude_ids: exclude,
    sample_n: DEFAULT_RESULT_COUNT,
  });
  if (error) {
    console.error("recommend_films failed", error);
    return Response.json({ error: "pool unavailable" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }

  const rows = (data ?? []) as RecommendRow[];
  // total rides on every row; no rows means nothing qualified (the sample
  // is drawn from the counted set, so the two can't disagree).
  const total = rows[0]?.total ?? 0;
  const sample: Series[] = rows.map((row) => adaptFilmRow(row, row.tag_keys ?? []));

  return Response.json({ total, sample }, { headers: { "Cache-Control": "no-store" } });
}

// Promotes the raw TMDB landing into the film-side shared catalog partition
// (films / film_tags / film_tag_links — migration 0012).
//
// Reads three inputs, writes one output, holds no opinions of its own:
//   raw_tmdb_movies              the untouched jsonb landing (ingest layer)
//   tag-rules/master.json        the keyword alias map (1,120 canonicals)
//   tag-rules/adapter-config.json  every promote knob (floors, levels, bands)
//
// FULL REBUILD by design: deletes and re-fills the three catalog tables on
// every run. All decisions live in the two JSON files, so retuning a floor is
// an edit + re-run, never a migration. Run: npm run promote:tmdb
//
// Era-defining implements the LOCKED §8 recipe (DATA_SOURCING): m=1000
// Bayesian shrink toward the corpus mean, top 2% within decade at vc>=2000,
// union the impact path (va>=8.0 & vc>=2000), recency guard from fetched_at.
// All other reception tags are per-film raw-field thresholds (MVP ruling).

import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type Canonical = {
  canonical: string;
  pillar: string;
  section: string;
  members: string[];
};
type Master = { pillar_tree: Record<string, string[]>; canonicals: Canonical[] };

type RawRow = {
  tmdb_id: number;
  fetched_at: string;
  payload: {
    title?: string;
    original_title?: string;
    release_date?: string;
    runtime?: number;
    vote_average?: number;
    vote_count?: number;
    popularity?: number;
    budget?: number;
    revenue?: number;
    overview?: string;
    tagline?: string;
    poster_path?: string;
    backdrop_path?: string;
    original_language?: string;
    genres?: { id: number; name: string }[];
    production_countries?: { iso_3166_1: string; name: string }[];
    production_companies?: { id: number; name: string }[];
    belongs_to_collection?: { id: number; name: string } | null;
    keywords?: { keywords?: { id: number; name: string }[] };
    credits?: {
      cast?: { id: number; name: string; order: number }[];
      crew?: { id: number; name: string; job: string }[];
    };
    release_dates?: { results?: { iso_3166_1: string; release_dates?: { certification?: string; type?: number }[] }[] };
    "watch/providers"?: { results?: Record<string, { link?: string; flatrate?: { provider_name: string; logo_path: string }[] }> };
  };
};

const ROOT = process.cwd(); // npm scripts run from the repo root
const master: Master = JSON.parse(readFileSync(path.join(ROOT, "tag-rules/master.json"), "utf8"));
const config = JSON.parse(readFileSync(path.join(ROOT, "tag-rules/adapter-config.json"), "utf8"));

const KW_BUFF_FLOOR: number = config.levels["film buff"].floor; // 55
const SAGA_SHELF_FLOOR: number = config.sagas.shelf_floor; // 2
const CREDIT_FLOOR: number = config.credits.floor; // 3
const ACTOR_ORDER_BAND = 10;

// crew job -> tag type (the §7 category set; writers measured dead, excluded)
const CREW_JOBS: Record<string, string> = {
  Director: "director",
  Producer: "producer",
  "Director of Photography": "cinematographer",
  "Original Music Composer": "composer",
};

const stringToCanonical = new Map<string, Canonical>();
for (const c of master.canonicals) for (const m of c.members) stringToCanonical.set(m, c);

function decadeOf(year: number | null): string | null {
  if (!year) return null;
  if (year < 1920) return "pre-1920s";
  return `${Math.floor(year / 10) * 10}s`;
}

function usCertification(p: RawRow["payload"]): string | null {
  const us = p.release_dates?.results?.find((r) => r.iso_3166_1 === "US");
  if (!us?.release_dates) return null;
  // prefer theatrical (type 3), else first non-empty
  const sorted = [...us.release_dates].sort((a, b) => (a.type === 3 ? -1 : 0) - (b.type === 3 ? -1 : 0));
  for (const rd of sorted) if (rd.certification) return rd.certification;
  return null;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.");
  const supabase = createClient(supabaseUrl, secretKey);

  // ---- 1. scan the raw landing (paged; never held whole)
  type FilmRow = Record<string, unknown> & { tmdb_id: number };
  const films: FilmRow[] = [];
  const filmTagKeys = new Map<number, Set<string>>(); // tmdb_id -> tag keys
  const tagMeta = new Map<string, { type: string; name: string; pillar?: string; section?: string; extra?: object; count: number }>();
  const shrunkInputs: { tmdb_id: number; year: number | null; va: number; vc: number }[] = [];
  let latestFetch = "";

  const touch = (key: string, meta: { type: string; name: string; pillar?: string; section?: string; extra?: object }, filmId: number) => {
    const set = filmTagKeys.get(filmId)!;
    if (set.has(key)) return;
    set.add(key);
    const m = tagMeta.get(key);
    if (m) m.count++;
    else tagMeta.set(key, { ...meta, count: 1 });
  };

  for (let off = 0; ; off += 500) {
    const { data, error } = await supabase
      .from("raw_tmdb_movies")
      .select("tmdb_id, fetched_at, payload")
      .order("tmdb_id")
      .range(off, off + 499);
    if (error) throw new Error(`raw scan: ${error.message}`);
    const rows = (data ?? []) as RawRow[];
    for (const row of rows) {
      const p = row.payload;
      if (row.fetched_at > latestFetch) latestFetch = row.fetched_at;
      const year = p.release_date ? Number(p.release_date.slice(0, 4)) || null : null;
      const va = p.vote_average ?? 0;
      const vc = p.vote_count ?? 0;
      const budget = p.budget ?? 0;
      const revenue = p.revenue ?? 0;
      filmTagKeys.set(row.tmdb_id, new Set());

      // reception — the 13 per-film thresholds (era-defining joins in pass 2)
      const reception: string[] = [];
      if (va >= 7.2 && vc >= 2000) reception.push("acclaimed");
      if (va >= 4.5 && va <= 6.5 && vc >= 600) reception.push("divisive");
      if (vc >= 3000) reception.push("famous");
      if (va >= 7.2 && vc >= 100 && vc <= 800) reception.push("underseen");
      if (va >= 7.2 && vc > 800 && vc <= 2500) reception.push("niche favourite");
      if (budget > 10_000 && revenue > 10_000) {
        const ratio = revenue / budget;
        if (ratio >= 5) reception.push("mega-roi");
        else if (ratio >= 2.5) reception.push("hit");
        else if (ratio >= 1) reception.push("broke-even");
        else reception.push("flop");
      }
      if (budget >= 100_000_000) reception.push("big-budget");
      shrunkInputs.push({ tmdb_id: row.tmdb_id, year, va, vc });

      // saga
      const coll = p.belongs_to_collection;
      const sagaName = coll?.name ? coll.name.replace(/ Collection$/i, "") : null;
      if (coll?.id) touch(`saga:${coll.id}`, { type: "saga", name: sagaName!, extra: { tmdb_collection_id: coll.id } }, row.tmdb_id);

      // kw canonicals via the alias map. trim(): 26 raw TMDB keyword strings
      // carry stray trailing spaces ("oil rig ") — the map holds trimmed forms.
      for (const k of p.keywords?.keywords ?? []) {
        const c = stringToCanonical.get(k.name.trim());
        if (c) touch(`kw:${c.canonical}`, { type: "kw", name: c.canonical, pillar: c.pillar, section: c.section }, row.tmdb_id);
      }

      // credits
      for (const cast of p.credits?.cast ?? [])
        if (cast.order < ACTOR_ORDER_BAND) touch(`person:actor:${cast.id}`, { type: "actor", name: cast.name, extra: { tmdb_person_id: cast.id } }, row.tmdb_id);
      for (const crew of p.credits?.crew ?? []) {
        const t = CREW_JOBS[crew.job];
        if (t) touch(`person:${t}:${crew.id}`, { type: t, name: crew.name, extra: { tmdb_person_id: crew.id } }, row.tmdb_id);
      }
      for (const co of p.production_companies ?? [])
        touch(`studio:${co.id}`, { type: "studio", name: co.name, extra: { tmdb_company_id: co.id } }, row.tmdb_id);

      // providers: US flatrate only + link (JustWatch attribution required in UI)
      const us = p["watch/providers"]?.results?.US;
      const providers = (us?.flatrate ?? []).map((f) => ({ name: f.provider_name, logo_path: f.logo_path }));

      films.push({
        tmdb_id: row.tmdb_id,
        title: p.title ?? p.original_title ?? String(row.tmdb_id),
        original_title: p.original_title ?? null,
        year,
        decade: decadeOf(year),
        runtime: p.runtime ?? null,
        rating: va || null,
        vote_count: vc || null,
        genres: (p.genres ?? []).map((g) => g.name),
        reception,
        certification: usCertification(p),
        original_language: p.original_language ?? null,
        countries: (p.production_countries ?? []).map((c) => c.name),
        saga_name: sagaName,
        saga_shelf: false, // filled after saga counts are known
        overview: p.overview ?? null,
        tagline: p.tagline ?? null,
        poster_path: p.poster_path ?? null,
        backdrop_path: p.backdrop_path ?? null,
        budget: budget || null,
        revenue: revenue || null,
        watch_providers: providers,
        watch_link: us?.link ?? null,
      });
    }
    if (rows.length < 500) break;
  }
  console.log(`scanned ${films.length} films · latest fetch ${latestFetch}`);

  // ---- 2. era-defining (locked §8): shrink, top 2% within decade, impact path, recency guard
  const C = shrunkInputs.reduce((s, x) => s + x.va, 0) / shrunkInputs.length;
  const M = 1000;
  const guardYear = Number(latestFetch.slice(0, 4)) - 2;
  const byDecade = new Map<string, { tmdb_id: number; shrunk: number; va: number; vc: number; year: number | null }[]>();
  for (const x of shrunkInputs) {
    const d = decadeOf(x.year) ?? "unknown";
    const shrunk = (x.vc * x.va + M * C) / (x.vc + M);
    if (!byDecade.has(d)) byDecade.set(d, []);
    byDecade.get(d)!.push({ ...x, shrunk });
  }
  const eraDefining = new Set<number>();
  for (const [, list] of byDecade) {
    const cut = Math.max(1, Math.round(list.length * 0.02));
    const eligible = list.filter((x) => x.vc >= 2000).sort((a, b) => b.shrunk - a.shrunk);
    for (const x of eligible.slice(0, cut)) eraDefining.add(x.tmdb_id);
  }
  for (const x of shrunkInputs) if (x.va >= 8.0 && x.vc >= 2000) eraDefining.add(x.tmdb_id); // impact path
  for (const x of shrunkInputs) if ((x.year ?? 0) > guardYear && eraDefining.has(x.tmdb_id)) eraDefining.delete(x.tmdb_id);
  for (const f of films) if (eraDefining.has(f.tmdb_id)) (f.reception as string[]).push("era-defining");
  console.log(`era-defining: ${eraDefining.size} films (expected ~205) · corpus mean ${C.toFixed(3)} · guard <= ${guardYear}`);

  // ---- 3. floors + levels
  const keepTag = (key: string, m: { type: string; count: number }) => {
    if (m.type === "kw") return true; // data floor >=3 already enforced upstream in master
    if (m.type === "saga") return m.count >= SAGA_SHELF_FLOOR;
    return m.count >= CREDIT_FLOOR; // people + studios
  };
  const minLevel = (m: { type: string; count: number }) => {
    if (m.type === "kw") return m.count >= KW_BUFF_FLOOR ? "film buff" : "cinephile";
    if (m.type === "saga") return "moviegoer";
    return "film buff";
  };
  const keptKeys = new Map<string, { type: string; name: string; pillar?: string; section?: string; extra?: object; count: number }>();
  for (const [key, m] of tagMeta) if (keepTag(key, m)) keptKeys.set(key, m);
  const shelfSagas = new Set([...keptKeys.keys()].filter((k) => k.startsWith("saga:")));
  for (const f of films) {
    const keys = filmTagKeys.get(f.tmdb_id)!;
    f.saga_shelf = [...keys].some((k) => k.startsWith("saga:") && shelfSagas.has(k));
  }
  const byType: Record<string, number> = {};
  for (const m of keptKeys.values()) byType[m.type] = (byType[m.type] ?? 0) + 1;
  console.log("kept tags by type:", JSON.stringify(byType));

  // ---- 4. full rebuild write
  console.log("rebuilding catalog tables…");
  for (const table of ["film_tag_links", "film_tags", "films"]) {
    const { error } = await supabase.from(table).delete().gte("created_at", "1970-01-01");
    if (error) throw new Error(`clear ${table}: ${error.message}`);
  }

  const idByTmdb = new Map<number, string>();
  for (let i = 0; i < films.length; i += 500) {
    const batch = films.slice(i, i + 500);
    const { data, error } = await supabase.from("films").insert(batch).select("id, tmdb_id");
    if (error) throw new Error(`films insert: ${error.message}`);
    for (const r of data ?? []) idByTmdb.set(r.tmdb_id, r.id);
  }
  console.log(`inserted ${idByTmdb.size} films`);

  const tagRows = [...keptKeys.entries()].map(([key, m]) => ({
    key, type: m.type, name: m.name,
    pillar: m.pillar ?? null, section: m.section ?? null,
    film_count: m.count, min_level: minLevel(m), extra: m.extra ?? null,
  }));
  const idByKey = new Map<string, string>();
  for (let i = 0; i < tagRows.length; i += 500) {
    const batch = tagRows.slice(i, i + 500);
    const { data, error } = await supabase.from("film_tags").insert(batch).select("id, key");
    if (error) throw new Error(`film_tags insert: ${error.message}`);
    for (const r of data ?? []) idByKey.set(r.key, r.id);
  }
  console.log(`inserted ${idByKey.size} film_tags`);

  const links: { film_id: string; tag_id: string }[] = [];
  for (const [tmdbId, keys] of filmTagKeys) {
    const fid = idByTmdb.get(tmdbId);
    if (!fid) continue;
    for (const k of keys) {
      const tid = idByKey.get(k);
      if (tid) links.push({ film_id: fid, tag_id: tid });
    }
  }
  for (let i = 0; i < links.length; i += 1000) {
    const { error } = await supabase.from("film_tag_links").insert(links.slice(i, i + 1000));
    if (error) throw new Error(`links insert: ${error.message}`);
  }
  console.log(`inserted ${links.length} film_tag_links`);

  // ---- 5. cross-checks (against adapter-config expectations + §7 coverage)
  const kwCount = byType["kw"] ?? 0;
  const kwBuff = tagRows.filter((t) => t.type === "kw" && t.min_level === "film buff").length;
  const covered = (type: string) => {
    const keys = new Set(tagRows.filter((t) => t.type === type).map((t) => t.key));
    let n = 0;
    for (const [, set] of filmTagKeys) if ([...set].some((k) => keys.has(k))) n++;
    return ((100 * n) / films.length).toFixed(1);
  };
  console.log("--- cross-checks ---");
  console.log(`kw tags ${kwCount} (expect 1120) · kw at buff ${kwBuff} (expect 404)`);
  console.log(`sagas ${byType["saga"] ?? 0} (expect 594) · films with saga_name ${films.filter((f) => f.saga_name).length} (expect 2170)`);
  console.log(`coverage: actors ${covered("actor")}% (§7 95.3) · directors ${covered("director")}% (§7 85.3) · studios ${covered("studio")}% (§7 92.4) · producers ${covered("producer")}% (§7 78.4) · cinematographers ${covered("cinematographer")}% (§7 72.6) · composers ${covered("composer")}% (§7 69.9)`);
  console.log(`certification present: ${films.filter((f) => f.certification).length} films · providers present: ${films.filter((f) => (f.watch_providers as unknown[]).length > 0).length} films`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

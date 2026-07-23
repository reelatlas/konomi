// The import delta report (adapter part 6) — run after every pull.
//
// Compares the raw landing against two baselines and renders a review page:
//   tag-rules/master.json    the alias map (what strings mean)
//   tag-rules/kw-seen.json   every keyword string seen by a previous report,
//                            with its film count (created on first run)
//
// Three sections, per the banked design:
//   1 AUTO-INTEGRATED  new strings that matched an existing member -> where
//                      they landed; per-canonical count drift vs master.json
//   2 MANUAL QUEUE     new >=3 strings with no member match, each with a
//                      suggested home (top co-occurring canonical) — the
//                      propose-first wave rhythm, institutionalized
//   3 IA PRESSURE      sections drifting in film count · sagas at the shelf
//                      floor boundary · biggest canonical drifts
//
// Pass --update to write the fresh scan back into kw-seen.json (do this after
// reviewing, so the next pull diffs against today).
// Run: npm run delta:tmdb  (add -- --update to accept the baseline)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

type Canonical = { canonical: string; pillar: string; section: string; count: number; members: string[] };
type Master = { pillar_tree: Record<string, string[]>; canonicals: Canonical[] };

const ROOT = process.cwd();
const master: Master = JSON.parse(readFileSync(path.join(ROOT, "tag-rules/master.json"), "utf8"));
const SEEN_PATH = path.join(ROOT, "tag-rules/kw-seen.json");
const UPDATE = process.argv.includes("--update");

const memberOf = new Map<string, Canonical>();
for (const c of master.canonicals) for (const m of c.members) memberOf.set(m, c);

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.");
  const supabase = createClient(supabaseUrl, secretKey);

  // fresh scan: keyword counts + per-film sets + saga counts
  const kwCount = new Map<string, number>();
  const filmKw: string[][] = [];
  const sagaCount = new Map<number, { name: string; n: number }>();
  let films = 0;
  for (let off = 0; ; off += 500) {
    const { data, error } = await supabase
      .from("raw_tmdb_movies")
      .select("tmdb_id, kws:payload->keywords->keywords, coll:payload->belongs_to_collection")
      .order("tmdb_id")
      .range(off, off + 499);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as { kws: { name: string }[] | null; coll: { id: number; name: string } | null }[]) {
      films++;
      // trim(): raw TMDB keywords can carry stray whitespace ("oil rig ") —
      // the alias map and the seen-baseline both hold trimmed forms.
      const names = (row.kws ?? []).map((k) => k.name.trim());
      filmKw.push(names);
      for (const n of new Set(names)) kwCount.set(n, (kwCount.get(n) ?? 0) + 1);
      if (row.coll?.id) {
        const c = sagaCount.get(row.coll.id) ?? { name: row.coll.name, n: 0 };
        c.n++;
        sagaCount.set(row.coll.id, c);
      }
    }
    if ((data ?? []).length < 500) break;
  }

  const firstRun = !existsSync(SEEN_PATH);
  const seen: Record<string, number> = firstRun ? {} : JSON.parse(readFileSync(SEEN_PATH, "utf8"));

  // 1 auto-integrated: new strings that matched a member
  const auto: { s: string; n: number; home: Canonical }[] = [];
  // 2 manual queue: new >=3 strings with no member
  const queue: { s: string; n: number; suggest: string }[] = [];
  for (const [s, n] of kwCount) {
    if (s in seen) continue;
    const home = memberOf.get(s);
    if (home) auto.push({ s, n, home });
    else if (n >= 3) {
      const co = new Map<string, number>();
      for (const names of filmKw) {
        if (!names.includes(s)) continue;
        for (const other of names) {
          const c = memberOf.get(other);
          if (c) co.set(c.canonical, (co.get(c.canonical) ?? 0) + 1);
        }
      }
      const best = [...co.entries()].sort((a, b) => b[1] - a[1])[0];
      queue.push({ s, n, suggest: best ? `${best[0]} (co-occurs ${best[1]}×)` : "no signal — fresh proposal needed" });
    }
  }

  // 3 IA pressure: canonical count drift vs master.json stored counts + saga boundary
  const drift: { c: Canonical; live: number; d: number }[] = [];
  for (const c of master.canonicals) {
    const mem = new Set(c.members);
    let live = 0;
    for (const names of filmKw) if (names.some((n) => mem.has(n))) live++;
    const d = live - c.count;
    if (d !== 0) drift.push({ c, live, d });
  }
  drift.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const graduating = [...sagaCount.values()].filter((c) => c.n === 1); // +1 film graduates them
  const newlyShelf = [...sagaCount.values()].filter((c) => c.n === 2);

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const chip = (t: string, n?: number | string) =>
    `<span class=chip>${esc(t)}${n !== undefined ? `<span class=c>${n}</span>` : ""}</span>`;
  const rows = (items: string[]) => items.map((i) => `<div class=row>${i}</div>`).join("");
  const html = `<title>Konomi — import delta report</title>
<style>
:root{--bg:#efe9f5;--fg:#191225;--soft:#4a4060;--line:#d9ccec;--card:#fcfaff;--acc:#3a2f6b}
@media(prefers-color-scheme:dark){:root{--bg:#16121c;--fg:#e6ddf0;--soft:#b0a4c4;--line:#332a40;--card:#211a2a;--acc:#c3b6e8}}
:root[data-theme=dark]{--bg:#16121c;--fg:#e6ddf0;--soft:#b0a4c4;--line:#332a40;--card:#211a2a;--acc:#c3b6e8}
:root[data-theme=light]{--bg:#efe9f5;--fg:#191225;--soft:#4a4060;--line:#d9ccec;--card:#fcfaff;--acc:#3a2f6b}
body{background:var(--bg);color:var(--fg);font:16px/1.5 ui-sans-serif,-apple-system,sans-serif;margin:0}
.wrap{max-width:72rem;margin:0 auto;padding:2rem 1.2rem}
h1{font-family:ui-serif,Georgia,serif;font-weight:500}
.band{margin:1.4rem 0 .5rem;padding:.45rem .8rem;font:700 .78rem ui-monospace,monospace;letter-spacing:.05em;text-transform:uppercase;color:#fff;background:var(--acc);border-radius:6px}
.card{border:1px solid var(--line);background:var(--card);border-radius:9px;padding:.7rem .9rem;margin:.4rem 0}
.row{padding:.15rem 0;font-size:.85rem}
.chip{display:inline-block;font-size:.78rem;padding:.14rem .45rem;border:1px solid var(--line);border-radius:5px;background:var(--bg);margin:.1rem .15rem}
.chip .c{font-family:ui-monospace,monospace;color:var(--soft);margin-left:.3rem;font-size:.85em}
.lede,.note{color:var(--soft);font-size:.9rem}
</style>
<div class=wrap>
<h1>Import delta report</h1>
<p class=lede>${new Date().toISOString().slice(0, 10)} · ${films.toLocaleString()} films scanned · ${kwCount.size.toLocaleString()} distinct keyword strings${firstRun ? " · <b>FIRST RUN — baseline created, deltas start with the next pull</b>" : ""}</p>
<div class=band>1 · auto-integrated (${auto.length} new strings landed by the alias map)</div>
<div class=card>${auto.length ? rows(auto.sort((a, b) => b.n - a.n).slice(0, 300).map((a) => `${chip(a.s, a.n)} → <b>${esc(a.home.canonical)}</b> <span class=note>[${esc(a.home.pillar)}/${esc(a.home.section)}]</span>`)) + (auto.length > 300 ? `<p class=note>…and ${auto.length - 300} more (first-run volume; steady-state pulls show dozens, not thousands)</p>` : "") : '<p class=note>none — no previously-unseen strings matched existing members</p>'}</div>
<div class=band>2 · manual queue (${queue.length} new ≥3 strings need a propose-first home)</div>
<div class=card>${queue.length ? rows(queue.sort((a, b) => b.n - a.n).map((q) => `${chip(q.s, q.n)} <span class=note>suggested: ${esc(q.suggest)}</span>`)) : '<p class=note>empty — every ≥3 string is already mapped</p>'}</div>
<div class=band>3 · IA pressure</div>
<div class=card>
<p class=note><b>Canonical count drift vs master.json</b> (top 20 of ${drift.length}; recompute master counts if these grow)</p>
${drift.length ? drift.slice(0, 20).map((d) => chip(d.c.canonical, `${d.c.count}→${d.live} (${d.d > 0 ? "+" : ""}${d.d})`)).join("") : '<p class=note>zero drift — live counts match master.json exactly</p>'}
<p class=note style="margin-top:.6rem"><b>Saga shelf boundary</b> — ${newlyShelf.length} sagas sit at exactly the ≥2 floor; ${graduating.length} singletons are one film away from graduating</p>
${newlyShelf.slice(0, 15).map((c) => chip(c.name.replace(/ Collection$/i, ""), c.n)).join("")}
</div>
<p class=note>Baseline: tag-rules/kw-seen.json${UPDATE ? " — UPDATED with this scan" : " — unchanged (pass --update after review to accept)"}</p>
</div>`;
  const out = path.join(ROOT, "delta-report.html");
  writeFileSync(out, html);
  if (UPDATE || firstRun) writeFileSync(SEEN_PATH, JSON.stringify(Object.fromEntries(kwCount), null, 0));
  console.log(`report: ${out}`);
  console.log(`auto-integrated ${auto.length} · manual queue ${queue.length} · drift rows ${drift.length} · sagas at floor ${newlyShelf.length}`);
  if (firstRun) console.log("first run: kw-seen.json baseline created");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { KonomiApp } from "@/components/konomi/KonomiApp";
import { packTags } from "@/lib/konomi/catalogWire";
import { getFilmTags } from "@/lib/supabase/filmQueries";

// Same 5-minute revalidate as the anime side — a re-run of the promote
// script shows up without a redeploy, without hitting Supabase per load.
export const revalidate = 300;

export default async function FilmPage() {
  // Tags and the film count only — no series. The film side scores in the
  // database (recommend_films, migration 0013) via /api/pool, so the
  // 8.5k-film catalog never ships to the client; see
  // docs/proposals/server-side-recommend.md. The anime side still packs its
  // (much smaller) catalog on the wire.
  const { tags, total } = await getFilmTags();

  if (total === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-[var(--space-3xl)] text-center font-mono text-[length:var(--text-base)] text-[var(--subtext)]">
        No films in the catalog yet — run <code className="mx-[var(--space-xs)] text-[var(--ink)]">npm run promote:tmdb</code> to populate it.
      </main>
    );
  }

  // Tags packed as tuples (catalogWire.ts): the People tags (13k of 15k)
  // still ride along for the pool UI, so the shape matters.
  return <KonomiApp side="film" data={{ kind: "remote", tags: packTags(tags), totalSeriesCount: total }} />;
}

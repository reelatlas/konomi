import { KonomiApp } from "@/components/konomi/KonomiApp";
import { packCatalog } from "@/lib/konomi/catalogWire";
import { getFilmCatalog } from "@/lib/supabase/filmQueries";

// Same 5-minute revalidate as the anime side — a re-run of the promote
// script shows up without a redeploy, without hitting Supabase per load.
export const revalidate = 300;

export default async function FilmPage() {
  const catalog = await getFilmCatalog();

  if (catalog.series.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-[var(--space-3xl)] text-center font-mono text-[length:var(--text-base)] text-[var(--subtext)]">
        No films in the catalog yet — run <code className="mx-[var(--space-xs)] text-[var(--ink)]">npm run promote:tmdb</code> to populate it.
      </main>
    );
  }

  // Packed on the server (catalogWire.ts): the same catalog, a fraction of
  // the prerendered bytes; KonomiApp unpacks it once on the client.
  return <KonomiApp side="film" catalog={packCatalog(catalog)} />;
}

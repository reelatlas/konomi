import { KonomiApp } from "@/components/konomi/KonomiApp";
import { getFilmCatalog } from "@/lib/supabase/filmQueries";

// Same 5-minute revalidate as the anime side — a re-run of the promote
// script shows up without a redeploy, without hitting Supabase per load.
export const revalidate = 300;

export default async function FilmPage() {
  const { series, tags } = await getFilmCatalog();

  if (series.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8 text-center font-mono text-sm text-neutral-500">
        No films in the catalog yet — run <code className="mx-1">npm run promote:tmdb</code> to populate it.
      </main>
    );
  }

  return <KonomiApp side="film" initialSeries={series} initialTags={tags} />;
}

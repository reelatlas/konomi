import { KonomiApp } from "@/components/konomi/KonomiApp";
import { getCatalog } from "@/lib/supabase/queries";

// Re-check Supabase for new/updated data at most every 5 minutes, so
// re-running the import script shows up without a redeploy — without
// hitting Supabase on every single page load.
export const revalidate = 300;

export default async function AnimePage() {
  const { series, tags } = await getCatalog();

  if (series.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8 text-center font-mono text-sm text-neutral-500">
        No series in the catalog yet — run <code className="mx-1">npm run import:anilist</code> to populate it.
      </main>
    );
  }

  return <KonomiApp side="anime" initialSeries={series} initialTags={tags} />;
}

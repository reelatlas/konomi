import { KonomiApp } from "@/components/konomi/KonomiApp";
import { packCatalog } from "@/lib/konomi/catalogWire";
import { getCatalog } from "@/lib/supabase/queries";

// Re-check Supabase for new/updated data at most every 5 minutes, so
// re-running the import script shows up without a redeploy — without
// hitting Supabase on every single page load.
export const revalidate = 300;

export default async function AnimePage() {
  const catalog = await getCatalog();

  if (catalog.series.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-[var(--space-3xl)] text-center font-mono text-[length:var(--text-base)] text-[var(--subtext)]">
        No series in the catalog yet — run <code className="mx-[var(--space-xs)] text-[var(--ink)]">npm run import:anilist</code> to populate it.
      </main>
    );
  }

  // Packed on the server (catalogWire.ts): the same catalog, a fraction of
  // the prerendered bytes; KonomiApp unpacks it once on the client.
  return <KonomiApp side="anime" catalog={packCatalog(catalog)} />;
}

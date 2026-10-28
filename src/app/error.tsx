"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { ActionButton } from "@/components/konomi/ActionButton";
import { DOMAINS, type DomainKey } from "@/lib/konomi/domains";

// Route-level boundary for both sides: wraps each side's page (and
// loading.tsx) under the root layout, so the masthead chrome is gone but
// the theme tokens still apply. Copy is domain-aware (read off the path,
// never a hard-coded side), and the raw error message is deliberately NOT
// shown — Next already replaces server-side messages with a generic one,
// and a Supabase/PostgREST message is noise to a visitor either way. The
// digest is the only identifier a visitor can pass back to match a log.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const pathname = usePathname();
  const side = (Object.keys(DOMAINS) as DomainKey[]).find((k) => pathname?.startsWith(DOMAINS[k].route));
  const what = side ? `the ${DOMAINS[side].label.toLowerCase()} catalog` : "the catalog";

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-[var(--space-xl)] bg-[var(--bg)] p-[var(--space-3xl)] text-center font-mono text-[length:var(--text-base)] text-[var(--ink)]">
      <p>Couldn&apos;t load {what}.</p>
      <p className="text-[length:var(--text-sm)] text-[var(--subtext)]">
        {error.digest ? `Reference ${error.digest}` : "Check your connection and try again."}
      </p>
      <ActionButton variant="outline" size="md" onClick={() => reset()}>
        Try again
      </ActionButton>
    </main>
  );
}

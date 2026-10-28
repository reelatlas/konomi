"use client";

import "./globals.css";

// Last-resort boundary: replaces the ROOT layout when it (or the theme
// script) throws, so it must render its own <html>/<body> and pull the
// stylesheet in itself. Theme pinned to default — localStorage may be the
// thing that failed. Kept to plain tokened markup (no ActionButton: the
// component tree above it is exactly what we can no longer trust).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" data-theme="default">
      <body className="flex min-h-screen flex-col items-center justify-center gap-[var(--space-xl)] bg-[var(--bg)] p-[var(--space-3xl)] text-center font-mono text-[length:var(--text-base)] text-[var(--ink)]">
        <p>Konomi hit a wall.</p>
        <p className="text-[length:var(--text-sm)] text-[var(--subtext)]">
          {error.digest ? `Reference ${error.digest}` : "Reload the page to try again."}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="h-[var(--control-h-md)] cursor-pointer border-[length:var(--border-base)] border-[var(--ink)] bg-[var(--surface)] px-[var(--space-xl)] font-mono text-[length:var(--text-sm)] uppercase tracking-[var(--tracking-lg)] text-[var(--ink)] shadow-[var(--elev-2)]"
        >
          Try again
        </button>
      </body>
    </html>
  );
}

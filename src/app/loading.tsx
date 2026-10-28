// Shown while a side's page awaits its catalog (ISR miss or first build).
// Tokened like the error boundary so the three shell states (loading,
// empty, error) read as one surface, not three grays.
export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] font-mono text-[length:var(--text-base)] text-[var(--subtext)]">
      Loading…
    </main>
  );
}

"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center font-mono text-sm text-neutral-500">
      <p>Couldn&apos;t load the series catalog.</p>
      <p className="text-xs opacity-70">{error.message}</p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded border border-neutral-400 px-3 py-1 text-neutral-700 hover:bg-neutral-100"
      >
        Try again
      </button>
    </div>
  );
}

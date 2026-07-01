"use client";

import { useSyncExternalStore } from "react";

interface CollapsibleSectionProps {
  title: string;
  storageKey: string;
  defaultExpanded: boolean;
  children: React.ReactNode;
}

const STORAGE_PREFIX = "konomi:tagpool:section:";
const listeners = new Map<string, Set<() => void>>();

function subscribe(key: string, callback: () => void) {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(callback);
  return () => set!.delete(callback);
}

function getSnapshot(key: string, defaultExpanded: boolean): boolean {
  const stored = window.localStorage.getItem(STORAGE_PREFIX + key);
  return stored === null ? defaultExpanded : stored === "1";
}

function setExpanded(key: string, value: boolean) {
  window.localStorage.setItem(STORAGE_PREFIX + key, value ? "1" : "0");
  listeners.get(key)?.forEach((callback) => callback());
}

// Generic collapsible wrapper for the Tag Pool's 5 top-level sections only —
// subsections within Theme/Setting/Cast are plain (non-collapsible) visual
// groupings. Expand state is synced with localStorage via
// useSyncExternalStore (not read-in-an-effect): the server snapshot is
// defaultExpanded, so SSR/hydration never mismatch, and React reconciles to
// the real localStorage value right after — no setState-during-effect
// render cascade.
//
// The header is `sticky top-0` so it pins to the top of the tag pool's
// ScrollFadeArea viewport while its own section is in view, replaced by the
// next section's header once scrolled past — the only reason it's opaque
// (bg-surface) and given a z-index, rather than the plain transparent
// buttons used elsewhere: it needs to occlude content scrolling underneath
// it. ScrollFadeArea's `topInset` prop keeps its top gradient/arrow from
// rendering underneath this header — see the call site in TagPoolSection.
export function CollapsibleSection({ title, storageKey, defaultExpanded, children }: CollapsibleSectionProps) {
  const expanded = useSyncExternalStore(
    (callback) => subscribe(storageKey, callback),
    () => getSnapshot(storageKey, defaultExpanded),
    () => defaultExpanded,
  );

  return (
    <div className="mb-[var(--space-xl)] last:mb-0">
      <button
        type="button"
        onClick={() => setExpanded(storageKey, !expanded)}
        aria-expanded={expanded}
        className="sticky top-0 z-[5] flex w-full items-center mb-[var(--space-lg)] px-0 py-[var(--space-xs)] cursor-pointer bg-[var(--surface)] border-0 text-left text-[var(--ink)]"
      >
        <span className="inline-flex items-center gap-[var(--space-sm)]">
          <h3 className="font-display text-[length:var(--text-lg)] m-0 uppercase tracking-[var(--tracking-sm)]">{title}</h3>
          <span className="font-mono text-[length:var(--text-sm)] text-[var(--muted)]">{expanded ? "▾" : "▸"}</span>
        </span>
      </button>
      {expanded && <div>{children}</div>}
    </div>
  );
}

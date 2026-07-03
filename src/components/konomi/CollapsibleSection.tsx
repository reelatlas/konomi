"use client";

import { forwardRef, useSyncExternalStore } from "react";

interface CollapsibleSectionProps {
  title: string;
  storageKey: string;
  defaultExpanded: boolean;
  selectedCount?: number;
  // TagPoolBody attaches this to the header <button> itself (not the
  // wrapper `ref` above) so it can toggle this specific header's opacity
  // directly via el.style, synchronously with scroll — see that
  // component's own doc comment on recomputeActive for why this needs to
  // bypass React state/className entirely (a one-frame lag there was
  // visible during fast scrolling).
  headerRef?: (el: HTMLButtonElement | null) => void;
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

function setExpandedValue(key: string, value: boolean) {
  window.localStorage.setItem(STORAGE_PREFIX + key, value ? "1" : "0");
  listeners.get(key)?.forEach((callback) => callback());
}

// Exported so the unmasked header overlay (TagPoolBody) can read and toggle
// the exact same expand state a section's own sticky header drives, rather
// than owning a second, potentially-out-of-sync copy of it.
export function useSectionExpanded(storageKey: string, defaultExpanded: boolean) {
  const expanded = useSyncExternalStore(
    (callback) => subscribe(storageKey, callback),
    () => getSnapshot(storageKey, defaultExpanded),
    () => defaultExpanded,
  );
  return [expanded, (value: boolean) => setExpandedValue(storageKey, value)] as const;
}

// The title/badge/chevron cluster, extracted so the real (in-flow) header
// and TagPoolBody's unmasked overlay copy of the active one render
// identically — one definition of what this looks like, not two hand-kept
// duplicates.
export function SectionHeaderLabel({ title, selectedCount, expanded }: { title: string; selectedCount?: number; expanded: boolean }) {
  return (
    <span className="inline-flex items-center gap-[var(--space-sm)]">
      <h3 className="font-display text-[length:var(--text-lg)] m-0 uppercase tracking-[var(--tracking-sm)]">{title}</h3>
      {Boolean(selectedCount) && (
        <span className="font-mono font-bold text-[length:var(--text-2xs)] leading-none bg-[var(--fill)] border-[length:var(--border-hair)] border-[var(--ink)] px-[var(--space-sm)] py-[var(--space-xs)]">
          {selectedCount}
        </span>
      )}
      <span className="font-mono text-[length:var(--text-sm)] text-[var(--muted)]">{expanded ? "▾" : "▸"}</span>
    </span>
  );
}

// Generic collapsible wrapper for the Tag Pool's 5 top-level sections only —
// subsections within Theme/Setting/Cast are plain (non-collapsible) visual
// groupings. Expand state is synced with localStorage via
// useSyncExternalStore (not read-in-an-effect): the server snapshot is
// defaultExpanded, so SSR/hydration never mismatch, and React reconciles to
// the real localStorage value right after — no setState-during-effect
// render cascade.
//
// forwardRef: TagPoolBody needs each section's own wrapper element to
// measure against the scroll viewport (which one currently spans its top
// edge) for the overlay mechanism below.
//
// The header is `sticky top-0` so it pins to the top of the tag pool's
// ScrollFadeArea viewport while its own section is in view, replaced by the
// next section's header once scrolled past. Genuinely transparent
// (bg-transparent) — a deliberate aesthetic choice. Content scrolling
// underneath is hidden by ScrollFadeArea's `topMaskSize` (real mask-image
// erasure, not a color overlay) instead of giving this header an opaque
// fill — but a mask affects an element's *entire* rendered subtree
// uniformly, so the real in-flow header, being a descendant of the masked
// scroll container, gets faded right along with the chips when it's the
// one currently stuck at the top. There's no CSS way to exempt one
// descendant from an ancestor's mask. `headerRef` is how the *visual*
// exemption happens instead: TagPoolBody uses it to directly toggle this
// button's own opacity (imperatively, not via a prop/className — see its
// own doc comment for why) exactly while it would otherwise render (faded)
// in that masked band, letting TagPoolBody's separate, unmasked overlay
// copy show crisply in its place.
export const CollapsibleSection = forwardRef<HTMLDivElement, CollapsibleSectionProps>(function CollapsibleSection(
  { title, storageKey, defaultExpanded, selectedCount, headerRef, children },
  ref,
) {
  const [expanded, setExpandedState] = useSectionExpanded(storageKey, defaultExpanded);

  return (
    // last:mb-md, not last:mb-0 — a bare-zero trailing margin let the last
    // section's chip row sit flush against ScrollFadeArea's overflow-y-auto
    // clip boundary, cutting off the elev-2 shadow (3px offset) that every
    // base-size TagChip renders. --space-md matches the existing row-to-row
    // gap inside a ChipRow, so the last row's trailing space reads the same
    // as the gap between any two rows, rather than an arbitrary smaller value.
    <div ref={ref} className="mb-[var(--space-xl)] last:mb-[var(--space-md)]">
      <button
        ref={headerRef}
        type="button"
        onClick={() => setExpandedState(!expanded)}
        aria-expanded={expanded}
        className="sticky top-0 z-[var(--z-sticky)] flex w-full items-center mb-[var(--space-lg)] px-0 py-[var(--space-xs)] cursor-pointer bg-transparent border-0 text-left text-[var(--ink)]"
      >
        <SectionHeaderLabel title={title} selectedCount={selectedCount} expanded={expanded} />
      </button>
      {expanded && <div>{children}</div>}
    </div>
  );
});

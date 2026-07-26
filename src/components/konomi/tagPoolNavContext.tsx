"use client";

import { createContext, useCallback, useContext, useDeferredValue, useMemo, useState } from "react";
import type { TagSection } from "@/lib/konomi/domain";
import { tagsForCategories, tagsForSection } from "@/lib/konomi/tagPool";
import { bestScore, filterByQuery, matchScore, normalizeQuery } from "@/lib/konomi/tagSearch";
import type { TagInfo } from "@/lib/konomi/types";
import { useDomain } from "./domainContext";
import { useLevel } from "./tagPoolPrefs";

// ---- Tag pool nav + search controller (search v2 relocation, Phase 1) ----
//
// The pool's section/sub-tab navigation state AND the global search model,
// lifted out of TagPoolBody into one shared controller. Why lifted: the
// search FIELD lives in the persistent results header (ResultsHeader) as of
// v2, while the nav it steers (tabs, sub-tabs, dims, grids) renders inside
// the pool panel (TagPoolBody) — two sibling components that must share one
// synchronized model. Keystroke handlers (auto-move, ↑↓ cycling) mutate nav
// state, so the state and the handlers have to live in one place both
// siblings can reach; a provider is that place. This is the honest
// architecture for Phase 2 as well, where the panel becomes a header-
// anchored overlay — still a sibling of the field, never its parent.
//
// Provider-with-children: state changes here re-render CONSUMERS only
// (ResultsHeader's field, TagPoolBody) — the `children` element identity is
// stable across provider re-renders, so React bails out of every non-
// consumer subtree. A keystroke does not re-render the app shell, masthead,
// or cards, exactly like it didn't when this state was TagPoolBody-local.
//
// State survival: the active section / sub-tab / query survive the panel
// closing and reopening because THIS provider stays mounted for the app's
// whole life (KonomiApp), replacing the old guarantee ("TagPoolBody never
// unmounts, only max-h-0 clips it") with a stronger one that also holds
// once Phase 2/3 change how the panel mounts. Still deliberately not
// persisted beyond the session — no requirement to survive a reload.

export interface SubSearch {
  slug: string;
  count: number;
  best: number;
}
export interface SectionSearch {
  key: string;
  count: number;
  best: number;
  subs: SubSearch[] | null;
}

// Subsection label → slug ("Time of year" → "time-of-year") — doubles as
// the element-id fragment for the sub-tier's aria wiring (ids can't hold
// spaces). Module-scope: pure, and memoized derivations depend on it.
export const subKey = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export interface VisibleSection {
  section: TagSection;
  tags: TagInfo[];
}
export interface VisibleSub {
  sub: NonNullable<TagSection["subsections"]>[number];
  slug: string;
  tags: TagInfo[];
}

export interface TagPoolNav {
  // ---- search field surface (ResultsHeader renders the input) ----
  // Immediate value — what the input shows. Derived model below runs off
  // the DEFERRED copy (see the useDeferredValue comment in the provider).
  query: string;
  // Normalized deferred query; searchActive = a non-empty one is live.
  normQuery: string;
  searchActive: boolean;
  handleQueryChange: (raw: string) => void;
  handleSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  clearQuery: () => void;
  // ---- nav model ----
  visibleSections: VisibleSection[];
  active: VisibleSection | undefined;
  subTabsMode: boolean;
  visibleSubs: VisibleSub[];
  activeSub: VisibleSub | undefined;
  showSubStrip: boolean;
  setActiveSectionKey: (key: string) => void;
  setActiveSub: (sectionKey: string, slug: string) => void;
  // ---- search match model ----
  searchByKey: Map<string, SectionSearch>;
  anyMatches: boolean;
  poolTotalMatches: number;
  multipleLitTargets: boolean;
  dimFor: (key: string) => boolean;
  activeSectionMatches: number;
}

const TagPoolNavContext = createContext<TagPoolNav | null>(null);

export function useTagPoolNav(): TagPoolNav {
  const nav = useContext(TagPoolNavContext);
  if (!nav) throw new Error("useTagPoolNav must be used within TagPoolNavProvider");
  return nav;
}

interface TagPoolNavProviderProps {
  allTags: TagInfo[];
  totalSeriesCount: number;
  // The Enter fast path's toggle (unique match) — k.toggleTag.
  onChipToggle: (tagId: string) => void;
  children: React.ReactNode;
}

export function TagPoolNavProvider({ allTags, totalSeriesCount, onChipToggle, children }: TagPoolNavProviderProps) {
  const domain = useDomain();
  const level = useLevel(domain.storagePrefix);

  const [activeSectionKey, setActiveSectionKey] = useState(domain.sections[0].key);
  // Active subsection PER SECTION (keyed by section key) for sections that
  // render their subsections as a second tab tier (subsectionsAsTabs — the
  // film pillars). A map, not a single key, so switching Story → Style →
  // back to Story lands on the Story sub-tab you were on. Values are
  // subsection SLUGS (see subKey above), not labels — they double as
  // element-id fragments for the tab/panel aria wiring, and labels like
  // "Time of year" contain spaces, which ids can't.
  const [activeSubKeys, setActiveSubKeys] = useState<Record<string, string>>({});

  // Every section with at least one tag at the current level — hidden
  // entirely (not shown as a disabled tab). Memoized (with every derivation
  // below that hangs off it) since the resize-lag fix: MixerBar's resize
  // drag re-renders TagPoolBody on every RAF tick, and stable refs here are
  // what let its downstream memos hold through those ticks.
  const visibleSections = useMemo(
    () =>
      domain.sections
        .map((section) => ({
          section,
          tags: tagsForSection(domain, allTags, section, level, totalSeriesCount),
        }))
        .filter(({ tags }) => tags.length > 0),
    [domain, allTags, level, totalSeriesCount],
  );

  // A Tag Density / Level change can make the currently-active section
  // disappear entirely (e.g. every non-Genres section is empty at "Casual",
  // leaving only Genres). When that happens, fall to the first visible
  // section AND commit that back into state, so the tab STAYS where it
  // landed rather than snapping back once the level rises again (the
  // remembered-tab restore was a reported bug — see TagPoolBody's history).
  // Render-phase conditional setState, comparing against state and
  // converging in a single pass — the codebase's established pattern for
  // satisfying react-hooks/set-state-in-effect (this is not an effect):
  // after the reset, activeSectionKey is a visible section, so the
  // condition is false on the immediate re-render and it never loops.
  const activeInVisible = visibleSections.find(({ section }) => section.key === activeSectionKey);
  if (!activeInVisible && visibleSections.length > 0) {
    setActiveSectionKey(visibleSections[0].section.key);
  }
  const active = activeInVisible ?? visibleSections[0];

  // Second tier (film pillars): subsections rendered as tabs, one shown at
  // a time. Same rules as the section tier, one level down: empty
  // subsections hidden entirely, and when the stored active sub disappears
  // (level change) fall to the first visible one and COMMIT it — the same
  // render-phase converge-in-one-pass pattern as the section fallback.
  const subTabsMode = Boolean(active?.section.subsectionsAsTabs && active.section.subsections);
  const activeSection = active?.section;
  const visibleSubs = useMemo(
    () =>
      subTabsMode && activeSection?.subsections
        ? activeSection.subsections
            .map((sub) => ({
              sub,
              slug: subKey(sub.label),
              tags: tagsForCategories(domain, allTags, sub.categories, level, totalSeriesCount),
            }))
            .filter(({ tags }) => tags.length > 0)
        : [],
    [subTabsMode, activeSection, domain, allTags, level, totalSeriesCount],
  );
  const storedSubSlug = active ? activeSubKeys[active.section.key] : undefined;
  const activeSub = visibleSubs.find(({ slug }) => slug === storedSubSlug) ?? visibleSubs[0];
  if (subTabsMode && active && activeSub && storedSubSlug !== activeSub.slug) {
    setActiveSubKeys((prev) => ({ ...prev, [active.section.key]: activeSub.slug }));
  }
  // The strip is pure noise when only one subsection survives the level
  // floor — hide it and show that one subsection's chips plain.
  const showSubStrip = subTabsMode && visibleSubs.length > 1;

  // ---- Tag search ("search prunes the nav" — full spec + rationale in
  // DESIGN_SYSTEM.md "Tag pool search"). Search is GLOBAL, always: one
  // field, in the persistent results header (v2 — moved out of the pool
  // panel; there is no in-panel search anymore). The nav itself is the
  // results display — tabs and sub-tabs whose sections hold no match DIM
  // (never hidden), and the chip grid filters in place.
  const [query, setQuery] = useState("");
  // useDeferredValue, not a hand-rolled debounce: keeps each keystroke's
  // input paint immediate while the big grids re-filter at deferred
  // priority. The input binds `query` (immediate); everything derived
  // below runs off the deferred copy.
  const deferredQuery = useDeferredValue(query);
  const normQuery = normalizeQuery(deferredQuery);
  // v1 also required searchOpen (the in-panel field collapsed to an icon);
  // the header field is always visible, so a live query IS the whole
  // condition now.
  const searchActive = normQuery.length > 0;

  // Per-section match model, rebuilt per render while a query is live.
  // One full pass over the pool per keystroke (~15k cheap string checks) —
  // measured fine; the render of the big grids, not this scan, is the
  // cost, and useDeferredValue above is what manages that. Parameterized
  // on the query (not closed over normQuery) because it runs in two
  // places: per render for the dim/empty model, and inside the onChange
  // handler for the auto-move decision (see handleQueryChange).
  const buildSearchSections = useCallback(
    (nq: string): SectionSearch[] =>
      visibleSections.map(({ section, tags }) => ({
        key: section.key,
        count: filterByQuery(tags, nq).length,
        best: bestScore(tags, nq),
        subs:
          section.subsectionsAsTabs && section.subsections
            ? section.subsections
                .map((sub) => ({ sub, tags: tagsForCategories(domain, allTags, sub.categories, level, totalSeriesCount) }))
                .filter(({ tags }) => tags.length > 0)
                .map(({ sub, tags }) => ({ slug: subKey(sub.label), count: filterByQuery(tags, nq).length, best: bestScore(tags, nq) }))
            : null,
      })),
    [visibleSections, domain, allTags, level, totalSeriesCount],
  );
  const searchSections: SectionSearch[] = useMemo(
    () => (searchActive ? buildSearchSections(normQuery) : []),
    [searchActive, normQuery, buildSearchSections],
  );
  const searchByKey = useMemo(() => new Map(searchSections.map((s) => [s.key, s])), [searchSections]);
  const anyMatches = searchSections.some((s) => s.count > 0);
  // Pool-wide numbers for SearchCountLine: the denominator is matches
  // across EVERY section (user's mental model — "my matches"). The plain
  // total shows ONLY when there is exactly ONE lit selectable target
  // (one flat section, or one sub-tab; user-ruled 2026-07-25 after "ben"
  // lit a single section but three of its sub-tabs and read as complete)
  // — which is the same set the ↓↑ keys cycle, so the arrows hint
  // appears if-and-only-if the arrows actually have somewhere to go.
  const poolTotalMatches = searchSections.reduce((n, s) => n + s.count, 0);
  const multipleLitTargets =
    searchSections.reduce((n, s) => n + (s.count > 0 ? (s.subs ? s.subs.filter((su) => su.count > 0).length : 1) : 0), 0) > 1;
  // The Enter fast path: when exactly one tag matches across the whole
  // pool, Enter toggles it. Unique by ID (Phase 3a): two same-named
  // entities (both De Niros) are two matches, so Enter stays inert until
  // the query isolates one entity.
  const uniqueMatch = useMemo(() => {
    if (!searchActive) return null;
    const seen = new Set<string>();
    for (const { tags } of visibleSections) {
      for (const t of tags) {
        if (matchScore(t.name, normQuery) > 0) {
          seen.add(t.id);
          if (seen.size > 1) return null;
        }
      }
    }
    return seen.size === 1 ? [...seen].at(0)! : null;
  }, [searchActive, normQuery, visibleSections]);

  // Auto-move: "stay if you can, move if you must." Runs INSIDE the
  // onChange handler — the keystroke IS the event this navigation responds
  // to — so it fires exactly once per query change and never re-evaluates
  // on unrelated renders: clicking a dim tab to inspect it is never
  // fought, and per-keystroke section teleporting can't happen. (An
  // effect-based version was written first and rejected by this repo's
  // react-hooks/set-state-in-effect rule — correctly: this is an event
  // response, so it belongs in the event handler.) Rules: an exact match
  // pulls the view to its section unless the active section has one too;
  // otherwise hop only when the active section has ZERO matches, to the
  // section with the best score (exact > word-prefix > substring), ties
  // broken by nav order — never by match count, which reorders
  // unpredictably as a query grows. Then the same stay-if-you-can rule
  // one tier down for the target's sub-tab. Clearing (backspace to empty)
  // never moves the view.
  const handleQueryChange = (raw: string) => {
    setQuery(raw);
    const nq = normalizeQuery(raw);
    if (!nq) return;
    const sections = buildSearchSections(nq);
    if (sections.length === 0) return;
    const globalBest = Math.max(...sections.map((s) => s.best));
    if (globalBest === 0) return; // nothing matches anywhere — stay put
    const activeKey = active?.section.key;
    const current = sections.find((s) => s.key === activeKey);
    let targetKey = activeKey;
    if (globalBest === 3 && (current?.best ?? 0) < 3) {
      targetKey = sections.find((s) => s.best === 3)!.key;
    } else if ((current?.count ?? 0) === 0) {
      targetKey = sections.find((s) => s.best === globalBest)!.key;
    }
    if (targetKey && targetKey !== activeKey) setActiveSectionKey(targetKey);
    const target = sections.find((s) => s.key === targetKey);
    if (target?.subs) {
      const stored = target.subs.find((su) => su.slug === activeSubKeys[target.key]);
      if (!stored || stored.count === 0) {
        const subBest = Math.max(...target.subs.map((su) => (su.count > 0 ? su.best : 0)));
        const pick = target.subs.find((su) => su.count > 0 && su.best === subBest);
        if (pick) setActiveSubKeys((prev) => ({ ...prev, [target.key]: pick.slug }));
      }
    }
  };

  // ↑↓ cycle the lit (matching) sections, walking a section's lit sub-tabs
  // before moving to the next section; Enter = the unique-match toggle;
  // Esc = clear (one consumed stage). All on the header input itself — the
  // chip grid keeps its own existing focus behavior untouched.
  const litPairs = (): { key: string; slug?: string }[] => {
    const out: { key: string; slug?: string }[] = [];
    for (const s of searchSections) {
      if (s.count === 0) continue;
      if (s.subs) {
        for (const su of s.subs) if (su.count > 0) out.push({ key: s.key, slug: su.slug });
      } else {
        out.push({ key: s.key });
      }
    }
    return out;
  };
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      // Esc ladder, v2 form: clear query → (fall through) close panel.
      // The header field is always visible, so v1's middle stage
      // (collapse the field) no longer exists. A consumed clear must
      // preventDefault + stopPropagation: MixerBar has a WINDOW-level
      // Escape that closes the whole edit panel, and — Next.js App Router
      // hydrates at `document`, so React's delegated listeners share that
      // node — only the `!e.defaultPrevented` guard in that listener
      // actually shields it (confirmed live; see MixerBar). Once the query
      // is already empty the key falls through untouched, so the second
      // Esc closes the panel.
      if (query) {
        e.preventDefault();
        e.stopPropagation();
        setQuery("");
      }
      return;
    }
    if (!searchActive) return;
    if (e.key === "Enter") {
      if (uniqueMatch) onChipToggle(uniqueMatch);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const pairs = litPairs();
      if (!pairs.length) return;
      const idx = pairs.findIndex((p) => p.key === active?.section.key && (!p.slug || p.slug === activeSub?.slug));
      const next = pairs[(idx + (e.key === "ArrowDown" ? 1 : -1) + pairs.length) % pairs.length];
      setActiveSectionKey(next.key);
      if (next.slug) setActiveSubKeys((prev) => ({ ...prev, [next.key]: next.slug! }));
    }
  };

  const dimFor = (key: string) => (searchActive ? (searchByKey.get(key)?.count ?? 0) === 0 : false);
  // Active section's match count — drives the honest empty state when a
  // dim tab is clicked (0 matches here) in the mixer's guided-error voice.
  const activeSectionMatches = searchActive && active ? (searchByKey.get(active.section.key)?.count ?? 0) : -1;

  const setActiveSub = (sectionKey: string, slug: string) => setActiveSubKeys((prev) => ({ ...prev, [sectionKey]: slug }));
  const clearQuery = () => setQuery("");

  // Deliberately NOT useMemo'd into a stable value object: every field a
  // consumer reads changes exactly when this provider re-renders anyway
  // (query/nav state, or a parent-driven allTags/level change), so a memo
  // would buy nothing — both consumers are precisely the components that
  // need those renders.
  const value: TagPoolNav = {
    query,
    normQuery,
    searchActive,
    handleQueryChange,
    handleSearchKeyDown,
    clearQuery,
    visibleSections,
    active,
    subTabsMode,
    visibleSubs,
    activeSub,
    showSubStrip,
    setActiveSectionKey,
    setActiveSub,
    searchByKey,
    anyMatches,
    poolTotalMatches,
    multipleLitTargets,
    dimFor,
    activeSectionMatches,
  };

  return <TagPoolNavContext.Provider value={value}>{children}</TagPoolNavContext.Provider>;
}

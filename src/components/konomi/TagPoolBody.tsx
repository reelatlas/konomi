import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { genreTags, sortTags, tagsForCategories, tagsForSection } from "@/lib/konomi/tagPool";
import { bestScore, filterByQuery, matchScore, normalizeQuery } from "@/lib/konomi/tagSearch";
import type { TagInfo } from "@/lib/konomi/types";
import { useDomain } from "./domainContext";
import { IconButton } from "./IconButton";
import { SearchIcon } from "./icons";
import { ScrollFadeArea } from "./ScrollFadeArea";
import { SectionTabStrip } from "./SectionTabStrip";
import { TagChip } from "./TagChip";
import { useLevel, useSort } from "./tagPoolPrefs";

interface TagPoolBodyProps {
  allTags: TagInfo[];
  selectedTagIds: string[];
  totalSeriesCount: number;
  onChipToggle: (tag: string) => void;
  // MixerBar's resize-handle-driven height (default 50% of viewport on
  // first open, or whatever the user has since dragged/persisted) — the
  // pool panel's *total* height budget, not the chip area alone. This
  // component reduces it by its own live-measured tabs row height (see
  // rowHeightPx below) to get the chip area's actual height, rather than
  // MixerBar guessing that reduction itself — MixerBar has no visibility
  // into this row's real height. Undefined only pre-hydration/no-JS,
  // where CHIP_AREA_HEIGHT below is the fallback. See ScrollFadeArea's
  // heightPx prop for why this can't just be a computed Tailwind class.
  poolPanelHeightPx?: number;
  // Mirrors MixerBar's own editMode — this component stays mounted the
  // whole time (see this file's own top comment), only visually clipped to
  // zero height via MixerBar's max-h-0 when edit mode is closed. Threaded
  // straight through to SectionTabStrip's own `visible` prop: see that
  // component's comment for the real bug (a page-level scroll on every
  // load) this exists to prevent.
  editMode: boolean;
  // MixerBar's resize grip/50%/100%/Reset shortcuts and its edit-panel
  // close button — rendered as the fixed (shrink-0) sibling next to
  // SectionTabStrip in the tabs row below. Built and owned entirely by
  // MixerBar (all the drag/reachability state and handlers live there,
  // see that file's own top comment); this component just places the
  // finished node, the same "accept a slot, don't know what's in it"
  // relationship this component already has with its own children
  // elsewhere. Optional only so this component doesn't require a caller
  // that has no use for it — MixerBar always passes one today.
  trailingControls?: React.ReactNode;
  // Threaded straight through to the chip area's own ScrollFadeArea, below
  // — see that prop's own comment (ScrollFadeArea.tsx) for the real,
  // measured performance issue this exists to avoid. True for exactly as
  // long as MixerBar's own resize-drag is live (dragHeightPx !== null),
  // which is also exactly when poolPanelHeightPx (and therefore
  // chipAreaHeightPx, below) is changing on every RAF-throttled tick.
  isPoolPanelResizing?: boolean;
}

// One gap for BOTH vertical relationships in this body: primary tab strip
// -> film subsection strip, and the whole tab block -> chip area. Kept
// deliberately identical, not tuned per relationship.
//
// The film sub-tab tier once *looked* like it had a much bigger gap above
// it than a plain section's chips do. That was never this constant — it
// was a phantom 9px inside SectionTabStrip's own button (an inline strut
// sized from an inherited font that renders nothing; see that file's
// comment on the button's `flex`). Fixing the cause there left a ~4px
// residual, measured live: a plain section's chips start 18.3px below the
// section label's ink, the sub-tier's own ink starts 22.2px below it,
// because a text label's ink sits inside its line box while a chip starts
// at a hard border edge with no leading.
//
// That 4px is deliberately NOT compensated with a tighter tier gap. The
// two states are never on screen together — switching sections reflows the
// whole panel anyway — so the difference has no moment where it's visible,
// and a tuned per-tier value would silently rot the first time the
// sub-label's size or family changes. One token, no exceptions. If this is
// ever revisited, re-measure rendered ink (not box) geometry first.
const STRIP_GAP = 12; // --space-lg
// Bootstrap-only fallback for rowHeightPx (below) before the first real
// ResizeObserver measurement lands — STRIP_GAP + SectionTabStrip's own
// ~30px. Only needs to be a reasonable one-frame placeholder, the same
// role EDIT_MODE_FIXED_ROWS_HEIGHT plays for MixerBar's own
// fixedOverheadPx.
const ROW_HEIGHT_BOOTSTRAP = 42;
// Floor for the chip area specifically, independent of whatever
// poolPanelHeightPx/rowHeightPx computes to — guards against a negative
// or unusably tiny chip area if those two ever drift (e.g. a very short
// viewport where poolPanelHeightPx is already clamped near its own floor).
const CHIP_AREA_MIN = 60;
// h-, not max-h- — this area must NOT hug/shrink to fit a short section's
// content; only MixerBar's drag handle (or the 50%-of-viewport default on
// first open) may change how tall this is, never which section tab
// happens to be active. A short section (Genres, Setting, Demographic)
// leaves visible empty space below its chips rather than collapsing the
// box down to fit — switching tabs must be visually inert with respect to
// size. dvh, not vh: this lives inside MixerBar's bottom-anchored bar, and
// dvh avoids the well-known mobile Safari/Chrome dynamic-toolbar jump
// plain vh produces (see MixerBar.tsx's own top comment — same reasoning,
// this is the one place it actually bites). In practice MixerBar always
// passes a real `poolPanelHeightPx` once mounted, so this class is really
// only a pre-hydration/no-JS fallback — see ScrollFadeArea's `heightPx`
// prop, which takes priority whenever present.
//
// Literal string, not built via template interpolation — Tailwind's
// scanner needs the full class as static source text to generate its CSS;
// a runtime-computed template literal is invisible to it and silently
// produces no rule at all (confirmed live as a real bug once, before this
// was a literal).
const CHIP_AREA_HEIGHT = "h-[50dvh]";
// Initial page size for sections that opt into TagSection.capped (film
// People/Franchise — see that flag's comment for why it's per-section, not
// global). The top N under the ACTIVE SORT render eagerly; scrolling near
// the bottom appends another page (CappedChipRow). One shared constant, not
// per-call literals, per the design-system centralization rule.
const BROWSE_CAP = 50;

// Subsection label → slug ("Time of year" → "time-of-year") — doubles as
// the element-id fragment for the sub-tier's aria wiring (ids can't hold
// spaces). Module-scope: pure, and memoized derivations depend on it.
const subKey = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-");

function ChipRow({
  tags,
  selectedTagIds,
  onChipToggle,
}: {
  tags: TagInfo[];
  selectedTagIds: string[];
  onChipToggle: (tag: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-[var(--space-md)]">
      {tags.map((tag) => (
        <TagChip key={tag.id} id={tag.id} name={tag.name} size="small" active={selectedTagIds.includes(tag.id)} onToggle={onChipToggle} />
      ))}
    </div>
  );
}

// The one search count line ("5 of 32 matches · ↓↑ for more or narrow" /
// "32 matches") — copy user-ruled 2026-07-25, exact wording including the
// comma-less hint. `shownHere` = tags mounted in the CURRENT grid;
// `poolTotal` = matches across EVERY section (the user's mental model:
// "my matches", not per-grid accounting); `multiSection` = matches live
// in other sections too, which is when the ↓↑ hint earns its place (it
// doubles as the first shipped keyboard instruction). Single-section
// case shows the plain total even if locally truncated — the fill-ahead
// scroll behavior makes "there's more below" self-evident, per the same
// ruling that DELETED the two earlier per-grid lines ("top N of Y" in
// browse, "N of M — scroll" in search): the below-grid position kept
// them a page beyond the fold, structurally unseeable, and the user
// chose removal over relocation. Bottom placement is deliberate too:
// visible exactly when a query is narrow enough that the results are
// manageable — a reward, not a nag (user-ruled; revisit-later is noted).
function SearchCountLine({ shownHere, poolTotal, multiSection }: { shownHere: number; poolTotal: number; multiSection: boolean }) {
  return (
    <span className="font-mono text-[length:var(--text-2xs)] text-[var(--subtext)]" aria-live="polite">
      {multiSection
        ? `${shownHere.toLocaleString()} of ${poolTotal.toLocaleString()} matches · ↓↑ for more or narrow`
        : `${poolTotal.toLocaleString()} ${poolTotal === 1 ? "match" : "matches"}`}
    </span>
  );
}

// ChipRow for TagSection.capped sections (film People/Franchise): mounts
// only the first BROWSE_CAP tags (top-N under the caller's already-applied
// sort) and appends another page whenever the sentinel under the grid
// scrolls near view — eagerly mounting Actors' 6.9k chips was the measured
// cause of the resize-drag lag. In practice the IntersectionObserver also
// fires while the sentinel is ALREADY visible on mount, so a tall panel
// auto-fills to the viewport plus one page before waiting for real
// scrolling — unplanned, kept deliberately (user-ruled 2026-07-25): it's
// the mature form of infinite scroll (no dead space under the chips), and
// the perf goal holds — DOM scales with panel size + actual scroll depth,
// never the full list. Pagination state lives HERE so resets are pure
// remounts: section/sub switches reset via the tabpanel's existing key,
// sort/level/query changes via the parent's gridResetKey — no reset
// effects, the same key-remount idiom the panel already uses for scroll.
// root:null works because intersection is computed AFTER ancestor
// overflow clipping. `countLine` is a slot: the count needs pool-wide
// numbers only the parent has, and uncapped grids render the same line —
// so the parent owns it and this component just places it under the grid.
function CappedChipRow({
  tags,
  countLine,
  selectedTagIds,
  onChipToggle,
}: {
  tags: TagInfo[];
  countLine: React.ReactNode;
  selectedTagIds: string[];
  onChipToggle: (tag: string) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(BROWSE_CAP);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const truncated = tags.length > visibleCount;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return; // fully expanded — sentinel unmounted
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisibleCount((c) => c + BROWSE_CAP);
      },
      // Pre-load one row-ish early so the append lands before the user
      // hits the visual bottom. Margin is viewport-relative, close enough.
      { rootMargin: "160px" },
    );
    io.observe(el);
    return () => io.disconnect();
    // visibleCount in deps re-arms the observer after each append (the
    // sentinel moved; a fresh observation avoids a stale initial record).
  }, [truncated, visibleCount]);
  const shown = truncated ? tags.slice(0, visibleCount) : tags;
  return (
    <div className="flex flex-col gap-[var(--space-md)]">
      <ChipRow tags={shown} selectedTagIds={selectedTagIds} onChipToggle={onChipToggle} />
      {truncated && <div ref={sentinelRef} aria-hidden className="h-px" />}
      {countLine}
    </div>
  );
}

// Body-only — the section-level chrome (border/shadow/padding) lives in
// MixerBar, which renders this inside its bottom-anchored edit-mode pool
// panel. `level`/`sort` are read directly via useLevel()/useSort() to
// filter/sort chips — Tag Density/Sort's own UI controls (LevelSelector/
// SortSelect) don't live in this bar at all anymore; they moved to a
// Filter icon's popover next to the Recommendations header
// (ResultsFilterButton.tsx). What DOES live in this component's own tab
// row now is MixerBar's resize grip/50%/100%/Reset shortcuts and its
// close button (trailingControls, below) — they moved the opposite
// direction, in from MixerBar, once removing the filters left that bar's
// old resize-handle row with no reason to exist as a row of its own (see
// MixerBar.tsx's own top comment).
//
// Section navigation is a horizontal tab strip (SectionTabStrip), not
// collapsible sections — see DESIGN_SYSTEM.md for why that replaced the
// old sticky-header/mask machinery entirely rather than keeping it around
// in reduced form.
export function TagPoolBody({
  allTags,
  selectedTagIds,
  totalSeriesCount,
  onChipToggle,
  poolPanelHeightPx,
  editMode,
  trailingControls,
  isPoolPanelResizing,
}: TagPoolBodyProps) {
  const domain = useDomain();
  const level = useLevel(domain.storagePrefix);
  const sort = useSort(domain.storagePrefix);
  // Plain component state, not localStorage-backed — TagPoolBody itself
  // never unmounts while browse mode is active (only max-h-0 toggles, in
  // MixerBar), so this alone is enough for the active section and its
  // scroll position to survive closing and reopening edit mode. No
  // requirement was made for this to survive a full page reload, so it
  // isn't persisted beyond the session.
  const [activeSectionKey, setActiveSectionKey] = useState(domain.sections[0].key);
  // Active subsection PER SECTION (keyed by section key) for sections that
  // render their subsections as a second tab tier (subsectionsAsTabs — the
  // film pillars). A map, not a single key, so switching Story → Style →
  // back to Story lands on the Story sub-tab you were on. Values are
  // subsection SLUGS (see subKey below), not labels — they double as
  // element-id fragments for the tab/panel aria wiring, and labels like
  // "Time of year" contain spaces, which ids can't.
  const [activeSubKeys, setActiveSubKeys] = useState<Record<string, string>>({});

  // Live-measured height of the tabs row below — replaces a flat constant
  // (the old TABS_HEIGHT) because SectionTabStrip's own rendered height
  // can vary slightly by content, the same "hardcoded worst-case vs. live
  // ResizeObserver" tradeoff MixerBar's own fixedOverheadPx already made
  // for the same reason. Self-measurement only (this row's own height
  // against itself) — nothing here reads across to another row.
  const rowRef = useRef<HTMLDivElement>(null);
  const [rowHeightPx, setRowHeightPx] = useState<number | null>(null);
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const observer = new ResizeObserver(([entry]) => {
      setRowHeightPx(entry.contentRect.height);
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, []);
  const chipAreaHeightPx =
    poolPanelHeightPx !== undefined ? Math.max(CHIP_AREA_MIN, poolPanelHeightPx - (rowHeightPx ?? ROW_HEIGHT_BOOTSTRAP) - STRIP_GAP) : undefined;

  // Every section with at least one tag at the current level — hidden
  // entirely (not shown as a disabled tab), matching the old collapsible
  // version's "hidden, not just collapsed, empty sections" behavior.
  // Memoized (with every derivation below that hangs off it) since the
  // resize-lag fix: MixerBar's resize drag re-renders this component on
  // every RAF tick via poolPanelHeightPx, and before memoization each tick
  // re-scanned the full pool — user-felt as site-wide lag while dragging
  // with a search query live. None of these inputs change during a drag,
  // so every tick now reuses the same arrays (and their stable refs are
  // what let the downstream memos hold too).
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
  // leaving only Genres). When that happens, fall to the first visible section
  // (always Genres, which passes every level) AND commit that back into state,
  // so the tab STAYS where it landed rather than snapping back to the
  // previously-active tab once the level rises and the old tab reappears.
  // Requested directly: once a filter forces you onto Genres, switching the
  // level back up should keep you on Genres (or on whatever tab you're
  // currently on, as long as it's still available) — not restore a remembered
  // tab. (This reverses the earlier "derive the fallback, leave the stored key
  // untouched so it can be restored" behavior — that restore was the reported
  // bug.) Render-phase conditional setState, comparing against state and
  // converging in a single pass — the same pattern MixerBar/RecommendationsBody
  // use to satisfy react-hooks/set-state-in-effect (this is not an effect):
  // after the reset, activeSectionKey is a visible section, so the condition is
  // false on the immediate re-render and it never loops.
  const activeInVisible = visibleSections.find(({ section }) => section.key === activeSectionKey);
  if (!activeInVisible && visibleSections.length > 0) {
    setActiveSectionKey(visibleSections[0].section.key);
  }
  const active = activeInVisible ?? visibleSections[0];

  // Second tier (film pillars): subsections rendered as tabs, one shown at
  // a time. Same rules as the section tier, one level down: empty
  // subsections hidden entirely, and when the stored active sub disappears
  // (level change) fall to the first visible one and COMMIT it — the same
  // render-phase converge-in-one-pass pattern as the section fallback
  // above (after the set, the condition is false on the immediate
  // re-render, so it can't loop).
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
  if (subTabsMode && activeSub && storedSubSlug !== activeSub.slug) {
    setActiveSubKeys((prev) => ({ ...prev, [active.section.key]: activeSub.slug }));
  }
  // The strip is pure noise when only one subsection survives the level
  // floor (e.g. Style at Moviegoer = Sagas alone) — hide it and show that
  // one subsection's chips plain.
  const showSubStrip = subTabsMode && visibleSubs.length > 1;

  // ---- Tag search ("search prunes the nav" — full spec + rationale in
  // DESIGN_SYSTEM.md "Tag pool search"). Search is GLOBAL, always: there
  // is no scope control. The nav itself is the results display — tabs and
  // sub-tabs whose sections hold no match DIM (SectionTabStrip's `dimmed`;
  // never hidden, so the strip's geometry can't reflow under the pointer),
  // and the chip grid filters in place. No dropdown, no results page: the
  // pool panel is already a grid of selectable entities, so selection
  // stays the one existing interaction (chip toggle).
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  // useDeferredValue, not a hand-rolled debounce: keeps each keystroke's
  // input paint immediate while the big grid re-filters (People renders
  // ~6.9k chips uncapped — user-ruled no cap in v1) at deferred priority.
  const deferredQuery = useDeferredValue(query);
  const normQuery = normalizeQuery(deferredQuery);
  const searchActive = searchOpen && normQuery.length > 0;
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Per-section match model, rebuilt per render while a query is live.
  // One full pass over the pool per keystroke (~15k cheap string checks) —
  // measured fine; the render of the big grids, not this scan, is the
  // cost, and useDeferredValue above is what manages that.
  type SubSearch = { slug: string; count: number; best: number };
  type SectionSearch = { key: string; count: number; best: number; subs: SubSearch[] | null };
  // Parameterized on the query (not closed over normQuery) because it runs
  // in two places: per render for the dim/empty model, and inside the
  // onChange handler for the auto-move decision (see handleQueryChange).
  // useCallback + the useMemo below are part of the resize-lag fix (see
  // visibleSections): before them, every resize-drag RAF tick re-ran this
  // full-pool scan even though the query hadn't changed.
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
  const searchByKey = new Map(searchSections.map((s) => [s.key, s]));
  const anyMatches = searchSections.some((s) => s.count > 0);
  // Pool-wide numbers for SearchCountLine: the denominator is matches
  // across EVERY section (user's mental model — "my matches"). The plain
  // total shows ONLY when there is exactly ONE lit selectable target
  // (one flat section, or one sub-tab; user-ruled 2026-07-25 after "ben"
  // lit a single section but three of its sub-tabs and read as complete)
  // — which is the same set the ↓↑ keys cycle, so the arrows hint
  // appears if-and-only-if the arrows actually have somewhere to go. A
  // grouped-inline section (anime Theme) counts as one target: nothing
  // inside it is separately selectable.
  const poolTotalMatches = searchSections.reduce((n, s) => n + s.count, 0);
  const multipleLitTargets =
    searchSections.reduce((n, s) => n + (s.count > 0 ? (s.subs ? s.subs.filter((su) => su.count > 0).length : 1) : 0), 0) > 1;
  // The Enter fast path: when exactly one tag matches across the whole
  // pool, Enter toggles it — type until unique, Enter, done, no pointer.
  // Names, not per-section counts, so a tag reachable via two sections
  // (none today, but the union rule in visiblePoolTagNames allows it)
  // still counts as one.
  // Unique by ID (Phase 3a): two same-named entities (both De Niros) are
  // two matches, so Enter stays inert until the query isolates one entity.
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
  // Esc = clear-then-close (two-stage). All on the input itself — the
  // chip grid keeps its own existing focus behavior untouched in v1.
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
      // Two-stage (clear → collapse), and each consumed stage must
      // stopPropagation: MixerBar has a WINDOW-level Escape that closes
      // the whole edit panel (confirmed live — without this, the second
      // Esc collapsed the panel out from under the search). React's
      // stopPropagation marks the native event, so the window listener
      // never fires for a consumed stage. Once search is already closed
      // the key falls through untouched — so the full ladder reads:
      // clear query → close search → (MixerBar) close panel. Collapse
      // also blurs, otherwise focus stays trapped in the w-0 input and
      // the third stage could never reach MixerBar.
      if (query) {
        e.preventDefault();
        e.stopPropagation();
        setQuery("");
      } else if (searchOpen) {
        e.preventDefault();
        e.stopPropagation();
        setSearchOpen(false);
        searchInputRef.current?.blur();
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
  // Toggle only — no close-on-blur: a blur handler races the toggle
  // button's own click (blur closes, the re-rendered click reopens), and
  // an open empty field is harmless chrome. Esc or the icon closes.
  const toggleSearch = () => {
    if (searchOpen) {
      setSearchOpen(false);
      setQuery("");
    } else {
      setSearchOpen(true);
      searchInputRef.current?.focus(); // always mounted (w-0 closed), focusable immediately
    }
  };
  const dimFor = (key: string) => (searchActive ? (searchByKey.get(key)?.count ?? 0) === 0 : false);
  // Active section's match count — drives the honest empty state when a
  // dim tab is clicked (0 matches here) in the mixer's guided-error voice.
  const activeSectionMatches = searchActive && active ? (searchByKey.get(active.section.key)?.count ?? 0) : -1;
  const applyQuery = (tags: TagInfo[]) => (searchActive ? filterByQuery(tags, normQuery) : tags);

  // The active grid's final list (filter → sort), memoized for the same
  // resize-tick reason as visibleSections — sorting Actors' 6.9k tags on
  // every drag frame was real work. Covers the sub-tab-active and flat
  // shapes; the inline-grouped shape (anime Theme) keeps its per-group
  // inline computation below — small lists, never capped.
  const isCapped = Boolean(active?.section.capped);
  const activeSub_ = activeSub; // narrow for the memo closure
  const activeGridTags = useMemo(() => {
    if (!activeSection) return [];
    const q = searchActive ? normQuery : "";
    if (subTabsMode && activeSub_) return sortTags(filterByQuery(activeSub_.tags, q), sort);
    if (activeSection.subsections) return []; // inline-grouped shape renders its own groups
    const base =
      activeSection.key === "genres" ? genreTags(allTags) : tagsForCategories(domain, allTags, activeSection.categories ?? [], level, totalSeriesCount);
    return sortTags(filterByQuery(base, q), sort);
  }, [activeSection, activeSub_, subTabsMode, searchActive, normQuery, sort, allTags, domain, level, totalSeriesCount]);
  // Resets CappedChipRow's pagination when the list's meaning changes out
  // from under it without a section/sub switch (those already remount via
  // the tabpanel's own key): sort, level, or the live query.
  const gridResetKey = `${level}:${sort}:${searchActive ? normQuery : ""}`;

  return (
    <div className="flex flex-col min-w-0" style={{ gap: STRIP_GAP }}>
      {/* Tabs row — SectionTabStrip on the left, MixerBar's resize grip/
          shortcuts/close button (trailingControls) fixed to the right.
          Same layout convention MixerBar's own old resize-handle row used
          for its filters-vs-cluster split: the scrollable/shrinkable
          child first with min-w-0 (here, SectionTabStrip's own wrapper),
          the fixed child second with shrink-0 (supplied by the caller,
          not this file — trailingControls arrives pre-wrapped). min-w-0
          is what lets SectionTabStrip's own ScrollFadeArea (fitContent,
          unchanged) actually detect overflow and start scrolling once
          trailingControls and the tabs together don't fit, exactly the
          same mechanism the old filters row relied on. rowRef's own
          ResizeObserver (below) measures this whole row, trailingControls
          included, with no extra code needed for that — it already
          measures whatever this row's real rendered height is. */}
      {/* rowRef wraps BOTH tab tiers (a flex-col) so the single existing
          ResizeObserver measurement — and therefore chipAreaHeightPx —
          automatically accounts for the second strip whenever the active
          section renders one, with no extra measurement code. */}
      <div ref={rowRef} className="flex flex-col min-w-0" style={{ gap: STRIP_GAP }}>
        <div className="flex items-center justify-between gap-x-[var(--space-lg)] min-w-0">
          {/* Strip + search share one min-w-0 flex child so the strip's
              ScrollFadeArea still detects overflow against everything to
              its right (trailingControls AND the search cluster), the
              same min-w-0 mechanism the row already relied on. */}
          <div className="flex items-center gap-[var(--space-md)] min-w-0">
            <div className="min-w-0 w-fit">
              <SectionTabStrip
                sections={visibleSections.map(({ section, tags }) => ({
                  key: section.key,
                  label: section.label,
                  selectedCount: tags.filter((t) => selectedTagIds.includes(t.id)).length,
                  dimmed: dimFor(section.key),
                }))}
                activeKey={active.section.key}
                onChange={setActiveSectionKey}
                visible={editMode}
              />
            </div>
            {/* Search: icon at rest, expands to a field — right end of the
                tab strip it operates on. The input is ALWAYS mounted at
                w-0 so open/close is a plain CSS width/opacity transition
                (ladder rung 1: discrete A→B toggle — no Motion) and
                focus() can land synchronously in the opening click.
                Whole-pixel geometry: 24px input in the 30px row, 200px
                open width. First text input in the app — the box recipe
                (thin ink border, surface bg, mono text) mirrors the
                small-control family (TagChip/SortSelect) rather than
                inventing a new treatment. */}
            <div className="flex items-center shrink-0">
              <IconButton
                size="sm"
                border="none"
                backgroundColor="transparent"
                title="Search tags"
                aria-label={searchOpen ? "Close tag search" : "Search tags"}
                aria-expanded={searchOpen}
                onClick={toggleSearch}
              >
                <SearchIcon className={searchOpen ? "text-[var(--ink)]" : "text-[var(--muted)]"} />
              </IconButton>
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                aria-label="Search all tag sections"
                placeholder="search all tags…"
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                className={[
                  "h-[24px] font-mono text-[length:var(--text-sm)] bg-[var(--surface)] text-[var(--ink)]",
                  "placeholder:text-[var(--subtext)] outline-none",
                  "transition-[width,opacity,padding] motion-reduce:transition-none overflow-hidden",
                  searchOpen
                    ? "w-[200px] px-[var(--space-md)] opacity-100 border-[length:var(--border-thin)] border-[var(--ink)]"
                    : "w-0 px-0 opacity-0 border-0 pointer-events-none",
                ].join(" ")}
              />
            </div>
          </div>
          {trailingControls}
        </div>
        {showSubStrip && (
          // max-w-full is load-bearing, not hygiene: this wrapper sits in a
          // flex-COLUMN, where w-fit resolves to max-content (no definite
          // available width, unlike the primary strip's flex-row wrapper,
          // which the row's shrink algorithm constrains) — confirmed live
          // at 500px: the strip rendered 1565px wide, clipped, and
          // ScrollFadeArea saw no overflow so it couldn't scroll. Capping
          // at 100% of the (stretched, definite) row wrapper is what makes
          // the same scroll/arrow treatment as the primary strip kick in.
          <div className="min-w-0 w-fit max-w-full">
            <SectionTabStrip
              size="secondary"
              idBase="tagpool-sub"
              ariaLabel={`${active.section.label} subsections`}
              sections={visibleSubs.map(({ sub, slug, tags }) => ({
                key: slug,
                label: sub.label,
                selectedCount: tags.filter((t) => selectedTagIds.includes(t.id)).length,
                // Same search-dim as the primary tier, one level down.
                dimmed: searchActive ? (searchByKey.get(active.section.key)?.subs?.find((su) => su.slug === slug)?.count ?? 0) === 0 : false,
              }))}
              activeKey={activeSub!.slug}
              onChange={(slug) => setActiveSubKeys((prev) => ({ ...prev, [active.section.key]: slug }))}
              visible={editMode}
            />
          </div>
        )}
      </div>

      {/* key={active.section.key}: forces a clean remount (and therefore a
          reset scroll position) on every section switch — you said
          reset-to-top there is fine, and per-section scroll memory isn't
          worth the complexity for now. Opening/closing edit mode (in
          MixerBar) never touches this key, so this area's scroll position
          is untouched by that — it survives purely because TagPoolBody
          itself stays mounted throughout (see this file's own top
          comment). surfaceColor="var(--surface)": this now sits inside
          MixerBar's bottom-anchored bar, which is a --surface card, not
          directly on the page background the way it was as its own tab —
          see DESIGN_SYSTEM.md's "Super-mixer edit mode" section.
          role=tabpanel/aria-labelledby/tabIndex make this the real target
          of the tab strip's aria-controls above. */}
      <div
        key={subTabsMode && activeSub ? `${active.section.key}:${activeSub.slug}` : active.section.key}
        id={`tagpool-panel-${active.section.key}`}
        role="tabpanel"
        aria-labelledby={`tagpool-tab-${active.section.key}`}
        tabIndex={0}
      >
        <ScrollFadeArea
          height={CHIP_AREA_HEIGHT}
          heightPx={chipAreaHeightPx}
          scrollStep={92}
          fadeSize={4}
          surfaceColor="var(--surface)"
          restrictTouchAction
          pauseMeasurementWhileResizing={isPoolPanelResizing}
        >
          {activeSectionMatches === 0 ? (
            // A dim tab was clicked (or the query matches nothing at all):
            // answer honestly instead of dead-ending on a blank grid, in
            // the mixer's guided-error voice — and when matches exist
            // elsewhere, name the remedy (the lit tabs), the same
            // cause-targeted-recovery shape as RECOMMEND's error chips.
            <div className="flex justify-center py-[var(--space-2xl)]">
              <span className="font-mono text-[length:var(--text-xs)] text-[var(--subtext)]">
                {anyMatches ? `"${normQuery}" not here · check lit tabs` : `"${normQuery}" not in the pool`}
              </span>
            </div>
          ) : subTabsMode && activeSub ? (
            // Sub-tab tier active: one subsection's chips, flat. The inner
            // div is the sub strip's own tabpanel (ids match idBase
            // "tagpool-sub"); the outer panel above stays the primary
            // strip's target, so both tiers' aria-controls resolve. The
            // outer key includes the sub slug, so switching sub-tabs
            // remounts and resets scroll — same decision as sections.
            <div
              id={`tagpool-sub-panel-${activeSub.slug}`}
              role={showSubStrip ? "tabpanel" : undefined}
              aria-labelledby={showSubStrip ? `tagpool-sub-tab-${activeSub.slug}` : undefined}
            >
              {searchActive && activeGridTags.length === 0 ? (
                // The section has matches (the ===0 branch above didn't
                // fire) but THIS sub-tab has none — a dim sub-tab was
                // clicked. v1 only checked at the section tier and showed
                // a silent blank grid here (user-reported); same guided
                // message, one tier down.
                <div className="flex justify-center py-[var(--space-2xl)]">
                  <span className="font-mono text-[length:var(--text-xs)] text-[var(--subtext)]">
                    {`"${normQuery}" not here · check lit tabs`}
                  </span>
                </div>
              ) : isCapped ? (
                <CappedChipRow
                  key={gridResetKey}
                  tags={activeGridTags}
                  countLine={
                    searchActive ? <SearchCountLine shownHere={activeGridTags.length} poolTotal={poolTotalMatches} multiSection={multipleLitTargets} /> : null
                  }
                  selectedTagIds={selectedTagIds}
                  onChipToggle={onChipToggle}
                />
              ) : (
                <div className="flex flex-col gap-[var(--space-md)]">
                  <ChipRow tags={activeGridTags} selectedTagIds={selectedTagIds} onChipToggle={onChipToggle} />
                  {searchActive && <SearchCountLine shownHere={activeGridTags.length} poolTotal={poolTotalMatches} multiSection={multipleLitTargets} />}
                </div>
              )}
            </div>
          ) : active.section.subsections ? (
            <div className="flex flex-col gap-[var(--space-lg)]">
              {active.section.subsections.map((sub) => {
                // applyQuery inside the existing empty-group null-return:
                // during a search, a group with no matches drops out with
                // its label — the inline-grouped shape (anime Theme)
                // filters cleanly with zero extra machinery.
                const subTags = sortTags(applyQuery(tagsForCategories(domain, allTags, sub.categories, level, totalSeriesCount)), sort);
                if (!subTags.length) return null;
                return (
                  <div key={sub.label}>
                    <span className="block font-mono text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] text-[var(--subtext)] uppercase mb-[var(--space-sm)]">
                      {sub.label}
                    </span>
                    <ChipRow tags={subTags} selectedTagIds={selectedTagIds} onChipToggle={onChipToggle} />
                  </div>
                );
              })}
              {/* Grouped shape's count: the section total (sum of the
                  groups above), same pool-wide denominator. */}
              {searchActive && activeSectionMatches > 0 && (
                <SearchCountLine shownHere={activeSectionMatches} poolTotal={poolTotalMatches} multiSection={multipleLitTargets} />
              )}
            </div>
          ) : isCapped ? (
            // Flat capped section (Franchise). Section-level zero matches
            // is already handled by the hint branch above, so this list is
            // never silently empty during a search.
            <CappedChipRow
              key={gridResetKey}
              tags={activeGridTags}
              countLine={
                searchActive ? <SearchCountLine shownHere={activeGridTags.length} poolTotal={poolTotalMatches} multiSection={multipleLitTargets} /> : null
              }
              selectedTagIds={selectedTagIds}
              onChipToggle={onChipToggle}
            />
          ) : (
            <div className="flex flex-col gap-[var(--space-md)]">
              <ChipRow tags={activeGridTags} selectedTagIds={selectedTagIds} onChipToggle={onChipToggle} />
              {searchActive && <SearchCountLine shownHere={activeGridTags.length} poolTotal={poolTotalMatches} multiSection={multipleLitTargets} />}
            </div>
          )}
        </ScrollFadeArea>
      </div>
    </div>
  );
}

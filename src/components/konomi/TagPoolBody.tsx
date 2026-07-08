import { useEffect, useRef, useState } from "react";
import { genreTags, sortTags, TAG_SECTIONS, tagsForCategories, tagsForSection } from "@/lib/konomi/tagPool";
import type { TagInfo } from "@/lib/konomi/types";
import { ScrollFadeArea } from "./ScrollFadeArea";
import { SectionTabStrip } from "./SectionTabStrip";
import { TagChip } from "./TagChip";
import { useLevel, useSort } from "./tagPoolPrefs";

interface TagPoolBodyProps {
  allTags: TagInfo[];
  selectedTags: string[];
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
}

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

function ChipRow({
  tags,
  selectedTags,
  onChipToggle,
}: {
  tags: TagInfo[];
  selectedTags: string[];
  onChipToggle: (tag: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-[var(--space-md)]">
      {tags.map((tag) => (
        <TagChip key={tag.name} name={tag.name} active={selectedTags.includes(tag.name)} onToggle={onChipToggle} />
      ))}
    </div>
  );
}

// Body-only — the section-level chrome (border/shadow/padding) lives in
// MixerBar, which renders this inside its bottom-anchored edit-mode pool
// panel. `level`/`sort` are read directly via useLevel()/useSort() to
// filter/sort chips — Tag Density/Sort's own UI controls (LevelSelector/
// SortSelect) live in MixerBar's resize-handle row instead, not here; see
// that file's own top comment for why they moved there rather than
// sitting in a row of their own above the tabs.
//
// Section navigation is a horizontal tab strip (SectionTabStrip), not
// collapsible sections — see DESIGN_SYSTEM.md for why that replaced the
// old sticky-header/mask machinery entirely rather than keeping it around
// in reduced form.
export function TagPoolBody({ allTags, selectedTags, totalSeriesCount, onChipToggle, poolPanelHeightPx, editMode }: TagPoolBodyProps) {
  const level = useLevel();
  const sort = useSort();
  // Plain component state, not localStorage-backed — TagPoolBody itself
  // never unmounts while browse mode is active (only max-h-0 toggles, in
  // MixerBar), so this alone is enough for the active section and its
  // scroll position to survive closing and reopening edit mode. No
  // requirement was made for this to survive a full page reload, so it
  // isn't persisted beyond the session.
  const [activeSectionKey, setActiveSectionKey] = useState(TAG_SECTIONS[0].key);

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
  const visibleSections = TAG_SECTIONS.map((section) => ({
    section,
    tags: tagsForSection(allTags, section, level, totalSeriesCount),
  })).filter(({ tags }) => tags.length > 0);

  // A Level change (in PanelToggleHeader) can make the currently-active
  // section disappear entirely (e.g. every non-Genres section is empty at
  // Level 1 "Casual") — collapsible sections never had to handle this,
  // since a hidden section just stayed collapsed-and-invisible in place.
  // The fallback (first visible section, always Genres, which passes every
  // level) is computed here at render time rather than written back via
  // setActiveSectionKey in an effect — a plain derived value, not a second
  // synced copy of the state, and it means the *stored* key is left
  // untouched while its section is only temporarily hidden: raise the
  // level back up and the strip resumes showing whatever was actually
  // active before, instead of having permanently reset to Genres the
  // moment it first disappeared.
  const active = visibleSections.find(({ section }) => section.key === activeSectionKey) ?? visibleSections[0];

  return (
    <div className="flex flex-col" style={{ gap: STRIP_GAP }}>
      {/* Tabs row, alone — Tag Density/Sort used to sit inline with these
          tabs in one combined row, responsively shrinking/stacking to
          negotiate the shared width (see git history/DESIGN_SYSTEM.md);
          they've since moved up into MixerBar's resize-handle row instead
          (see that file's own top comment), so this row is just
          SectionTabStrip now, full width, with nothing to negotiate
          against. fitContent inside SectionTabStrip's own ScrollFadeArea
          (unchanged) still makes its hover arrows recompute correctly when
          a Level switch changes which tabs render — that was always this
          row's own self-measurement, never part of the cross-row
          negotiation that got removed. */}
      <div ref={rowRef}>
        <SectionTabStrip
          sections={visibleSections.map(({ section, tags }) => ({
            key: section.key,
            label: section.label,
            selectedCount: tags.filter((t) => selectedTags.includes(t.name)).length,
          }))}
          activeKey={active.section.key}
          onChange={setActiveSectionKey}
          visible={editMode}
        />
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
        key={active.section.key}
        id={`tagpool-panel-${active.section.key}`}
        role="tabpanel"
        aria-labelledby={`tagpool-tab-${active.section.key}`}
        tabIndex={0}
      >
        <ScrollFadeArea height={CHIP_AREA_HEIGHT} heightPx={chipAreaHeightPx} scrollStep={92} fadeSize={4} surfaceColor="var(--surface)" restrictTouchAction>
          {/* pb/pr-[3px]: base-size TagChip carries shadow-[var(--elev-2)]
              (3px 3px 0, bottom-right, no blur). ScrollFadeArea's vertical
              viewport sets overflow-y-auto/overflow-x-hidden, so a chip's
              shadow bleeding past the content's own bottom/right edge gets
              clipped there — same root cause as the results carousel's
              shadow-clipping bug. The fix here is deliberately *not* the
              carousel's pad-then-cancel-with-a-negative-margin pattern,
              though — canceling the padding turned out to create a
              different real bug: `scrollHeight` doesn't shrink back down to
              match a negative margin the way normal `height:auto` layout
              does, so the canceled version still measured `scrollHeight`
              a few px taller than `clientHeight`, tripping ScrollFadeArea's
              `hasOverflow` check and showing a scrollbar/fade/arrows for
              sections that should render with zero scroll affordance at
              all (confirmed live). The viewport itself is a fixed height
              now (see CHIP_AREA_HEIGHT above), so this padding only ever
              grows the *inner*, independently-scrollable content by 3px —
              nothing outside this box depends on that inner content's
              exact footprint, so there's no invariant to protect the way
              the carousel has, and the simpler, correct fix is to just let
              it legitimately grow by 3px to fit the shadow, uncanceled.
              Same approach the older CollapsibleSection-era fix for this
              exact problem used (a plain last:mb-md, not a cancel trick). */}
          <div className="pb-[3px] pr-[3px]">
            {active.section.subsections ? (
              <div className="flex flex-col gap-[var(--space-lg)]">
                {active.section.subsections.map((sub) => {
                  const subTags = sortTags(tagsForCategories(allTags, sub.categories, level, totalSeriesCount), sort);
                  if (!subTags.length) return null;
                  return (
                    <div key={sub.label}>
                      <span className="block font-mono text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] text-[var(--subtext)] uppercase mb-[var(--space-sm)]">
                        {sub.label}
                      </span>
                      <ChipRow tags={subTags} selectedTags={selectedTags} onChipToggle={onChipToggle} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <ChipRow
                tags={sortTags(
                  active.section.key === "genres"
                    ? genreTags(allTags)
                    : tagsForCategories(allTags, active.section.categories ?? [], level, totalSeriesCount),
                  sort,
                )}
                selectedTags={selectedTags}
                onChipToggle={onChipToggle}
              />
            )}
          </div>
        </ScrollFadeArea>
      </div>
    </div>
  );
}

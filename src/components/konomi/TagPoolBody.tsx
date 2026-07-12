import { useState } from "react";
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

// Gap between the tabs row and the chip area, applied as the flex-column
// gap on this component's root — the chip area (flex-1) fills whatever
// height is left after the tabs row (shrink-0) and this gap, entirely via
// flexbox. The chip area no longer receives a computed pixel height: its
// ancestor dialogRef (in MixerBar) carries the real, motion-value-driven
// pool-panel height, and this component just flex-fills it, so a live
// resize reflows the chips with no React re-render per frame (see
// ScrollFadeArea's `fill` prop and MixerBar's single-source motion value).
const STRIP_GAP = 12; // --space-lg

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
        <TagChip key={tag.name} name={tag.name} size="small" active={selectedTags.includes(tag.name)} onToggle={onChipToggle} />
      ))}
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
  selectedTags,
  totalSeriesCount,
  onChipToggle,
  editMode,
  trailingControls,
  isPoolPanelResizing,
}: TagPoolBodyProps) {
  const level = useLevel();
  const sort = useSort();
  // Plain component state, not localStorage-backed — TagPoolBody itself
  // never unmounts while browse mode is active (only max-h-0 toggles, in
  // MixerBar), so this alone is enough for the active section and its
  // scroll position to survive closing and reopening edit mode. No
  // requirement was made for this to survive a full page reload, so it
  // isn't persisted beyond the session.
  const [activeSectionKey, setActiveSectionKey] = useState(TAG_SECTIONS[0].key);

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
    // flex-1 min-h-0: fill the motion-value-sized dialog (MixerBar's
    // dialogRef, a flex column) so the chip area below can flex-fill the
    // height left after the tabs row — no pixel height threaded in.
    <div className="flex flex-col flex-1 min-h-0" style={{ gap: STRIP_GAP }}>
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
      <div className="flex items-center justify-between gap-x-[var(--space-lg)] shrink-0">
        <div className="min-w-0 w-fit">
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
        {trailingControls}
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
        // flex-1 min-h-0 flex flex-col: fill the height left after the tabs
        // row and let the ScrollFadeArea (fill) below flex-fill this in turn.
        className="flex-1 min-h-0 flex flex-col"
      >
        <ScrollFadeArea
          fill
          scrollStep={92}
          fadeSize={4}
          surfaceColor="var(--surface)"
          restrictTouchAction
          pauseMeasurementWhileResizing={isPoolPanelResizing}
        >
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
        </ScrollFadeArea>
      </div>
    </div>
  );
}

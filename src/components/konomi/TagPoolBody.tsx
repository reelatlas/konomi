import { useEffect, useRef, useState } from "react";
import { genreTags, sortTags, TAG_SECTIONS, tagsForCategories, tagsForSection } from "@/lib/konomi/tagPool";
import type { LevelKey, TagInfo } from "@/lib/konomi/types";
import { SortIcon, TagIcon } from "./icons";
import { LevelSelector } from "./LevelSelector";
import { ScrollFadeArea } from "./ScrollFadeArea";
import { SectionTabStrip } from "./SectionTabStrip";
import { SortSelect } from "./SortSelect";
import { TagChip } from "./TagChip";
import { setSortPref, useLevel, useSort } from "./tagPoolPrefs";

interface TagPoolBodyProps {
  allTags: TagInfo[];
  selectedTags: string[];
  totalSeriesCount: number;
  onLevelChange: (level: LevelKey) => void;
  onChipToggle: (tag: string) => void;
  // MixerBar's resize-handle-driven height (default 50% of viewport on
  // first open, or whatever the user has since dragged/persisted) — the
  // pool panel's *total* height budget, not the chip area alone. This
  // component reduces it by its own live-measured tabs+filters row height
  // (see rowHeightPx below) to get the chip area's actual height, rather
  // than MixerBar guessing that reduction itself — MixerBar has no
  // visibility into this row's real height, which now varies by
  // breakpoint (inline vs. stacked, see the combined row below).
  // Undefined only pre-hydration/no-JS, where CHIP_AREA_HEIGHT below is
  // the fallback. See ScrollFadeArea's heightPx prop for why this can't
  // just be a computed Tailwind class.
  poolPanelHeightPx?: number;
}

// Filters' own rendered width, icon-only (TagIcon+LevelSelector+SortIcon+
// SortSelect, no "Tag Density"/"Sort" text) — measured live, a fixed
// constant like LABEL_DELTA_PX below, not a live ScrollFadeArea
// measurement. This *was* read live (filtersScrollWidth, via the filters'
// own ScrollFadeArea onMeasure) and reconstructed for the full-label case
// via a ternary keyed off filtersCompact — confirmed live as the actual
// cause of a real infinite-loop crash ("Too many re-renders"), not a
// hypothetical: that ternary assumes filtersScrollWidth always reflects
// whichever state filtersCompact currently claims, which silently breaks
// the moment the two get out of sync — exactly what happens inside a fast
// render loop, where React can flip filtersCompact/stacked many times
// before the browser ever gets a chance to actually lay out the DOM and
// fire a fresh ResizeObserver measurement. Reproduced and confirmed via a
// trace: filtersScrollWidth stayed frozen at its pre-loop value (482, the
// full-label width) across the entire loop, while filtersCompact kept
// flipping — each flip re-interpreted that same frozen number as meaning
// something different (once as "this IS the icon-only width," once as
// "this IS the full-label width"), which is precisely a decision reading
// a measured width of the thing it's deciding — the exact class of
// oscillation the resize-handle-row and reset/snap-arrow fixes exist to
// prevent (see DESIGN_SYSTEM.md). Both LABEL_DELTA_PX and this constant
// are hardcoded specifically so neither icon-collapse nor stacking ever
// depends on anything the filters' own render state affects — only
// rowWidthPx and tabsScrollWidth (both independent of filtersCompact/
// stacked) are live-measured inputs to those decisions now.
//
// Measured snapshot, not a magic number — frozen into a constant to break
// the oscillation loop. Re-measure if the filters' labels, icons, padding,
// or SORT/density options change, or the ladder will mistime.
const FILTERS_ICON_ONLY_WIDTH_PX = 371;
// Combined width of "Tag Density"/"Sort" labels plus the gap each one
// leaves behind once hidden (gap only applies between actually-rendered
// flex children, so hiding a label collapses its own leading gap too) —
// measured live: "Tag Density" 72.6px + "Sort" 26.4px + 2×6px (gap-sm)
// = 111px. Fixed for the same reason FILTERS_ICON_ONLY_WIDTH_PX above is —
// see that constant's comment for the full story of why this can no
// longer be reconstructed from a live measurement.
//
// Measured snapshot, not a magic number — frozen into a constant to break
// the oscillation loop. Re-measure if the filters' labels, icons, padding,
// or SORT/density options change, or the ladder will mistime.
const LABEL_DELTA_PX = 111;
// The combined row's own gap between tabs and filters when inline —
// duplicated from the JSX's gap-x-[var(--space-lg)] class below rather
// than read from the DOM, since it's a fixed token value or the two would
// need to be kept in sync anyway; retune both together if that gap token
// ever changes.
const GAP_X_PX = 12;
const STRIP_GAP = 12; // --space-lg
// Bootstrap-only fallback for rowHeightPx (below) before the first real
// ResizeObserver measurement lands — STRIP_GAP + SectionTabStrip's own
// ~30px, the combined row's old (tabs-only, inline) height. Not retuned
// for the filters row's own height (taller, ~36.5px) or the stacked
// (2-row) case — both are handled correctly by the live measurement
// itself; this only needs to be a reasonable one-frame placeholder, the
// same role EDIT_MODE_FIXED_ROWS_HEIGHT plays for MixerBar's own
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
// panel. Level/Sort now live here too (moved down from MixerBar's own
// header row, which was removed entirely — see MixerBar.tsx's own top
// comment), inline with SectionTabStrip's tabs in one combined row: `level`
// is read directly via useLevel() (mirroring how `sort` already reads
// useSort() itself below), not threaded as a prop — only `onLevelChange`
// stays a prop, since that setter still has to reach back into KonomiApp's
// pruneTags cascade, the same read-path/write-path split MixerBar's own
// comment already documented before this control lived here.
//
// Section navigation is a horizontal tab strip (SectionTabStrip), not
// collapsible sections — see DESIGN_SYSTEM.md for why that replaced the
// old sticky-header/mask machinery entirely rather than keeping it around
// in reduced form.
export function TagPoolBody({ allTags, selectedTags, totalSeriesCount, onLevelChange, onChipToggle, poolPanelHeightPx }: TagPoolBodyProps) {
  const level = useLevel();
  const sort = useSort();
  // Plain component state, not localStorage-backed — TagPoolBody itself
  // never unmounts while browse mode is active (only max-h-0 toggles, in
  // MixerBar), so this alone is enough for the active section and its
  // scroll position to survive closing and reopening edit mode. No
  // requirement was made for this to survive a full page reload, so it
  // isn't persisted beyond the session.
  const [activeSectionKey, setActiveSectionKey] = useState(TAG_SECTIONS[0].key);

  // Live-measured height of the combined tabs+filters row below — replaces
  // a flat constant (the old TABS_HEIGHT) because this row's real height
  // now varies by breakpoint (one line when filters sit inline with the
  // tabs, two when they stack above it), the same "hardcoded worst-case
  // vs. live ResizeObserver" tradeoff MixerBar's own fixedOverheadPx
  // already made for the same reason. rowRef wraps both children (tabs +
  // filters) together, not each separately, since it's their *combined*
  // rendered height being subtracted from poolPanelHeightPx below. Also
  // doubles as the source of rowWidthPx (below) — this row's own width is
  // exactly "how much total horizontal space tabs+filters have to split
  // between them," stable regardless of which of them currently has it,
  // so one ResizeObserver on one element covers both needs.
  const rowRef = useRef<HTMLDivElement>(null);
  const [rowHeightPx, setRowHeightPx] = useState<number | null>(null);
  const [rowWidthPx, setRowWidthPx] = useState<number | null>(null);
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const observer = new ResizeObserver(([entry]) => {
      setRowHeightPx(entry.contentRect.height);
      setRowWidthPx(entry.contentRect.width);
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, []);
  const chipAreaHeightPx =
    poolPanelHeightPx !== undefined ? Math.max(CHIP_AREA_MIN, poolPanelHeightPx - (rowHeightPx ?? ROW_HEIGHT_BOOTSTRAP) - STRIP_GAP) : undefined;

  // The tab strip's own intrinsic content width — fed by the same
  // ScrollFadeArea measurement pass that drives its own hover arrows
  // (onScrollWidthChange, see SectionTabStrip), not a second, competing
  // measurement. This is the *only* live-measured input to the
  // icon-collapse/stack decisions below — filters' own width is now a
  // fixed constant (FILTERS_ICON_ONLY_WIDTH_PX above), not read live; see
  // that constant's comment for why.
  const [tabsScrollWidth, setTabsScrollWidth] = useState(0);

  // Icon-collapse and stacking, driven by real overflow (reconstructed),
  // not fixed px breakpoints — a fixed threshold (the previous
  // @min-[700px]/min-[500px] pair) stays tuned to whatever content existed
  // when it was bisected and drifts out of sync the moment tab counts
  // change (a Level switch) or anything else about this row's content
  // does. Both booleans below are settled during render (the same pattern
  // canShowResizeHandleRow in MixerBar.tsx uses, not a useEffect — see
  // that state's own comment for why a useEffect here would trip this
  // repo's react-hooks/set-state-in-effect lint rule) rather than read as
  // a raw comparison inline, because these transitions change the very
  // widths they measure: collapsing labels frees width that could
  // un-overflow the tabs (re-expanding labels, re-overflowing, re-
  // collapsing — a loop), and stacking hands tabs the *entire* row's width
  // (could un-overflow, un-stacking, re-sharing the row, re-overflowing,
  // re-stacking — the same loop one level up). Settling each decision
  // against the currently-committed state, rather than re-deriving it from
  // scratch every render, is what breaks that.
  //
  // Both hypotheticals are computed from rowWidthPx and tabsScrollWidth
  // (both live) plus FILTERS_ICON_ONLY_WIDTH_PX/LABEL_DELTA_PX (both
  // fixed) — none of which change as a *side effect* of filtersCompact/
  // stacked flipping: rowWidthPx comes from the row's own container,
  // unrelated to its children's states; tabsScrollWidth reflects only tab
  // content (Level, not layout); the two filters constants are fixed by
  // definition. Filters' own *live* scrollWidth deliberately isn't one of
  // these inputs anymore — see FILTERS_ICON_ONLY_WIDTH_PX's own comment for
  // the infinite-loop bug that came from using it here.
  const [filtersCompact, setFiltersCompact] = useState(true);
  const [stacked, setStacked] = useState(false);

  // Bootstrap guard: rowWidthPx starts null and tabsScrollWidth starts at
  // 0 before their first real ResizeObserver/onMeasure callback lands
  // (same one-render gap fixedOverheadPx/rowHeightPx already have
  // elsewhere in this file). Without it, rowWidthPx's placeholder null
  // would read as "infinite room," which would flip filtersCompact/stacked
  // away from their safe defaults on a measurement that hasn't actually
  // happened yet. Holding off the settle-adjustment until both are real
  // avoids that; the safe initial defaults (compact, unstacked) stand
  // until then.
  const measurementsReady = rowWidthPx !== null && tabsScrollWidth > 0;
  const filtersWidthFullLabel = FILTERS_ICON_ONLY_WIDTH_PX + LABEL_DELTA_PX;

  // Stacking: would tabs still overflow sharing the row with icon-only
  // filters (the most room filters can give up while still inline)? If
  // so, stack.
  const tabsAvailableIconOnly = measurementsReady ? rowWidthPx - FILTERS_ICON_ONLY_WIDTH_PX - GAP_X_PX : Number.POSITIVE_INFINITY;
  const wouldOverflowIconOnlyInline = tabsScrollWidth > tabsAvailableIconOnly;
  const nextStacked = measurementsReady ? wouldOverflowIconOnlyInline : stacked;

  // Icon-collapse is mode-dependent — what filters are competing *against*
  // for room is different in each layout, so "would full labels fit" has
  // to ask a different question in each: inline, filters share the row
  // with tabs, so full labels collapse pre-emptively the moment they'd
  // push tabs into overflow (protects tabs, the responsive ladder's whole
  // point). Stacked, filters have the entire row to themselves — nothing
  // else is competing for that space — so the only question is whether
  // full labels fit in the row alone; there's no reason to remain
  // icon-only just because inline mode once needed it. Evaluated against
  // nextStacked (the decision this render is about to settle on), not the
  // stale committed `stacked`, so both flip together on the same render
  // when the mode itself changes, rather than icon-collapse lagging a
  // render behind the mode switch that motivated it.
  const wouldOverflowFullLabelInline = measurementsReady && tabsScrollWidth > rowWidthPx - filtersWidthFullLabel - GAP_X_PX;
  const wouldOverflowFullLabelStacked = measurementsReady && filtersWidthFullLabel > rowWidthPx;
  const nextFiltersCompact = measurementsReady
    ? nextStacked
      ? wouldOverflowFullLabelStacked
      : wouldOverflowFullLabelInline
    : filtersCompact;

  if (nextFiltersCompact !== filtersCompact) setFiltersCompact(nextFiltersCompact);
  if (nextStacked !== stacked) setStacked(nextStacked);

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
      {/* Combined tabs+filters row — Tag Density/Sort moved down from
          MixerBar's own now-removed header row (see MixerBar.tsx's top
          comment) to sit inline with the section tabs instead, rather than
          keeping a whole separate header row just for two filter controls.

          filtersCompact/stacked (above) replace what used to be two fixed
          CSS breakpoints (@min-[700px] labels, min-[500px] stack) — those
          were bisected against one specific tab/filter combination and
          silently drifted out of sync the moment content changed (a Level
          switch changing which tabs render), which is exactly the bug this
          rewrite fixes. Same responsive ladder as before, now driven by
          real (reconstructed) overflow instead of a guessed pixel width:
          shrink labels first (frees room, stays inline), stack only if
          that alone isn't enough, tabs' own horizontal scroll
          (SectionTabStrip's ScrollFadeArea) as the automatic last resort.

          flex-col-reverse + a JS-computed flex-row switch (the same "hard
          breakpoint, not organic flex-wrap" *shape* ResultsHeader's own
          two-group row uses, now driven by `stacked` instead of a
          Tailwind breakpoint): DOM order is [tabs, filters], so
          col-reverse alone — no order-* utilities needed — puts filters
          visually *above* tabs once stacked (filters is second in DOM,
          which col-reverse renders first/top), while flex-row reads that
          same DOM order left-to-right as-is (tabs left, filters right).
          Both wrappers need w-full in the stacked state, not just the tabs
          one — confirmed live as a real bug otherwise: w-fit's cross-axis
          sizing in a *column* flex container isn't clamped by the parent's
          own width the way min-w-0 clamps a *row* item along the main axis
          (there's no flex-shrink math on the cross axis), so the filters
          wrapper rendered at its full unclamped content width and visibly
          bled past the card's right edge instead of triggering
          ScrollFadeArea's own overflow-scroll. items-center/justify-between
          only apply when NOT stacked — meaningless (and not what's wanted)
          in the stacked column state. gap-y-[var(--space-lg)] (not
          space-sm) matches the gap MixerBar's own tag-slots row uses below
          itself before the controls row — same "gap between a fixed row
          and the row it stacks above/before" rhythm, applied here between
          the filters row and the tabs row once stacked, for the same
          reason: consistent breathing room between adjacent rows
          throughout this bar, not a smaller one-off just because this
          particular pair can also render on one line. */}
      <div
        ref={rowRef}
        className={["flex gap-y-[var(--space-lg)]", stacked ? "flex-col-reverse" : "flex-row items-center justify-between gap-x-[var(--space-lg)]"].join(
          " ",
        )}
      >
        <div className={["min-w-0", stacked ? "" : "flex-1"].join(" ")}>
          <SectionTabStrip
            sections={visibleSections.map(({ section, tags }) => ({
              key: section.key,
              label: section.label,
              selectedCount: tags.filter((t) => selectedTags.includes(t.name)).length,
            }))}
            activeKey={active.section.key}
            onChange={setActiveSectionKey}
            onScrollWidthChange={setTabsScrollWidth}
          />
        </div>
        {/* -mt-[20px]/-mb-[4px]/-mr-[4px] cancel the pt-[20px]/pb-[4px]/
            pr-[4px] on the scrollable content below — pad-then-cancel, not
            pad-and-let-grow, matching the same fix (and the same
            reasoning) this block used back when it lived in MixerBar's
            Row 1 aligned against the title: the padding exists so
            ScrollFadeArea's own overflow-y-hidden viewport doesn't clip
            LevelSelector/SortSelect's shadow bleed or LevelSelector's
            hover-subtext, and canceling it out here (not on the padded
            element itself) keeps that clipping fix intact while stopping
            the padding from inflating this wrapper's own box and throwing
            off its alignment against SectionTabStrip's tabs. Padding is
            asymmetric (pt-20 vs pb-4) because the hover-subtext now
            renders *above* LevelSelector (see that component's own
            comment for why), not below — pt-20 covers its worst case
            (the control's own top edge + mb-space-xs + its own text-xs
            line height); pb-4/pr-4 only need to cover the controls' own
            shadow-[var(--elev-2)] bleed (3px bottom/right), unrelated to
            the subtext, unchanged in direction from before. */}
        <div className={["min-w-0 -mt-[20px] -mb-[4px] -mr-[4px]", stacked ? "w-full" : "w-fit"].join(" ")}>
          {/* fitContent: this group's children (label/icon/selector pairs)
              are naturally sized, same reasoning as SectionTabStrip's own
              fitContent — see ScrollFadeArea's own comment on that prop. */}
          <ScrollFadeArea orientation="horizontal" scrollStep={140} fadeSize={12} fitContent>
            <div className="flex items-center gap-[var(--space-lg)] flex-nowrap pt-[20px] pb-[4px] pr-[4px]">
              <div className="flex items-center gap-[var(--space-sm)] shrink-0">
                {!filtersCompact && (
                  <span className="font-mono font-bold text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] uppercase whitespace-nowrap">
                    Tag Density
                  </span>
                )}
                <TagIcon className="text-[var(--ink)]" />
                <LevelSelector value={level} onChange={onLevelChange} />
              </div>
              <div className="flex items-center gap-[var(--space-sm)] shrink-0">
                {!filtersCompact && (
                  <span className="font-mono font-bold text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] uppercase whitespace-nowrap">
                    Sort
                  </span>
                )}
                <SortIcon className="text-[var(--ink)]" />
                <SortSelect value={sort} onChange={setSortPref} />
              </div>
            </div>
          </ScrollFadeArea>
        </div>
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
        <ScrollFadeArea height={CHIP_AREA_HEIGHT} heightPx={chipAreaHeightPx} scrollStep={92} fadeSize={4} surfaceColor="var(--surface)">
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

import { useState } from "react";
import { genreTags, sortTags, TAG_SECTIONS, tagsForCategories, tagsForSection } from "@/lib/konomi/tagPool";
import type { LevelKey, TagInfo } from "@/lib/konomi/types";
import { ScrollFadeArea } from "./ScrollFadeArea";
import { SectionTabStrip } from "./SectionTabStrip";
import { TagChip } from "./TagChip";
import { useSort } from "./tagPoolPrefs";

interface TagPoolBodyProps {
  allTags: TagInfo[];
  selectedTags: string[];
  totalSeriesCount: number;
  level: LevelKey;
  onChipToggle: (tag: string) => void;
}

const STRIP_GAP = 12; // --space-lg
// max-h-, not h- — a short section (Genres, Setting, Demographic) should
// hug its own content and render shorter than Recommendations, not pad out
// to match it every time; a long one (Theme) still caps at the same
// ceiling Recommendations uses and scrolls past it. This is a deliberate
// departure from the older fixed-height version's invariant ("both tabs
// render at the exact same total height, always") — switching from a short
// Tag Pool section to Recommendations (or vice versa) can now visibly
// change the panel's height, by choice, in exchange for not showing a
// mostly-empty 445px box for a 2-tag section. --result-card-height minus
// the tab strip + gap it now sits below is still the *ceiling*, not a
// fixed value — ScrollFadeArea's own overflow-detection (scrollHeight vs
// clientHeight) needs no changes to support a max-h box: clientHeight
// already equals natural content height whenever that's under the cap.
//
// This has to be a literal string, not built via template interpolation
// (e.g. `` `max-h-[calc(...)-${tabStripHeight + STRIP_GAP}px)]` ``) —
// Tailwind's scanner needs the full class as static source text to
// generate its CSS; a runtime-computed template literal is invisible to it
// and silently produces no rule at all. Confirmed live as a real bug while
// building this: an interpolated version rendered with no height
// constraint whatsoever (height:auto, the whole Theme section stacked to
// ~1066px). The 42px below = the tab strip's own rendered height (30px,
// measured live against the real component, not estimated) + STRIP_GAP
// (12px) — keep this literal in sync by hand if either changes.
const CHIP_AREA_HEIGHT = "max-h-[calc(var(--result-card-height)-42px)]";

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

// Body-only — the section-level chrome (border/shadow/padding) and the
// title/controls header both moved out to TagPoolRecommendationsPanel and
// PanelToggleHeader respectively, once Tag Pool became a tab sharing one
// card with Recommendations instead of its own independent section. `level`
// is still a prop (needed to filter which tags render), but there's no
// `onLevelChange` here anymore — that control now lives in the header,
// which calls the same handler directly.
//
// Section navigation is a horizontal tab strip (SectionTabStrip), not
// collapsible sections — see DESIGN_SYSTEM.md for why that replaced the
// old sticky-header/mask machinery entirely rather than keeping it around
// in reduced form.
export function TagPoolBody({ allTags, selectedTags, totalSeriesCount, level, onChipToggle }: TagPoolBodyProps) {
  const sort = useSort();
  // Plain component state, not localStorage-backed — TagPoolBody itself
  // never unmounts while the Recommendations tab is active (only `hidden`
  // toggles, in TagPoolRecommendationsPanel), so this alone is enough for
  // the active section and its scroll position to survive switching to
  // Recommendations and back. No requirement was made for this to survive
  // a full page reload, so it isn't persisted beyond the session.
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
    <div className="flex flex-col" style={{ gap: STRIP_GAP }}>
      <SectionTabStrip
        sections={visibleSections.map(({ section, tags }) => ({
          key: section.key,
          label: section.label,
          selectedCount: tags.filter((t) => selectedTags.includes(t.name)).length,
        }))}
        activeKey={active.section.key}
        onChange={setActiveSectionKey}
      />

      {/* key={active.section.key}: forces a clean remount (and therefore a
          reset scroll position) on every section switch — you said
          reset-to-top there is fine, and per-section scroll memory isn't
          worth the complexity for now. Switching the *panel* tab (to
          Recommendations and back) never touches this key, so this area's
          scroll position is untouched by that — it survives purely because
          TagPoolBody itself stays mounted throughout (see this file's own
          top comment). surfaceColor="var(--bg)": this sits directly on the
          page background, not a --surface card (Tag Pool has no card shell
          of its own — see "Tag Pool and Recommendations became two tabs" in
          DESIGN_SYSTEM.md). role=tabpanel/aria-labelledby/tabIndex make
          this the real target of the tab strip's aria-controls above. */}
      <div
        key={active.section.key}
        id={`tagpool-panel-${active.section.key}`}
        role="tabpanel"
        aria-labelledby={`tagpool-tab-${active.section.key}`}
        tabIndex={0}
      >
        <ScrollFadeArea height={CHIP_AREA_HEIGHT} scrollStep={92} fadeSize={4} surfaceColor="var(--bg)">
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
              all (confirmed live). Since this area now hugs rather than
              holding a fixed height (see CHIP_AREA_HEIGHT above), there's
              no exact-footprint invariant to protect the way the carousel
              has — so the simpler, correct fix is to just let the box
              legitimately grow by 3px to fit the shadow, uncanceled. Same
              approach the older CollapsibleSection-era fix for this exact
              problem used (a plain last:mb-md, not a cancel trick). */}
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

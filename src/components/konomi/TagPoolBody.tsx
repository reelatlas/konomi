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
// hug its own content, not pad out to match a fixed ceiling every time; a
// long one (Theme) caps and scrolls past it. dvh, not vh: this cap lives
// inside MixerBar's bottom sheet, and dvh avoids the well-known mobile
// Safari/Chrome dynamic-toolbar jump plain vh produces (see MixerBar.tsx's
// own top comment — same reasoning, this is the one place it actually
// bites). This used to be pegged to --result-card-height (this component's
// old container was a page-width tab matching Recommendations' height);
// now that it lives in a capped bottom sheet instead, that peg no longer
// means anything, so this caps against the viewport directly.
//
// Literal string, not built via template interpolation — Tailwind's
// scanner needs the full class as static source text to generate its CSS;
// a runtime-computed template literal is invisible to it and silently
// produces no rule at all (confirmed live as a real bug once, before this
// was a literal).
const CHIP_AREA_HEIGHT = "max-h-[50dvh]";

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
// Level/Sort header both live in MixerBar now, which renders this inside
// its bottom-anchored edit-mode pool panel. `level` is still a prop (needed
// to filter which tags render), but there's no `onLevelChange` here — that
// control lives in MixerBar, which calls the same handler directly.
//
// Section navigation is a horizontal tab strip (SectionTabStrip), not
// collapsible sections — see DESIGN_SYSTEM.md for why that replaced the
// old sticky-header/mask machinery entirely rather than keeping it around
// in reduced form.
export function TagPoolBody({ allTags, selectedTags, totalSeriesCount, level, onChipToggle }: TagPoolBodyProps) {
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
        <ScrollFadeArea height={CHIP_AREA_HEIGHT} scrollStep={92} fadeSize={4} surfaceColor="var(--surface)">
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

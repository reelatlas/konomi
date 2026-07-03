import { useCallback, useRef, useState } from "react";
import { genreTags, sortTags, TAG_SECTIONS, tagsForCategories, tagsForSection } from "@/lib/konomi/tagPool";
import type { LevelKey, TagInfo } from "@/lib/konomi/types";
import { CollapsibleSection, SectionHeaderLabel, useSectionExpanded } from "./CollapsibleSection";
import { ScrollFadeArea } from "./ScrollFadeArea";
import { TagChip } from "./TagChip";
import { useSort } from "./tagPoolPrefs";

interface TagPoolBodyProps {
  allTags: TagInfo[];
  selectedTags: string[];
  totalSeriesCount: number;
  level: LevelKey;
  onChipToggle: (tag: string) => void;
}

// Fixed, not a cap — this is the one real change from the pre-tab
// TagPoolSection. Both this and RecommendationsBody now render inside one
// shared card shell (TagPoolRecommendationsPanel) with only one body visible
// at a time, so their heights must match exactly or the shell visibly
// resizes on every tab switch — the same "no jarring height change" problem
// already solved once for the empty-state/results-grid transition (see
// RecommendationsBody's own placeholder comment). --result-card-height is
// the reference: Recommendations' body is always exactly that tall
// (ResultCard's own fixed height, or the empty-state placeholder's matching
// min-height), so Tag Pool's scroll area now targets the same token instead
// of its own independently-tuned cap. This makes Tag Pool's own scrollable
// height go up slightly (was max-h-380px) even though the *section's*
// overall footprint gets shorter overall, since its former header (title +
// hint + Level/Sort, now external — see PanelToggleHeader) no longer adds
// height inside this card at all. ScrollFadeArea's overflow-fade-and-arrow
// mechanism doesn't care which of the two forms (h- vs max-h-) it's given,
// or what the number is — confirmed live that content still scrolls,
// fades, and reveals arrows correctly at this new value; nothing is clipped
// or unreachable, exactly as before.
const POOL_AREA_HEIGHT = "h-[var(--result-card-height)]";
// Rendered height of a sticky CollapsibleSection header button (text-lg
// line + py-xs top/bottom padding) — measured live against the live
// component, not estimated. Keeps ScrollFadeArea's top gradient/arrow from
// rendering underneath the sticky header, and doubles as the unmasked
// overlay's own height below. Unrelated to (and unaffected by) the
// panel-level header moving out of this file — this is about each
// CollapsibleSection's own internal sticky title bar, inside the scroll
// area itself.
const SECTION_HEADER_HEIGHT = 38;
// The mask's flat (fully-transparent, not ramping) zone — exactly the
// header's own height, so nothing behind a header, anywhere within its own
// band, is ever partially visible (see ScrollFadeArea's topMaskFlatSize).
const TOP_MASK_FLAT_SIZE = SECTION_HEADER_HEIGHT;
// A short ramp past the flat zone (was 46px) — real headers no longer rely
// on the ramp for cover at all (that's `hiddenKeys`' job now, a separate
// JS-driven mechanism independent of the mask's own shape), so the ramp's
// only remaining purpose is a bit of depth cue for chips specifically, the
// same role the bottom edge's small `fadeSize` already plays there. A wide
// 46px ramp read as a slow, lingering "faded outro" — confirmed live it
// didn't match the snappy, near-instant disappearance the bottom edge
// already has; a short ramp gives chips that same clean, sudden cutoff.
const TOP_MASK_RAMP_PX = 8;
const TOP_MASK_SIZE = TOP_MASK_FLAT_SIZE + TOP_MASK_RAMP_PX;

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

// The single unmasked copy of whichever section is "at the top" right now —
// rendered by ScrollFadeArea as a plain sibling of the masked/scrollable
// content (see its `stickyOverlay` prop), so it's never a descendant of the
// element `topMaskSize` erases. Reads/writes the *same* expand state the
// real (now-hidden-while-active) header drives via useSectionExpanded, so
// clicking this one toggles the real section, not a second copy of it.
function ActiveSectionOverlay({
  title,
  storageKey,
  defaultExpanded,
  selectedCount,
}: {
  title: string;
  storageKey: string;
  defaultExpanded: boolean;
  selectedCount: number;
}) {
  const [expanded, setExpandedState] = useSectionExpanded(storageKey, defaultExpanded);
  return (
    <button
      type="button"
      onClick={() => setExpandedState(!expanded)}
      aria-expanded={expanded}
      className="absolute top-0 inset-x-0 z-[var(--z-sticky)] flex items-center h-[38px] cursor-pointer bg-transparent border-0 text-left text-[var(--ink)]"
    >
      <SectionHeaderLabel title={title} selectedCount={selectedCount} expanded={expanded} />
    </button>
  );
}

// Body-only — the section-level chrome (border/shadow/padding) and the
// title/controls header both moved out to TagPoolRecommendationsPanel and
// PanelToggleHeader respectively, once Tag Pool became a tab sharing one
// card with Recommendations instead of its own independent section. `level`
// is still a prop (needed to filter which tags render), but there's no
// `onLevelChange` here anymore — that control now lives in the header,
// which calls the same handler directly.
export function TagPoolBody({ allTags, selectedTags, totalSeriesCount, level, onChipToggle }: TagPoolBodyProps) {
  const sort = useSort();
  const sectionRefs = useRef(new Map<string, HTMLDivElement>());
  const headerRefs = useRef(new Map<string, HTMLButtonElement>());
  // Which section the crisp overlay currently shows a title for — the one
  // with the smallest relTop among every section currently within the
  // mask's reach (pinned, or still approaching it). Not restricted to "is
  // this exactly pinned" (relTop <= 0) — a section that's merely
  // approaching still needs its real header hidden (see the imperative
  // opacity write in recomputeActive below), and picking it as the overlay
  // target *as soon as* it's hidden, rather than waiting for exact pinning,
  // is what closes the gap where an incoming section was hidden but had no
  // overlay covering for it yet — confirmed live as a blank flash.
  const [overlayKey, setOverlayKey] = useState<string | null>(null);

  // useCallback (stable identity, empty deps — the ref Maps are always the
  // same objects): this gets passed down to ScrollFadeArea's
  // `onScrollContainerMount`, which itself only re-invokes when *this*
  // function reference changes (see that component's own doc comment on
  // why). A plain function here would be a new reference every render,
  // defeating that stability and reintroducing the infinite-render-loop bug
  // this whole chain was built to avoid.
  //
  // Real headers' opacity is set here directly via el.style, not through
  // React state/className — confirmed live that going through state (one
  // render + commit + paint cycle behind the raw scroll position) was
  // visibly one frame late during fast, continuous scrolling: a header
  // could flash briefly visible-and-masked before its hidden state caught
  // up. Mutating style.opacity synchronously, in the same tick as the
  // measurement, removes that gap entirely — the header's visual state
  // updates in lockstep with scroll, same as the browser's own native
  // `position: sticky` recalculation already does. `overlayKey` (which
  // title the crisp overlay shows) stays as React state — a single text
  // swap is far less perceptible than a whole header flickering, so it
  // doesn't need the same treatment.
  const recomputeActive = useCallback((scrollEl: HTMLDivElement) => {
    const top = scrollEl.getBoundingClientRect().top;
    let bestKey: string | null = null;
    let bestTop = Infinity;
    for (const [key, el] of sectionRefs.current) {
      const r = el.getBoundingClientRect();
      const relTop = r.top - top;
      const relBottom = r.bottom - top;
      const hide = relTop < TOP_MASK_SIZE && relBottom > 0;
      const headerEl = headerRefs.current.get(key);
      if (headerEl) {
        headerEl.style.opacity = hide ? "0" : "";
        headerEl.style.pointerEvents = hide ? "none" : "";
      }
      if (hide && relTop < bestTop) {
        bestTop = relTop;
        bestKey = key;
      }
    }
    setOverlayKey(bestKey);
  }, []);

  const handleScrollContainerMount = useCallback(
    (el: HTMLDivElement) => {
      recomputeActive(el);
      el.addEventListener("scroll", () => recomputeActive(el));
      // Also on resize, not just scroll — this mounts on first page load
      // while the Tag Pool tab is still hidden (`display:none`, since
      // Recommendations is the default tab), and every getBoundingClientRect
      // call on a display:none subtree returns an all-zero rect. That left
      // `recomputeActive`'s very first run computing nothing useful
      // (relBottom > 0 was false for everything), and nothing else ever
      // re-ran it until the user's first actual scroll — confirmed live: no
      // section title showed in the overlay at all until scrolling, even
      // slightly. Switching tabs is exactly a display:none → visible resize
      // (0×0 to its real size), which ResizeObserver reports — recomputing
      // there closes the gap without TagPoolBody needing to know anything
      // about which tab is active.
      new ResizeObserver(() => recomputeActive(el)).observe(el);
    },
    [recomputeActive],
  );

  const activeSection = TAG_SECTIONS.find((s) => s.key === overlayKey);
  const activeSectionTags = activeSection ? tagsForSection(allTags, activeSection, level, totalSeriesCount) : [];
  const activeSelectedCount = activeSectionTags.filter((t) => selectedTags.includes(t.name)).length;

  return (
    // surfaceColor="var(--bg)", not ScrollFadeArea's own --surface default:
    // this used to sit on TagPoolSection's own bordered/--surface card, but
    // that card is gone now that Tag Pool is a tab floating directly on the
    // page — a --surface (white) fade/arrow-fill against the page's actual
    // --bg color read as a mismatched pale patch/line at the scroll edges,
    // confirmed live.
    <ScrollFadeArea
      height={POOL_AREA_HEIGHT}
      topInset={SECTION_HEADER_HEIGHT}
      scrollStep={92}
      fadeSize={4}
      topMaskSize={TOP_MASK_SIZE}
      topMaskFlatSize={TOP_MASK_FLAT_SIZE}
      surfaceColor="var(--bg)"
      onScrollContainerMount={handleScrollContainerMount}
      stickyOverlay={
        activeSection && (
          <ActiveSectionOverlay
            title={activeSection.label}
            storageKey={activeSection.key}
            defaultExpanded={activeSection.defaultExpanded}
            selectedCount={activeSelectedCount}
          />
        )
      }
    >
      {TAG_SECTIONS.map((section) => {
        const sectionTags = tagsForSection(allTags, section, level, totalSeriesCount);
        // Hidden entirely, not just visually collapsed, when nothing at
        // this level qualifies (e.g. every non-Genres section at Level
        // 1). CollapsibleSection's expand state lives in localStorage,
        // untouched by mounting/unmounting, so this is a pure render
        // guard — the section remembers its expand state for whenever it
        // reappears at a higher level.
        if (sectionTags.length === 0) return null;
        const selectedCount = sectionTags.filter((t) => selectedTags.includes(t.name)).length;
        return (
          <CollapsibleSection
            key={section.key}
            ref={(el) => {
              if (el) sectionRefs.current.set(section.key, el);
              else sectionRefs.current.delete(section.key);
            }}
            headerRef={(el) => {
              if (el) headerRefs.current.set(section.key, el);
              else headerRefs.current.delete(section.key);
            }}
            title={section.label}
            storageKey={section.key}
            defaultExpanded={section.defaultExpanded}
            selectedCount={selectedCount}
          >
            {section.subsections ? (
              <div className="flex flex-col gap-[var(--space-lg)]">
                {section.subsections.map((sub) => {
                  const subTags = sortTags(tagsForCategories(allTags, sub.categories, level, totalSeriesCount), sort);
                  if (!subTags.length) return null;
                  return (
                    <div key={sub.label}>
                      <span className="block font-mono text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] text-[var(--muted)] uppercase mb-[var(--space-sm)]">
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
                  section.key === "genres" ? genreTags(allTags) : tagsForCategories(allTags, section.categories ?? [], level, totalSeriesCount),
                  sort,
                )}
                selectedTags={selectedTags}
                onChipToggle={onChipToggle}
              />
            )}
          </CollapsibleSection>
        );
      })}
    </ScrollFadeArea>
  );
}

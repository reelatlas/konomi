"use client";

import { useState } from "react";
import { SHOW_HALFTONE } from "@/lib/konomi/config";
import { visiblePoolTagNames } from "@/lib/konomi/tagPool";
import type { LevelKey, Series, TagInfo } from "@/lib/konomi/types";
import { useKonomi } from "@/lib/konomi/useKonomi";
import { Masthead } from "./Masthead";
import { MixerBar } from "./MixerBar";
import { RecommendationsBody } from "./RecommendationsBody";
import { ResultsHeader } from "./ResultsHeader";
import { setLevelPref, useLevel } from "./tagPoolPrefs";

interface KonomiAppProps {
  initialSeries: Series[];
  initialTags: TagInfo[];
}

// Height of MixerBar's browse-mode (collapsed: title + slots + controls,
// no pool panel) rendered form — measured live against the real component,
// same "retune by hand if this changes" approach TagPoolBody's
// CHIP_AREA_HEIGHT constant already uses. Reserves exactly enough space at
// the bottom of the scrolling page so browse-mode content (results, the
// "+ Tag Pool" affordance, footer tagline) never sits underneath the fixed
// bar. Edit mode's taller form is deliberately allowed to overlay content
// instead of reserving space for it too — expected bottom-sheet behavior,
// not a bug; see MixerBar.tsx's own top comment.
//
// The controls row wraps to 2 lines at narrow widths (Random/Clear/
// Recommend drop below MIN TAG MATCH once the divider disappears below
// 993px), making the bar taller on mobile (273px measured live at 390px)
// than desktop (224.5px at 1400px) — this constant covers the taller,
// mobile case with a little headroom, since that's the width tier where
// the spacer actually matters most for this mobile-first pass.
const MIXER_BAR_SPACER = "pb-[290px]";

export function KonomiApp({ initialSeries, initialTags }: KonomiAppProps) {
  const k = useKonomi(initialSeries, initialTags);
  const level = useLevel();
  // Owned here, not inside MixerBar — hitting RECOMMEND (in MixerBar, a
  // sibling of the results surface) needs to force this closed even when
  // edit mode is currently open, so the user lands on the new results
  // instead of staying behind a sheet that just silently updated behind
  // them. Same cross-component-reach reason the retired `activeTab` used
  // to live here.
  const [editMode, setEditMode] = useState(false);

  // The only place level-change needs to touch both the preference store
  // and the mixer: persist the new level, then prune any selected tag the
  // new level no longer shows (see pruneTags' doc comment in useKonomi.ts).
  // visiblePoolTagNames (not a raw isTagVisibleAtLevel filter) is what
  // correctly excludes Technical/Sexual Content too — see its doc comment.
  function handleLevelChange(next: LevelKey) {
    setLevelPref(next);
    k.pruneTags(new Set(visiblePoolTagNames(k.allTags, next, k.totalSeriesCount)));
  }

  // Random ×3 must only ever pick from what the pool actually shows at the
  // current level — same canonical visible-name list as the prune cascade.
  function handleRandomTags() {
    k.randomTags(visiblePoolTagNames(k.allTags, level, k.totalSeriesCount));
  }

  // Closes edit mode only on a successful RECOMMEND. An error (e.g.
  // "impossible-min") leaves the user exactly where they need to be to fix
  // it — still in edit mode, tags and section tab untouched — rather than
  // collapsing back to browse mode and hiding the fix behind a still-open
  // affordance they'd have to reopen. k.recommend() returns the resulting
  // MixerError synchronously (or null on success) specifically so this
  // decision doesn't need to wait for a re-render — see its own doc
  // comment in useKonomi.ts.
  function handleRecommend() {
    const error = k.recommend();
    if (!error) {
      setEditMode(false);
    }
  }

  return (
    <div
      data-theme={k.theme}
      className={`relative min-h-screen overflow-x-hidden px-[var(--space-2xl)] pt-[var(--space-2xl)] font-body bg-[var(--bg)] text-[var(--ink)] ${MIXER_BAR_SPACER}`}
    >
      {SHOW_HALFTONE && (
        <div className="absolute inset-0 pointer-events-none opacity-45 bg-[radial-gradient(var(--muted)_1.3px,transparent_1.4px)] [background-size:9px_9px] z-[var(--z-base)]" />
      )}

      {/* data-konomi-content: lets MixerBar's click-outside-closes-edit-mode
          listener exclude this whole column (theme switcher, results
          header/Clear, every result card — tags, swap/lock, flip) as one
          zone, rather than special-casing each control individually. Only
          a click that lands truly outside this column (the page's own
          background/gutters) should ever close edit mode via outside-click
          — every other control on the page has its own meaningful action
          and shouldn't also dismiss the sheet as a side effect. */}
      <div data-konomi-content className="relative z-[var(--z-raised)] max-w-[1280px] mx-auto">
        <Masthead theme={k.theme} onThemeChange={k.setTheme} />

        {/* Results is now the persistent main surface, not a tab — always
            rendered, no hidden-toggle wrapper needed since there's nothing
            left to toggle against. */}
        <section className="mb-[var(--space-3xl)]">
          <ResultsHeader resultsHint={k.resultsHint} hasResults={k.hasResults} onClearRecs={k.clearRecs} />

          <RecommendationsBody
            results={k.results}
            hasResults={k.hasResults}
            selectedTags={k.selectedTags}
            filledCount={k.filledCount}
            minNum={k.minNum}
            recommendGen={k.recommendGen}
            locked={k.locked}
            flipped={k.flipped}
            canSwap={k.canSwap}
            onFlip={k.toggleFlip}
            onToggleLock={k.toggleLock}
            onReplace={k.replaceCard}
            onChipToggle={k.toggleTag}
            tagInfoByName={k.tagInfoByName}
            totalSeriesCount={k.totalSeriesCount}
          />

          {/* The other trigger into edit mode, alongside tapping an empty
              slot in MixerBar below — always visible in browse mode,
              regardless of whether results exist yet. Its own label
              supersedes the retired PanelToggleHeader's "drag or tap to
              load a slot" hover hint, which had no home once that
              component was deleted. */}
          <button
            type="button"
            onClick={() => setEditMode(true)}
            className="w-full mt-[var(--space-xl)] border-[length:var(--border-base)] border-dashed border-[var(--muted)] bg-transparent text-[var(--primary)] font-mono font-bold text-[length:var(--text-sm)] uppercase tracking-[var(--tracking-sm)] py-[var(--space-lg)] cursor-pointer"
          >
            + Tag Pool — tap to add tags
          </button>
        </section>

        <p className="font-mono text-[length:var(--text-xs)] text-[var(--subtext)] text-center mt-[var(--space-3xl)] mb-0">
          drag tags between the pool, mixer &amp; results to remix · the end…?
        </p>
      </div>

      {/* Sibling of the max-w-[1280px] z-raised wrapper above, not nested
          inside it — MixerBar is a genuine page-level fixed overlay
          (z-overlay), and rendering it outside that wrapper's own stacking
          context keeps its z-index meaning what it says rather than only
          being compared against that wrapper's other children. */}
      <MixerBar
        slots={k.slots}
        dragOverIndex={k.dragOverIndex}
        minMatch={k.minMatch}
        lockedLabel={k.lockedLabel}
        filledCount={k.filledCount}
        onSlotDragOver={k.setDragOver}
        onSlotDragLeave={k.clearDragOver}
        onSlotDrop={k.placeInSlot}
        onSlotClick={k.clearSlot}
        onSetMatch={k.setMinMatch}
        onRandomTags={handleRandomTags}
        onClearSlots={k.clearSlots}
        onRecommend={handleRecommend}
        error={k.mixerError}
        editMode={editMode}
        onOpenEditMode={() => setEditMode(true)}
        onCloseEditMode={() => setEditMode(false)}
        allTags={k.allTags}
        selectedTags={k.selectedTags}
        totalSeriesCount={k.totalSeriesCount}
        onLevelChange={handleLevelChange}
        onChipToggle={k.toggleTag}
      />
    </div>
  );
}

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

// Reserves space at the bottom of the (browse-mode) scrolling page so the
// last piece of content never sits underneath the fixed mixer bar, with a
// clean space-2xl (24px) gap above it — deliberately the same token and
// value as ResultsHeader's own header→card gap (mb-[var(--space-2xl)]),
// so both gaps in the "header, card, mixer" stack are identical, not just
// each independently reasonable. calc()-based on --mixer-bar-height
// (globals.css), not a flat re-measured constant like the old version of
// this token: a flat worst-case number (previously 280px, sized for the
// mixer's narrowest-tier height) over-reserves space at every *other*
// breakpoint, since the mixer's real height varies — confirmed live as
// the actual cause of a reported bug ("the gap below the last card gets
// very large"), not scroll or viewport-unit related at all. Reading the
// mixer's own live height through the same token the card-height clamp
// already uses means this stays exactly mixer-height + 24px at every
// width, automatically, with no separate re-measurement to keep in sync.
//
// - var(--space-3xl): the results <section>'s own mb-[var(--space-3xl)]
// (32px, below) sits between the last card and this padding — real,
// pre-existing spacing this formula doesn't own and isn't touching (left
// exactly as-is, out of scope for this fix), but its 32px still counts
// toward the total visual gap before the mixer. Confirmed live: without
// subtracting it, the scrolled-to-bottom gap measured 56px (32 + the
// intended 24), not 24. Subtracting it here — rather than editing that
// pre-existing margin — keeps this fix isolated to exactly the one
// constant it was meant to change.
// Edit mode's taller form is still deliberately allowed to overlay content
// instead of reserving space for it too — expected bottom-sheet behavior,
// not a bug, unchanged from before; see MixerBar.tsx's own top comment.
const MIXER_BAR_SPACER = "pb-[calc(var(--mixer-bar-height)_+_var(--space-2xl)_-_var(--space-3xl))]";

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

      <div className="relative z-[var(--z-raised)] max-w-[1280px] mx-auto">
        <Masthead theme={k.theme} onThemeChange={k.setTheme} />

        {/* Results is now the persistent main surface, not a tab — always
            rendered, no hidden-toggle wrapper needed since there's nothing
            left to toggle against. */}
        <section className="mb-[var(--space-3xl)]">
          <ResultsHeader hasResults={k.hasResults} onClearRecs={k.clearRecs} />

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
        </section>
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

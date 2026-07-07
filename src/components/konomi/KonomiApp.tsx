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
    // pt-[space-2xl] above the masthead and pb-[space-2xl] below the mixer
    // are the same token deliberately — the uniform outer-frame principle
    // for the header+card+mixer group (see globals.css's
    // --result-card-height comment): whatever gap the mixer used to keep
    // from the viewport bottom on its own (back when it was position:fixed
    // with its own px/pb-[space-2xl]) is now this root's job instead, once
    // MixerBar moved into normal flow as the max-w-[1280px] column's own
    // last child, below. A flat pb-2xl, not a calc tied to the mixer's own
    // height (the old MIXER_BAR_SPACER, removed) — nothing to "clear"
    // underneath a normal-flow element the way a fixed one needed.
    <div
      data-theme={k.theme}
      className="relative min-h-screen overflow-x-hidden px-[var(--space-2xl)] pt-[var(--space-2xl)] pb-[var(--space-2xl)] font-body bg-[var(--bg)] text-[var(--ink)]"
    >
      {SHOW_HALFTONE && (
        <div className="absolute inset-0 pointer-events-none opacity-45 bg-[radial-gradient(var(--muted)_1.3px,transparent_1.4px)] [background-size:9px_9px] z-[var(--z-base)]" />
      )}

      <div className="relative z-[var(--z-raised)] max-w-[1280px] mx-auto">
        <Masthead theme={k.theme} onThemeChange={k.setTheme} />

        {/* Results is now the persistent main surface, not a tab — always
            rendered, no hidden-toggle wrapper needed since there's nothing
            left to toggle against.

            mb-[var(--space-2xl)], not the space-3xl this used before: this
            margin is what actually produces the card→mixer gap now that
            MixerBar is this section's very next normal-flow sibling (Step
            1's version of this fix instead subtracted the old 32px value
            out of a separate spacer calc, deliberately leaving this margin
            itself untouched — out of scope for that narrower change, but
            Step 2's uniform-frame principle makes the gaps themselves the
            point: header→cards and cards→mixer read as the same 24px, not
            independently sized). Adjacent block margins between this
            section and MixerBar's own root div would otherwise collapse to
            whichever is larger, not add — so leaving this at space-3xl
            while relying on some margin on MixerBar's side to shrink the
            gap wouldn't have worked; this is the one that has to change. */}
        <section className="mb-[var(--space-2xl)]">
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

        {/* Nested inside the same max-w-[1280px] z-raised column as
            Masthead/the results section above, not a page-level sibling —
            now that MixerBar is normal flow, not position:fixed, it needs
            the same shared content column (left/right framing) the header
            and cards already use, or its edges would drift from theirs the
            moment the page's own centered max-w box stops filling the
            viewport (see MixerBar.tsx's own top comment for how this was
            confirmed not to shift any of its internal @container
            breakpoints). Last child — bottom of the group, in document
            order matching its visual position. */}
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
    </div>
  );
}

"use client";

import { useState } from "react";
import { SHOW_HALFTONE } from "@/lib/konomi/config";
import { visiblePoolTagNames } from "@/lib/konomi/tagPool";
import type { LevelKey, Series, TagInfo } from "@/lib/konomi/types";
import { useKonomi } from "@/lib/konomi/useKonomi";
import { Masthead } from "./Masthead";
import { MixerSection } from "./MixerSection";
import type { PanelTab } from "./PanelToggleHeader";
import { setLevelPref, useLevel } from "./tagPoolPrefs";
import { TagPoolRecommendationsPanel } from "./TagPoolRecommendationsPanel";

interface KonomiAppProps {
  initialSeries: Series[];
  initialTags: TagInfo[];
}

export function KonomiApp({ initialSeries, initialTags }: KonomiAppProps) {
  const k = useKonomi(initialSeries, initialTags);
  const level = useLevel();
  // Owned here, not inside TagPoolRecommendationsPanel — hitting RECOMMEND
  // (in MixerSection, a sibling of that whole panel) needs to switch this
  // to "recommendations" even when Tag Pool is the currently active tab, so
  // the user lands on the new results instead of staying on a tab that just
  // silently updated behind them. That cross-component reach is the only
  // reason this piece of otherwise-local UI state lives up here.
  const [activeTab, setActiveTab] = useState<PanelTab>("recommendations");

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

  // Switches to the Recommendations tab on every RECOMMEND click, success
  // or not — even an error (e.g. "impossible-min") is more useful seen on
  // the tab that shows it (RecommendButton's own hint) than left hidden
  // behind Tag Pool.
  function handleRecommend() {
    k.recommend();
    setActiveTab("recommendations");
  }

  return (
    <div
      data-theme={k.theme}
      className="relative min-h-screen overflow-x-hidden px-[var(--space-2xl)] pt-[var(--space-2xl)] pb-[var(--space-page)] font-body bg-[var(--bg)] text-[var(--ink)]"
    >
      {SHOW_HALFTONE && (
        <div className="absolute inset-0 pointer-events-none opacity-45 bg-[radial-gradient(var(--muted)_1.3px,transparent_1.4px)] [background-size:9px_9px] z-[var(--z-base)]" />
      )}

      <div className="relative z-[var(--z-raised)] max-w-[1280px] mx-auto">
        <Masthead theme={k.theme} onThemeChange={k.setTheme} />

        <TagPoolRecommendationsPanel
          activeTab={activeTab}
          onChangeTab={setActiveTab}
          results={k.results}
          hasResults={k.hasResults}
          resultsHint={k.resultsHint}
          onClearRecs={k.clearRecs}
          recommendGen={k.recommendGen}
          locked={k.locked}
          flipped={k.flipped}
          canSwap={k.canSwap}
          onFlip={k.toggleFlip}
          onToggleLock={k.toggleLock}
          onReplace={k.replaceCard}
          filledCount={k.filledCount}
          minNum={k.minNum}
          allTags={k.allTags}
          selectedTags={k.selectedTags}
          totalSeriesCount={k.totalSeriesCount}
          level={level}
          onLevelChange={handleLevelChange}
          onChipToggle={k.toggleTag}
          tagInfoByName={k.tagInfoByName}
        />

        <MixerSection
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
        />

        <p className="font-mono text-[length:var(--text-xs)] text-[var(--subtext)] text-center mt-[var(--space-3xl)] mb-0">
          drag tags between the pool, mixer &amp; results to remix · the end…?
        </p>
      </div>
    </div>
  );
}

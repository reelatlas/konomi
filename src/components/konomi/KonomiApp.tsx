"use client";

import { SHOW_HALFTONE } from "@/lib/konomi/config";
import { visiblePoolTagNames } from "@/lib/konomi/tagPool";
import type { LevelKey, Series, TagInfo } from "@/lib/konomi/types";
import { useKonomi } from "@/lib/konomi/useKonomi";
import { Masthead } from "./Masthead";
import { MixerSection } from "./MixerSection";
import { RecommendationsSection } from "./RecommendationsSection";
import { setLevelPref, useLevel } from "./tagPoolPrefs";
import { TagPoolSection } from "./TagPoolSection";

interface KonomiAppProps {
  initialSeries: Series[];
  initialTags: TagInfo[];
  initialGenres: string[];
}

export function KonomiApp({ initialSeries, initialTags, initialGenres }: KonomiAppProps) {
  const k = useKonomi(initialSeries, initialTags, initialGenres);
  const level = useLevel();

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

  return (
    <div
      data-theme={k.theme}
      className="relative min-h-screen overflow-x-hidden px-[var(--space-2xl)] pt-[var(--space-2xl)] pb-[var(--space-page)] font-body bg-[var(--bg)] text-[var(--ink)]"
    >
      {SHOW_HALFTONE && (
        <div className="absolute inset-0 pointer-events-none opacity-45 bg-[radial-gradient(var(--muted)_1.3px,transparent_1.4px)] [background-size:9px_9px] z-0" />
      )}

      <div className="relative z-1 max-w-[1280px] mx-auto">
        <Masthead theme={k.theme} onThemeChange={k.setTheme} />

        <RecommendationsSection
          results={k.results}
          empty={k.empty}
          hasResults={k.hasResults}
          noMatch={k.noMatch}
          resultsHint={k.resultsHint}
          selectedTags={k.selectedTags}
          filledCount={k.filledCount}
          locked={k.locked}
          flipped={k.flipped}
          canSwap={k.canSwap}
          onClearRecs={k.clearRecs}
          onFlip={k.toggleFlip}
          onToggleLock={k.toggleLock}
          onReplace={k.replaceCard}
          onChipToggle={k.toggleTag}
          tagInfoByName={k.tagInfoByName}
          totalSeriesCount={k.totalSeriesCount}
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
          onRecommend={k.recommend}
        />

        <TagPoolSection
          allTags={k.allTags}
          selectedTags={k.selectedTags}
          totalSeriesCount={k.totalSeriesCount}
          level={level}
          onLevelChange={handleLevelChange}
          onChipToggle={k.toggleTag}
        />

        <p className="font-mono text-[length:var(--text-xs)] text-[var(--muted)] text-center mt-[var(--space-3xl)] mb-0">
          prototype · dummy data · drag tags between the pool, mixer &amp; results to remix
        </p>
      </div>
    </div>
  );
}

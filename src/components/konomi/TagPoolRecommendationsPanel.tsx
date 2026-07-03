"use client";

import type { LevelKey, ResultEntry, TagInfo } from "@/lib/konomi/types";
import { PanelToggleHeader, type PanelTab } from "./PanelToggleHeader";
import { RecommendationsBody } from "./RecommendationsBody";
import { TagPoolBody } from "./TagPoolBody";

interface TagPoolRecommendationsPanelProps {
  activeTab: PanelTab;
  onChangeTab: (tab: PanelTab) => void;
  results: ResultEntry[];
  hasResults: boolean;
  resultsHint: string;
  onClearRecs: () => void;
  recommendGen: number;
  locked: Record<string, boolean>;
  flipped: Record<string, boolean>;
  canSwap: boolean;
  onFlip: (title: string) => void;
  onToggleLock: (title: string) => void;
  onReplace: (title: string) => void;
  filledCount: number;
  minNum: number;
  allTags: TagInfo[];
  selectedTags: string[];
  totalSeriesCount: number;
  level: LevelKey;
  onLevelChange: (level: LevelKey) => void;
  onChipToggle: (tag: string) => void;
  tagInfoByName: Map<string, TagInfo>;
}

// Recommendations and Tag Pool used to be two independent top-level
// sections; they're now two tabs of one shared card, toggled by the header
// above it (PanelToggleHeader) instead of each having its own section-level
// title/border/shadow. `activeTab` is view state, not app data — but it's
// owned by KonomiApp, not local to this component: hitting RECOMMEND (in
// MixerSection, a sibling of this whole panel) needs to switch the tab to
// Recommendations even when Tag Pool is currently active, so the user
// immediately sees the new results rather than staying on a tab that just
// silently updated behind them. That cross-component reach is exactly what
// forces this one piece of otherwise-local UI state up to the nearest
// shared ancestor instead of keeping it local here.
//
// Both bodies are always mounted — visibility toggles via a `hidden` class,
// never conditional JSX (`{activeTab === "x" && <Body/>}`). This is not a
// style preference: RecommendationsBody's carousel scroll position and
// TagPoolBody's ScrollFadeArea scroll position are both plain component
// state/DOM scrollTop with no external persistence (unlike the mixer state,
// results, tag selections, and level/sort prefs, which all already live in
// useKonomi's reducer or a localStorage-backed store and survive regardless
// of what's mounted). Conditionally rendering one body would unmount it and
// reset that scroll position to 0 every time the user switched back —
// `hidden` (display:none) doesn't reset scrollTop, so switching tabs and
// back leaves everything, including scroll position, exactly where it was.
export function TagPoolRecommendationsPanel({
  activeTab,
  onChangeTab,
  results,
  hasResults,
  resultsHint,
  onClearRecs,
  recommendGen,
  locked,
  flipped,
  canSwap,
  onFlip,
  onToggleLock,
  onReplace,
  filledCount,
  minNum,
  allTags,
  selectedTags,
  totalSeriesCount,
  level,
  onLevelChange,
  onChipToggle,
  tagInfoByName,
}: TagPoolRecommendationsPanelProps) {
  return (
    <section className="mb-[var(--space-3xl)]">
      <PanelToggleHeader
        activeTab={activeTab}
        onChangeTab={onChangeTab}
        resultsHint={resultsHint}
        hasResults={hasResults}
        onClearRecs={onClearRecs}
        level={level}
        onLevelChange={onLevelChange}
      />

      {/* No card chrome here, by explicit choice — Recommendations never
          had a bordered/shadowed shell (it floated directly against the
          page background), and that's the treatment both tabs keep now,
          not the bordered-card look Mixer/the old Tag Pool used. This div
          is purely structural: the one thing it needs to do is host both
          bodies so the `hidden` class below can toggle between them
          without unmounting either (see the component doc comment above
          for why that matters). */}
      <div>
        <div className={activeTab === "recommendations" ? "" : "hidden"}>
          <RecommendationsBody
            results={results}
            hasResults={hasResults}
            selectedTags={selectedTags}
            filledCount={filledCount}
            minNum={minNum}
            recommendGen={recommendGen}
            locked={locked}
            flipped={flipped}
            canSwap={canSwap}
            onFlip={onFlip}
            onToggleLock={onToggleLock}
            onReplace={onReplace}
            onChipToggle={onChipToggle}
            tagInfoByName={tagInfoByName}
            totalSeriesCount={totalSeriesCount}
          />
        </div>
        <div className={activeTab === "tagpool" ? "" : "hidden"}>
          <TagPoolBody
            allTags={allTags}
            selectedTags={selectedTags}
            totalSeriesCount={totalSeriesCount}
            level={level}
            onChipToggle={onChipToggle}
          />
        </div>
      </div>
    </section>
  );
}

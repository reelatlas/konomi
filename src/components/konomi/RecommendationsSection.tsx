import type { ResultEntry, TagInfo } from "@/lib/konomi/types";
import { ResultCard } from "./ResultCard";
import { useLevel, useSort } from "./tagPoolPrefs";

interface RecommendationsSectionProps {
  results: ResultEntry[];
  empty: boolean;
  hasResults: boolean;
  resultsHint: string;
  selectedTags: string[];
  filledCount: number;
  minNum: number;
  locked: Record<string, boolean>;
  flipped: Record<string, boolean>;
  canSwap: boolean;
  onClearRecs: () => void;
  onFlip: (title: string) => void;
  onToggleLock: (title: string) => void;
  onReplace: (title: string) => void;
  onChipToggle: (tag: string) => void;
  tagInfoByName: Map<string, TagInfo>;
  totalSeriesCount: number;
}

export function RecommendationsSection({
  results,
  empty,
  hasResults,
  resultsHint,
  selectedTags,
  filledCount,
  minNum,
  locked,
  flipped,
  canSwap,
  onClearRecs,
  onFlip,
  onToggleLock,
  onReplace,
  onChipToggle,
  tagInfoByName,
  totalSeriesCount,
}: RecommendationsSectionProps) {
  const level = useLevel();
  const sort = useSort();
  return (
    <section className="mb-[var(--space-3xl)]">
      <div className="flex items-center gap-[var(--space-md)] mb-[var(--space-xl)]">
        <h2 className="font-display text-[length:var(--text-2xl)] m-0 uppercase tracking-[var(--tracking-sm)]">Recommendations</h2>
        <span className="font-body font-bold text-[var(--primary)] text-[length:var(--text-md)]">おすすめ</span>
        <span className="ml-auto font-mono text-[length:var(--text-xs)] text-[var(--muted)]">{resultsHint}</span>
        {hasResults && (
          <button
            type="button"
            onClick={onClearRecs}
            className="bg-[var(--ink)] text-[var(--bg)] border-[length:var(--border-base)] border-[var(--ink)] font-mono font-bold text-[length:var(--text-xs)] tracking-[var(--tracking-xl)] px-[var(--space-lg)] py-[var(--space-md)] cursor-pointer uppercase"
          >
            Clear ✕
          </button>
        )}
      </div>

      {empty && (
        <div className="border-[length:var(--border-base)] border-dashed border-[var(--muted)] bg-[var(--surface)] px-[var(--space-2xl)] py-[var(--space-huge)] text-center">
          <div className="font-display text-[length:var(--text-2xl)] text-[var(--muted)] uppercase">mix tags</div>
          <p className="font-mono text-[length:var(--text-base)] text-[var(--primary)] mt-[var(--space-md)] mb-0">
            load 1–3 tags into the mixer then RECOMMEND
          </p>
        </div>
      )}

      {hasResults && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(208px,1fr))] gap-[var(--space-xl)]">
          {results.map((entry) => (
            <ResultCard
              key={entry.series.title}
              entry={entry}
              selectedTags={selectedTags}
              filledCount={filledCount}
              minNum={minNum}
              locked={Boolean(locked[entry.series.title])}
              flipped={Boolean(flipped[entry.series.title])}
              canSwap={canSwap}
              onFlip={onFlip}
              onToggleLock={onToggleLock}
              onReplace={onReplace}
              onChipToggle={onChipToggle}
              tagInfoByName={tagInfoByName}
              totalSeriesCount={totalSeriesCount}
              level={level}
              sort={sort}
            />
          ))}
        </div>
      )}
    </section>
  );
}

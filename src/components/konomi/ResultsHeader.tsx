import { ActionButton } from "./ActionButton";

interface ResultsHeaderProps {
  resultsHint: string;
  hasResults: boolean;
  onClearRecs: () => void;
}

// Extracted from the retired PanelToggleHeader's Recommendations-active
// branch — Results is now the only surface, so this header is unconditional
// instead of tab-gated. Title/JP-subtitle classes match the app's own
// title-row rule exactly (leading-display on the title, leading-tight on
// the companion span), same as Mixer/MixerBar's own title row.
export function ResultsHeader({ resultsHint, hasResults, onClearRecs }: ResultsHeaderProps) {
  return (
    <div className="flex items-end justify-between flex-wrap gap-x-[var(--space-lg)] gap-y-[var(--space-lg)] mb-[var(--space-xl)]">
      <div className="flex items-center gap-[var(--space-md)]">
        <h2 className="font-display text-[length:var(--text-xl)] leading-[var(--leading-display)] m-0 uppercase tracking-[var(--tracking-sm)] text-[var(--ink)]">
          Recommendations
        </h2>
        <span className="font-body font-bold leading-[var(--leading-tight)] text-[var(--primary)] text-[length:var(--text-md)]">おすすめ</span>
      </div>
      <div className="flex items-center gap-[var(--space-lg)] flex-wrap">
        <span className="font-mono text-[length:var(--text-xs)] text-[var(--subtext)]">{resultsHint}</span>
        {hasResults && (
          <ActionButton variant="inverted" size="sm" onClick={onClearRecs}>
            Clear ✕
          </ActionButton>
        )}
      </div>
    </div>
  );
}

import type { LevelKey } from "@/lib/konomi/types";
import { ActionButton } from "./ActionButton";
import { SortIcon, TagIcon } from "./icons";
import { LevelSelector } from "./LevelSelector";
import { SortSelect } from "./SortSelect";
import { setSortPref, useSort } from "./tagPoolPrefs";

export type PanelTab = "recommendations" | "tagpool";

interface PanelToggleHeaderProps {
  activeTab: PanelTab;
  onChangeTab: (tab: PanelTab) => void;
  resultsHint: string;
  hasResults: boolean;
  onClearRecs: () => void;
  level: LevelKey;
  onLevelChange: (level: LevelKey) => void;
}

// title/JP-subtitle classes match the app's own title-row rule exactly
// (leading-display on the title, leading-tight on the companion span) —
// `<span>`, not `<h2>`, because both labels now live inside a `<button>`,
// and heading elements aren't valid `<button>` content. Color is the one
// thing that changes with active state; size/weight/leading never do —
// that parity is what makes the two labels read as one consistent toggle
// rather than two differently-weighted headings.
function TabLabel({ title, jp, active }: { title: string; jp: string; active: boolean }) {
  return (
    <span className="flex items-center gap-[var(--space-md)]">
      <span
        className={[
          "font-display text-[length:var(--text-xl)] leading-[var(--leading-display)] uppercase tracking-[var(--tracking-sm)]",
          active ? "text-[var(--ink)]" : "text-[var(--muted)]",
        ].join(" ")}
      >
        {title}
      </span>
      <span
        className={[
          "font-body font-bold leading-[var(--leading-tight)] text-[length:var(--text-md)]",
          active ? "text-[var(--primary)]" : "text-[var(--muted)]",
        ].join(" ")}
      >
        {jp}
      </span>
    </span>
  );
}

// Not a traditional tab bar — the two section headers themselves (title +
// JP subtitle) sit side by side and become the toggle. The active one
// keeps the exact formatting every top-level section header
// in this app already uses; the inactive one dims to --muted, size/leading
// unchanged. Below/beside the toggle, the right side swaps in the active
// tab's own contextual controls (Recommendations: resultsHint + Clear ✕;
// Tag Pool: Level + Sort) — each tab owns its full header identity, not
// just its title's styling.
export function PanelToggleHeader({
  activeTab,
  onChangeTab,
  resultsHint,
  hasResults,
  onClearRecs,
  level,
  onLevelChange,
}: PanelToggleHeaderProps) {
  const sort = useSort();
  const recommendationsActive = activeTab === "recommendations";
  const tagPoolActive = activeTab === "tagpool";

  return (
    <div className="flex items-center justify-between flex-wrap gap-x-[var(--space-lg)] gap-y-[var(--space-lg)] mb-[var(--space-xl)]">
      <div className="flex items-center gap-[var(--space-xl)]">
        <button type="button" onClick={() => onChangeTab("recommendations")} aria-pressed={recommendationsActive} className="cursor-pointer">
          <TabLabel title="Recommendations" jp="おすすめ" active={recommendationsActive} />
        </button>
        {/* relative: anchors the "drag or tap" hint (below) to this button
            specifically, not to the toggle row as a whole — so it lands
            under "Tag Pool タグ" regardless of where that label sits in the
            row, not under whichever label happens to be first. */}
        <button type="button" onClick={() => onChangeTab("tagpool")} aria-pressed={tagPoolActive} className="relative cursor-pointer">
          <TabLabel title="Tag Pool" jp="タグ" active={tagPoolActive} />
          {/* Only while Tag Pool is the active tab — confirmed this should
              disappear entirely (not just dim) once Recommendations is
              active, rather than staying visible under a dimmed label. */}
          {tagPoolActive && (
            <span className="absolute top-full left-0 mt-[var(--space-xs)] whitespace-nowrap font-mono text-[length:var(--text-xs)] text-[var(--muted)]">
              drag or tap to load a slot
            </span>
          )}
        </button>
      </div>

      <div className="flex items-center gap-[var(--space-lg)] flex-wrap">
        {recommendationsActive ? (
          <>
            <span className="font-mono text-[length:var(--text-xs)] text-[var(--muted)]">{resultsHint}</span>
            {hasResults && (
              <ActionButton variant="inverted" size="sm" onClick={onClearRecs}>
                Clear ✕
              </ActionButton>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-[var(--space-sm)]">
              <TagIcon className="text-[var(--ink)]" />
              <LevelSelector value={level} onChange={onLevelChange} />
            </div>
            <div className="flex items-center gap-[var(--space-sm)]">
              <SortIcon className="text-[var(--ink)]" />
              <SortSelect value={sort} onChange={setSortPref} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

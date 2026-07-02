import type { MatchKey, MixerError, Slot } from "@/lib/konomi/types";
import { MatchSelector } from "./MatchSelector";
import { RecommendButton } from "./RecommendButton";
import { TagSlot } from "./TagSlot";

interface MixerSectionProps {
  slots: Slot[];
  dragOverIndex: number;
  minMatch: MatchKey;
  lockedLabel: string;
  filledCount: number;
  onSlotDragOver: (index: number) => void;
  onSlotDragLeave: () => void;
  onSlotDrop: (index: number, tag: string) => void;
  onSlotClick: (index: number) => void;
  onSetMatch: (key: MatchKey) => void;
  onRandomTags: () => void;
  onClearSlots: () => void;
  onRecommend: () => void;
  error: MixerError;
}

export function MixerSection({
  slots,
  dragOverIndex,
  minMatch,
  lockedLabel,
  filledCount,
  onSlotDragOver,
  onSlotDragLeave,
  onSlotDrop,
  onSlotClick,
  onSetMatch,
  onRandomTags,
  onClearSlots,
  onRecommend,
  error,
}: MixerSectionProps) {
  return (
    <section className="relative border-[length:var(--border-base)] border-[var(--ink)] bg-[var(--surface)] shadow-[var(--elev-5)] p-[var(--space-2xl)] mb-[var(--space-3xl)]">
      <div className="flex items-center gap-[var(--space-md)] mb-[var(--space-xl)]">
        <h2 className="font-display text-[length:var(--text-xl)] leading-[var(--leading-display)] m-0 uppercase tracking-[var(--tracking-sm)]">Mixer</h2>
        <span className="font-body font-bold leading-[var(--leading-tight)] text-[var(--primary)] text-[length:var(--text-md)]">ミックス</span>
        <span className="ml-auto font-mono font-bold text-[length:var(--text-sm)] bg-[var(--fill)] border-[length:var(--border-thin)] border-[var(--ink)] px-[var(--space-md)] py-[var(--space-xs)]">
          {lockedLabel}
        </span>
      </div>

      <div className="flex gap-[var(--space-2xl)] flex-wrap items-start">
        <div className="flex-[1_1_460px] min-w-[280px] flex flex-col gap-[var(--space-xl)]">
          <div className="flex gap-[var(--space-lg)]">
            {slots.map((tag, index) => (
              <TagSlot
                key={index}
                index={index}
                tag={tag}
                isDragOver={dragOverIndex === index}
                onDragOver={onSlotDragOver}
                onDragLeave={onSlotDragLeave}
                onDrop={onSlotDrop}
                onClick={onSlotClick}
              />
            ))}
          </div>

          {/* flex-wrap here only ever has 2 items — the MIN TAG MATCH block
              and the Random+Clear group below — so wrapping is inherently
              all-or-nothing per item, never a partial split. The group's own
              inner flex has no flex-wrap of its own, so Random and Clear can
              never separate from each other; ml-auto keeps it flush-right
              whether it's sharing this line or wrapped alone onto the next
              one (unlike justify-between, which would only push it right
              while sharing a line and revert to flex-start once alone).
              MIN TAG MATCH's own flex-grow (below) is what stretches it to
              fill the full line once it's alone on it — no extra rule
              needed for that, it's the same asymmetry that already pushes
              Random+Clear right when both share a line. */}
          <div className="flex gap-[var(--space-lg)] flex-wrap items-end">
            <div className="flex-[1_1_250px] min-w-[210px] flex flex-col gap-[var(--space-xs)]">
              <span className="font-mono text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] text-[var(--muted)]">
                MIN TAG MATCH — how many must overlap
              </span>
              <MatchSelector value={minMatch} onChange={onSetMatch} />
            </div>
            <div className="flex gap-[var(--space-lg)] ml-auto">
              <button
                type="button"
                onClick={onRandomTags}
                className="bg-[var(--fill)] border-[length:var(--border-base)] border-[var(--ink)] font-mono font-bold text-[length:var(--text-xs)] tracking-[var(--tracking-xl)] px-[var(--space-xl)] py-[var(--space-lg)] cursor-pointer text-[var(--ink)] uppercase shadow-[var(--elev-2)] whitespace-nowrap"
              >
                Random ×3
              </button>
              <button
                type="button"
                onClick={onClearSlots}
                className="bg-transparent border-[length:var(--border-base)] border-[var(--ink)] font-mono font-bold text-[length:var(--text-xs)] tracking-[var(--tracking-xl)] px-[var(--space-xl)] py-[var(--space-lg)] cursor-pointer text-[var(--ink)] uppercase shadow-[var(--elev-2)] whitespace-nowrap"
              >
                Clear slots ✕
              </button>
            </div>
          </div>
        </div>

        {/* ml-auto, same reasoning as the Random+Clear group above: stays
            flush-right whether RecommendButton shares the line with the
            mixer column or wraps to its own line below. */}
        <div className="ml-auto">
          <RecommendButton filledCount={filledCount} onRecommend={onRecommend} error={error} />
        </div>
      </div>
    </section>
  );
}

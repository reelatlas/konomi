import type { MatchKey, MixerError, Slot } from "@/lib/konomi/types";
import { GreaterEqualIcon, TagIcon } from "./icons";
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
      {/* Row 1: just the title now — MIN TAG MATCH moved down into the
          tag-slots group below (exploratory placement, see row 2b). */}
      <div className="flex items-center gap-[var(--space-md)] mb-[var(--space-xl)]">
        <h2 className="font-display text-[length:var(--text-xl)] leading-[var(--leading-display)] m-0 uppercase tracking-[var(--tracking-sm)]">Mixer</h2>
        <span className="font-body font-bold leading-[var(--leading-tight)] text-[var(--primary)] text-[length:var(--text-md)]">ミックス</span>
      </div>

      {/* Row 2: the tag-slots group + RECOMMEND. items-start (not
          items-center) on the outer row is deliberate: RecommendButton's own
          box is min-h-[92px], exactly a TagSlot's height, so top-aligning it
          against the group lines it up with just the tag-slots row
          specifically — even though the group is now taller overall (it
          also contains the badge/Random/Clear row below), because two
          equal-height boxes that are top-aligned are trivially also
          center-aligned relative to each other, without needing to exclude
          the second row from any comparison the way earlier centering fixes
          in this app had to. */}
      <div className="flex gap-[var(--space-2xl)] flex-wrap items-start">
        <div className="@container flex flex-col gap-[var(--space-xl)] flex-[1_1_280px] min-w-[258px]">
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

          {/* Row 2b, exploratory: MIN TAG MATCH (label, then TagIcon, then
              ≥, then the selector) on the left, vertically centered against
              this row's height; Random/Clear/badge grouped on the right.
              items-center (not items-start) is what centers MIN TAG MATCH's
              shorter box against Random/Clear's taller one — the badge
              opts back out with self-start so it stays flush against the
              row's own top edge (its previous "top aligned" position)
              rather than centering with everything else.

              @min-[514px] (not the old 313px): MIN TAG MATCH grew a label
              and two icons, and the right cluster gained the badge as a
              third item, so the two groups need much more combined width
              to share one line now — re-measured live via 1px-step
              bisection (fits at column width 514px, wraps at 513px). Below
              514px, justify-end (not justify-between) is what keeps both
              groups right-aligned once wrapped — see the doc comment above
              this same technique elsewhere in DESIGN_SYSTEM.md. Confirmed
              live across the full 1280→380px range that no width still
              shows the old bug (both groups landing flush-left once
              wrapped).

              gap-y is bumped only below that same 514px threshold: MIN TAG
              MATCH's hover subtext is `absolute`, so it doesn't reserve any
              space in-flow — fine at 514px+ where it has nothing below it
              to collide with, but once wrapped, Random/Clear/badge's line
              starts close enough beneath MIN TAG MATCH's line that the
              subtext visually overlapped it. Widening just the row-gap
              (not gap-x, which would misalign the same-line case) between
              the two wrapped lines gives the subtext room without ever
              touching the wide-viewport layout — simpler than making the
              hint conditionally in-flow/push-down on hover, and covers the
              case regardless of which segment (shortest vs longest hint
              text) is hovered. */}
          <div className="flex justify-end @min-[514px]:justify-between items-center gap-x-[var(--space-lg)] gap-y-[var(--space-lg)] @max-[513px]:gap-y-[var(--space-2xl)] flex-wrap">
            <div className="flex items-center gap-[var(--space-sm)]">
              <span className="font-mono font-bold text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] uppercase whitespace-nowrap">
                Min Tag Match
              </span>
              <TagIcon className="text-[var(--ink)]" />
              <GreaterEqualIcon className="text-[var(--ink)]" />
              <MatchSelector value={minMatch} onChange={onSetMatch} />
            </div>
            <div className="flex items-center gap-[var(--space-lg)]">
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
                Clear ✕
              </button>
              <span
                className={[
                  "self-start font-mono font-bold text-[length:var(--text-sm)] border-[length:var(--border-thin)] border-[var(--ink)] px-[var(--space-md)] py-[var(--space-xs)]",
                  // Text color, not just bg, needs to carry the zero/filled
                  // distinction — at 0/3 the bg alone (--slot-empty, now
                  // matching RecommendButton's --disabled-bg) read as barely
                  // different from filled once --ink text dominated the
                  // small box in the darker themes. --disabled-text at 0/3
                  // (matching RecommendButton's own disabled label color)
                  // and --ink from 1/3 up (matching Random/Clear's own text
                  // color) makes the same disabled/active distinction
                  // visible through the numbers themselves.
                  filledCount === 0 ? "bg-[var(--slot-empty)] text-[var(--disabled-text)]" : "bg-[var(--fill)] text-[var(--ink)]",
                ].join(" ")}
              >
                {lockedLabel}
              </span>
            </div>
          </div>
        </div>
        <div className="ml-auto">
          <RecommendButton filledCount={filledCount} onRecommend={onRecommend} error={error} />
        </div>
      </div>
    </section>
  );
}

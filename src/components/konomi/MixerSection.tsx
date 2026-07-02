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
      {/* Row 1: header left, MIN TAG MATCH inline right — same segmented-
          control size as Level/Sort in the Tag Pool header now (see
          MatchSelector), so all three filter controls in the app read as
          one consistent component, not a Mixer-specific size. The caption
          ("MIN TAG MATCH — how many must overlap") is deliberately gone for
          now, not replaced — a placeholder removal, not a final design. */}
      <div className="flex items-center justify-between gap-[var(--space-lg)] flex-wrap mb-[var(--space-xl)]">
        <div className="flex items-center gap-[var(--space-md)]">
          <h2 className="font-display text-[length:var(--text-xl)] leading-[var(--leading-display)] m-0 uppercase tracking-[var(--tracking-sm)]">Mixer</h2>
          <span className="font-body font-bold leading-[var(--leading-tight)] text-[var(--primary)] text-[length:var(--text-md)]">ミックス</span>
        </div>
        <MatchSelector value={minMatch} onChange={onSetMatch} />
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

          {/* Badge (left) + Random/Clear (right), directly below the tag
              slots and matching their width exactly (this div is a flex-col
              sibling of the tag-slots row above, inside the same
              flex-[1_1_280px] column, so it inherits that same width) —
              right-aligned to the tag slots specifically, not the wider row
              that also contains RecommendButton. items-start (not
              items-end) keeps the badge flush against the top of this row —
              closest to the tag slots directly above it — rather than
              sinking to match Random/Clear's taller bottom edge.

              justify-between only works while badge + Random/Clear fit on
              one line — a lone wrapped flex item under justify-between
              degenerates to flex-start (CSS spec), which left-pins BOTH the
              badge and the Random/Clear group once this row's own width
              (shared with RecommendButton up in the row above) gets tight
              enough that they stack. Confirmed live: that stacked state
              only happens while this column's own width is below 313px
              (measured exactly at the flex-wrap boundary via bounding-box
              scan) — @container/@min-[313px] swaps back to justify-between
              the instant there's room for both on one line, and
              justify-end packs each solo-line item to the right below
              that, matching Random/Clear's already-right-aligned position
              instead of leaving everything flush left. */}
          <div className="flex justify-end @min-[313px]:justify-between items-start gap-[var(--space-lg)] flex-wrap">
            <span
              className={[
                "font-mono font-bold text-[length:var(--text-sm)] border-[length:var(--border-thin)] border-[var(--ink)] px-[var(--space-md)] py-[var(--space-xs)]",
                filledCount === 0 ? "bg-[var(--slot-empty)]" : "bg-[var(--fill)]",
              ].join(" ")}
            >
              {lockedLabel}
            </span>
            <div className="flex gap-[var(--space-lg)]">
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
        <div className="ml-auto">
          <RecommendButton filledCount={filledCount} onRecommend={onRecommend} error={error} />
        </div>
      </div>
    </section>
  );
}

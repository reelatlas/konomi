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
    // No overflow-hidden here — the spinning star (RecommendButton) is
    // allowed to rotate past the section's own edge, by explicit product
    // decision, same as it's always been allowed to overlap the tag-slot
    // row above. An overflow-hidden clip was tried briefly, when the star's
    // rotating bounding box breaching the bottom border read as the
    // section's bottom padding being bigger than its top's (they were
    // actually equal — a since-fixed, unrelated bug in RecommendButton's own
    // height was the real cause; see that component). Removing the clip is
    // the simpler option, not a more complex one — it's a one-line deletion
    // either way. The star itself also shrank (150px/139px → 128px/118px) to
    // reduce how far it reaches past the card at its widest rotation.
    <section className="@container relative border-[length:var(--border-base)] border-[var(--ink)] bg-[var(--surface)] shadow-[var(--elev-5)] p-[var(--space-2xl)] mb-[var(--space-3xl)]">
      {/* Row 1: title, plus the filled-count badge inline on the same row —
          right-aligned, and bottom-aligned to the title cluster specifically
          (items-end, not items-center) rather than to the tag slots below.
          The title cluster (h2 + ミックス) is its own flex item so its
          internal items-center (baseline-aligning the two of them against
          each other) isn't disturbed by the outer row's items-end. */}
      <div className="flex items-end justify-between mb-[var(--space-xl)]">
        <div className="flex items-center gap-[var(--space-md)]">
          <h2 className="font-display text-[length:var(--text-xl)] leading-[var(--leading-display)] m-0 uppercase tracking-[var(--tracking-sm)]">Mixer</h2>
          <span className="font-body font-bold leading-[var(--leading-tight)] text-[var(--primary)] text-[length:var(--text-md)]">ミックス</span>
        </div>
        <span
          className={[
            "font-mono font-bold text-[length:var(--text-sm)] border-[length:var(--border-thin)] border-[var(--ink)] px-[var(--space-md)] py-[var(--space-xs)]",
            // Text color, not just bg, needs to carry the zero/filled
            // distinction — at 0/3 the bg alone (--slot-empty, matching
            // RecommendButton's --disabled-bg) read as barely different from
            // filled once --ink text dominated the small box in the darker
            // themes. --disabled-text at 0/3 (matching RecommendButton's own
            // disabled label color) and --ink from 1/3 up (matching
            // Random/Clear's own text color) makes the same disabled/active
            // distinction visible through the numbers themselves.
            filledCount === 0 ? "bg-[var(--slot-empty)] text-[var(--disabled-text)]" : "bg-[var(--fill)] text-[var(--ink)]",
          ].join(" ")}
        >
          {lockedLabel}
        </span>
      </div>

      {/* Row 2: the 3 tag slots, full section width now that RECOMMEND has
          moved out to its own row below (see row 3) instead of sharing this
          one — each TagSlot is already flex-1, so they simply stretch to
          fill whatever width they're given. */}
      <div className="flex gap-[var(--space-lg)] mb-[var(--space-xl)]">
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

      {/* Row 3: MIN TAG MATCH (left) and Random/Clear/divider/RECOMMEND
          (right) as one flat, order-preserving flex-wrap row — not two
          separately-wrapping group boxes. `ml-auto` on the Random button is
          what creates the "left cluster / right cluster" visual split
          (pushing everything from Random onward flush right, leaving MIN
          TAG MATCH flush left) while every item still wraps individually in
          DOM order. That's the deliberate reason for this structure: as the
          row narrows, RECOMMEND — last in DOM order — is always the first
          candidate to run out of room and wrap to its own new line, while
          MIN TAG MATCH + Random + Clear stay together on the line above for
          as long as they still fit, exactly the fallback behavior asked
          for. A two-group-box layout (each group wrapping as one atomic
          unit) can't produce this split — the whole right group would drop
          together instead of letting just RECOMMEND peel off.

          Label hidden below @min-[Wpx] (icons + selector stay) and the
          divider hidden below @min-[Dpx] (so it doesn't dangle at the end of
          a line with nothing to its right once RECOMMEND has already
          wrapped away) — both thresholds measured live against the real
          component, not guessed; see DESIGN_SYSTEM.md. */}
      <div className="flex flex-wrap items-center gap-x-[var(--space-lg)] gap-y-[var(--space-lg)]">
        <div className="flex items-center gap-[var(--space-sm)]">
          <span className="hidden @min-[480px]:inline font-mono font-bold text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] uppercase whitespace-nowrap">
            Min Tag Match
          </span>
          <TagIcon className="text-[var(--ink)]" />
          <GreaterEqualIcon className="text-[var(--ink)]" />
          <MatchSelector value={minMatch} onChange={onSetMatch} />
        </div>
        {/* Random + Clear as one flex item (not two flat siblings sharing
            the row's own gap) — `ml-auto` here, not on the Random button
            itself, so the two buttons keep a fixed, tighter gap between
            each other regardless of the bigger, independently-controlled
            gap the divider gets on both its sides below. */}
        <div className="ml-auto flex items-center gap-[var(--space-lg)]">
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
        </div>
        {/* The row's own gap-x (space-lg, 12px) is the fallback spacing on
            every side, including Clear→RECOMMEND directly once the divider
            is hidden below min-[993px] (display:none removes it from the
            flex line entirely, so that pair collapses to just the one
            gap-x — no separate fallback margin needed). `ml`/`mr` here add
            *more* on top of that gap-x, so both sides of the divider end up
            bigger than the row's baseline instead of just matching it — a
            plain `gap` can't give one pair of neighbors more room than the
            rest without changing every other gap in the row too.
            `ml` is 2px more than `mr` — not a mistake: Clear's own
            `elev-2` shadow (a solid 3px offset, bottom-right) reads as part
            of its visual footprint, eating into the whitespace on its own
            right side, so the strictly-equal CSS gap looked visually
            tighter on the Clear→divider side than divider→RECOMMEND — this
            nudges the two back to reading as balanced.

            min-[993px] (a plain viewport media query, not a @container
            query like the label above) — deliberately the exact same 993px
            ResultCard already uses for its own tier boundary (see
            ResultCard.tsx): that's the width where the results carousel
            drops from 4 comfortable cards to 3. The divider disappearing at
            that same, already-meaningful breakpoint (rather than one
            re-bisected against the Mixer's own content) means both sections
            change register at the same point instead of drifting in and out
            of sync as the page narrows. */}
        <div className="hidden min-[993px]:block ml-[calc(var(--space-xl)_+_2px)] mr-[var(--space-xl)] w-[length:var(--border-thin)] h-[32px] bg-[var(--ink)]" />
        {/* Once the divider itself is gone (below min-[993px]), RECOMMEND
            would otherwise sit right on top of Clear with only the row's
            bare gap-x (12px) between them — this restores a bit of breathing
            room without the divider, `min-[686px]:max-[993px]:ml-[space-lg]`
            (bisected live: 12px of extra margin is exactly what pushed the
            natural wrap point from 674px out to 686px, so anything from
            686px up to the divider's own 993px cutover keeps that spacing
            safely). Below 686px, this margin turns itself back off — the
            same "shed decoration before wrapping" idea as the divider
            itself — which is what lets the row keep fitting on one line all
            the way down to the *original*, no-extra-margin wrap point
            (674px, re-bisected and unchanged by removing this class).

            `max-[674px]:ml-auto` only takes over right at that true wrap
            point — width < 674px is exactly the range where RECOMMEND is
            guaranteed to be alone on its own wrapped line (confirmed live),
            so this auto margin has that whole line's free space to itself
            and pushes it flush right, with no competition from Random/
            Clear's own separate `ml-auto` one line above — CSS only splits
            auto-margin space between items sharing the *same* line, so two
            auto margins on two different lines never interact. Applying
            this unconditionally (the first attempt) was the bug: on the
            wide *shared* line, a second auto margin here competed with
            Random/Clear's for the same free space and visibly pulled that
            whole cluster off the right edge toward center. */}
        <div className="min-[686px]:max-[993px]:ml-[var(--space-lg)] max-[674px]:ml-auto">
          <RecommendButton filledCount={filledCount} onRecommend={onRecommend} error={error} />
        </div>
      </div>
    </section>
  );
}

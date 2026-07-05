interface TagSlotProps {
  index: number;
  tag: string | null;
  isDragOver: boolean;
  onDragOver: (index: number) => void;
  onDragLeave: () => void;
  onDrop: (index: number, tag: string) => void;
  onClick: (index: number) => void;
}

export function TagSlot({ index, tag, isDragOver, onDragOver, onDragLeave, onDrop, onClick }: TagSlotProps) {
  const filled = Boolean(tag);

  return (
    <div
      data-slot={index}
      // Filled slots are also a drag *source* now, not just a drop target —
      // matches TagChip's own dataTransfer pattern exactly (same
      // "text/plain" key, same reducer entry point via onDrop below), so a
      // slot's own tag can be dragged onto another slot. The reducer
      // (PLACE_IN_SLOT in useKonomi.ts) is what actually turns this into a
      // swap when the target slot is also filled — this component only
      // needs to originate the drag, same as the pool always has.
      // effectAllowed "move" (not TagChip's "copy"): dragging a tag out of
      // a slot really does relocate it, unlike dragging from the pool,
      // where the source chip stays exactly as selectable as before.
      draggable={filled}
      onDragStart={
        filled
          ? (e) => {
              e.dataTransfer.setData("text/plain", tag as string);
              e.dataTransfer.effectAllowed = "move";
            }
          : undefined
      }
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(index);
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(index, e.dataTransfer.getData("text/plain"));
      }}
      onClick={() => onClick(index)}
      title={filled ? (tag as string) : undefined}
      aria-label={filled ? (tag as string) : `Empty slot ${index + 1}, tap to add a tag`}
      className={[
        // Three height tiers, mobile-first: shorter + no index/caption below
        // sm (640px), current 92px form restored at lg (1024px) — see
        // DESIGN_SYSTEM.md-style reasoning in this component's own tiers
        // below for what's hidden/shown at each.
        "flex-1 min-w-[78px] h-[56px] sm:h-[76px] lg:h-[92px] px-[var(--space-xs)] sm:px-0",
        "flex items-center justify-center transition-transform duration-75",
        filled ? "cursor-grab" : "cursor-pointer",
        "border-[length:var(--border-base)] border-[var(--ink)]",
        // border-dashed clips its left/right edges on iOS WebKit (all iOS
        // browsers) — cosmetic, empty-state only. Accepted. Do not "fix"
        // by swapping to outline-dashed (also clips) or SVG stroke
        // (corners slide on resize). See DESIGN_SYSTEM.md.
        filled ? "border-solid" : "border-dashed",
        filled ? "bg-[var(--primary)]" : isDragOver ? "bg-[var(--secondary)]" : "bg-[var(--slot-empty)]",
        filled ? "shadow-[var(--elev-3-accent)]" : "shadow-none",
        // No transform at all when not drag-over — a no-op
        // `translate-x-0 translate-y-0` was applied unconditionally before,
        // which still forces its own compositing layer on every slot at all
        // times for zero visual benefit. Only ever needs an actual
        // transform during the brief drag-over offset.
        isDragOver ? "-translate-x-[2px] -translate-y-[2px]" : "",
      ].join(" ")}
    >
      {filled ? (
        <div className="text-center pointer-events-none w-full">
          {/* line-clamp-2 is the wrap/truncate behavior itself — wraps
              freely up to 2 lines, only clipping a rare 3rd-line overflow
              with an ellipsis. The full name still reaches assistive tech
              and hover via this slot's own title/aria-label above,
              regardless of clamping.

              Kept through sm (not reset until lg, unlike this row's other
              sm-vs-mobile toggles) — confirmed live this tier genuinely
              needs it: sm's own box (76px tall, narrower than lg's) can
              overflow on a long real name once wrapping is fully
              unclamped, a risk lg's wider/taller box doesn't share (tested
              live with a deliberately long name — no overflow at lg even
              unclamped). Only lg resets to line-clamp-none, matching "as-is,
              no clamp" for the one tier that was already proven safe
              without it.

              pb-[4px]: -webkit-line-clamp's own clip boundary is exactly
              2 × line-height, with zero allowance for glyph descenders —
              a leading-tight (1.05) line-height is tight enough relative to
              font-body's actual metrics that a 2nd-line descender (the "g"
              in e.g. "Cute Things") gets hard-clipped there, confirmed live
              by removing the caption below entirely and seeing the exact
              same clip — proving the caption/gap have zero effect on this,
              since line-clamp's box is self-contained and doesn't know or
              care what sits below it. `overflow: hidden` (which line-clamp
              sets) clips at the *padding* box, not the content box, so
              padding-bottom buys descenders real room without touching
              line-height or the line count — tested live at 2/3/4px; 4px is
              the first value where "Things"' g renders its full loop with
              no clipping. */}
          <div className="font-body font-black text-[length:var(--text-sm)] sm:text-[length:var(--text-md)] leading-[var(--leading-tight)] text-[var(--on-primary)] line-clamp-2 lg:line-clamp-none break-words pb-[4px] lg:pb-0">
            {tag}
          </div>
          {/* Smaller + tighter-gapped than lg's own (10px/4px) caption at
              the sm–md tier specifically — one step smaller again (8px,
              down from an earlier 9px pass) to keep freeing space within
              the unchanged 76px box now that the name's own pb-[4px] above
              claims a little more of it. Not itself what fixes the
              descender clipping (verified above that's the name div's own
              overflow boundary, unrelated to this caption) — this is purely
              about preserving headroom/density at this tier, same
              "shrink type before growing the box" preference as pb-[4px]
              above. Verified live with a real 2-line name ("Cute Girls
              Doing Cute Things") across the sm–md range (640/700/800px):
              both lines' descenders render fully, this caption sits clear
              beneath with no overlap, and the slot's own height is still
              exactly 76px — unchanged. */}
          <div className="hidden sm:block font-mono text-[8px] lg:text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] text-[var(--secondary)] mt-[2px] lg:mt-[var(--space-xs)]">
            TAP TO CLEAR
          </div>
        </div>
      ) : (
        <div className="text-center pointer-events-none">
          <div className="hidden sm:block font-display text-[length:var(--text-lg)] lg:text-[length:var(--text-2xl)] leading-none text-[var(--muted)]">
            {index + 1}
          </div>
          <div className="hidden sm:block font-mono text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] text-[var(--muted)] mt-[var(--space-xs)]">
            ADD TAG
          </div>
          {/* Mobile-only stand-in for the index number + "ADD TAG" caption
              above — no index at this tier, so this is the slot's only
              label, not a second line under one. */}
          <div className="sm:hidden font-mono text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] text-[var(--muted)]">
            ADD TAG
          </div>
        </div>
      )}
    </div>
  );
}

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
        // One fixed height now, not three responsive tiers: h-[44.5px]
        // matches IconButton/ActionButton's own shared md height exactly
        // (see IconButton.tsx's own SIZE_PX comment). These slots now sit
        // in the same single row as those buttons (MixerBar.tsx, by
        // request), so they need to actually match that row's real
        // rendered height, not just a similar-looking one.
        "flex-1 min-w-[78px] h-[44.5px] px-[var(--space-sm)]",
        "flex items-center justify-center transition-transform duration-75",
        filled ? "cursor-grab" : "cursor-pointer",
        "border-[length:var(--border-base)]",
        // border-dashed clips its left/right edges on iOS WebKit (all iOS
        // browsers) — cosmetic, empty-state only. Accepted. Do not "fix"
        // by swapping to outline-dashed (also clips) or SVG stroke
        // (corners slide on resize). See DESIGN_SYSTEM.md.
        //
        // border-[var(--muted)], not --ink, for the empty/dashed state —
        // matches the "MIX TAGS" empty-results placeholder's own dashed
        // border color exactly (RecommendationsBody.tsx), so the app's two
        // "zero state" dashed boxes read as one consistent color instead of
        // two different ones (this was a real, confirmed mismatch across
        // every theme, not just the default one — --ink and --muted are
        // never the same value in any theme). Filled slots keep --ink
        // (solid), unchanged.
        filled ? "border-solid border-[var(--ink)]" : "border-dashed border-[var(--muted)]",
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
        // Single truncated line now, not a 2-line-clamp name + "TAP TO
        // CLEAR" caption stacked beneath it: there's no room left for a
        // second line or a caption at this box's own new 44.5px height
        // (matching the row's buttons, see the height comment above).
        // The full name still reaches assistive tech and hover via this
        // slot's own title/aria-label above regardless of truncation, and
        // the click behavior no longer needs its own visible caption to
        // explain it, same as this row's other compact buttons don't
        // spell out what a tap does beyond their own label.
        <span className="pointer-events-none w-full text-center truncate font-body font-black text-[length:var(--text-sm)] leading-none text-[var(--on-primary)]">
          {tag}
        </span>
      ) : (
        // No index number anymore either, same reasoning as dropping the
        // caption above: this was already the mobile-only fallback
        // (sm:hidden below 640px) before, now it's the one and only form
        // at every width, since there's no longer a taller tier with room
        // to spare for it.
        <span className="pointer-events-none whitespace-nowrap font-mono text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] uppercase text-[var(--muted)]">
          ADD TAG
        </span>
      )}
    </div>
  );
}

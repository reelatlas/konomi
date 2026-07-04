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
      className={[
        "flex-1 min-w-[78px] h-[92px] flex items-center justify-center transition-transform duration-75",
        filled ? "cursor-grab" : "cursor-pointer",
        "border-[length:var(--border-base)] border-[var(--ink)]",
        filled ? "border-solid" : "border-dashed",
        filled ? "bg-[var(--primary)]" : isDragOver ? "bg-[var(--secondary)]" : "bg-[var(--slot-empty)]",
        filled ? "shadow-[var(--elev-3-accent)]" : "shadow-none",
        isDragOver ? "-translate-x-[2px] -translate-y-[2px]" : "translate-x-0 translate-y-0",
      ].join(" ")}
    >
      {filled ? (
        <div className="text-center pointer-events-none">
          <div className="font-body font-black text-[length:var(--text-md)] leading-[var(--leading-tight)] text-[var(--on-primary)]">{tag}</div>
          <div className="font-mono text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] text-[var(--secondary)] mt-[var(--space-xs)]">TAP TO CLEAR</div>
        </div>
      ) : (
        <div className="text-center pointer-events-none">
          <div className="font-display text-[length:var(--text-2xl)] leading-none text-[var(--muted)]">{index + 1}</div>
          <div className="font-mono text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] text-[var(--muted)] mt-[var(--space-xs)]">ADD TAG</div>
        </div>
      )}
    </div>
  );
}

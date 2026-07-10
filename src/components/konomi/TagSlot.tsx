interface TagSlotProps {
  index: number;
  tag: string | null;
  isDragOver: boolean;
  onDragOver: (index: number) => void;
  onDragLeave: () => void;
  onDrop: (index: number, tag: string) => void;
  onClick: (index: number) => void;
}

// Tiered by character count, not a live text-fit measurement. A tag's
// length is known upfront (no async layout round-trip needed), and the
// real catalog's longest names top out around 28 characters ("Cute Girls
// Doing Cute Things"), comfortably covered by four tiers. Whimsical by
// request: a long tag is meant to visibly shrink and wrap rather than
// truncate, not stay a fixed size.
function fontSizeClassFor(name: string): string {
  const len = name.length;
  if (len <= 8) return "text-[length:var(--text-sm)]";
  if (len <= 14) return "text-[length:var(--text-xs)]";
  if (len <= 20) return "text-[length:var(--text-2xs)]";
  return "text-[length:var(--text-3xs)]";
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
        // Fixed w AND h now, not flex-1/min-w: a plain w-[78px], the same
        // 78px this box already rendered at every breakpoint even before
        // this comment, confirmed live (down to empty "ADD TAG" state).
        // flex-1 here was never actually growing this box past 78px in
        // practice (subgroup A, the 3-slot wrapper, never receives more
        // width from its own flex parent than its children's own content
        // needs, so flex-1's grow factor had nothing real to distribute),
        // but it silently depended on that coincidence holding, which broke
        // the instant a slot's own content (a real tag name, wrappable, no
        // longer truncated) got long enough to want more than 78px on one
        // line: flex-basis:0% items still contribute their own unwrapped
        // content width to their flex CONTAINER's own intrinsic sizing
        // (a documented flexbox quirk, not a bug in this app's code), which
        // inflated subgroup A itself, and flex-1 then spread that extra
        // width across all 3 slots, not just the long one, confirmed live
        // as a real, reported regression (a slot visibly widening the
        // moment a tag was dropped into ANY of the 3, not just its own).
        // A literal fixed width sidesteps the whole mechanism: nothing
        // about a slot's own content can ever influence its width, empty or
        // filled, at any breakpoint, which is exactly what was expected
        // here even when flex-1 was still doing the (as it turns out,
        // unnecessary) work of arriving at that same 78px.
        //
        // h-[44.5px]: matches IconButton/ActionButton's own shared md
        // height exactly (see IconButton.tsx's own SIZE_PX comment), and
        // stays exactly that regardless of fill state or tag length,
        // requested directly, not allowed to grow taller with wrapped text
        // the way an earlier version of this let it. overflow-hidden is
        // the backstop for fontSizeClassFor's smallest tier at the longest
        // real tag name, not the primary mechanism: that tier is already
        // sized to fit the real catalog's longest name (see its own
        // comment) within this exact height.
        "w-[78px] h-[44.5px] px-[var(--space-sm)] overflow-hidden",
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
        // Wraps and shrinks instead of truncating: no line-clamp cap for
        // now (deliberate, see fontSizeClassFor's own comment above). A
        // long name is meant to actually be readable in full, just smaller
        // and taller, not cut short with an ellipsis. leading-tight, not
        // leading-none, since a wrapped multi-line name needs real
        // line-height to stay legible; single-line short names (the common
        // case) look identical either way. The full name still reaches
        // assistive tech and hover via this slot's own title/aria-label
        // above regardless of how many lines it wraps to.
        <span
          className={[
            "pointer-events-none w-full text-center font-body font-black leading-[var(--leading-tight)] lowercase text-[var(--on-primary)]",
            fontSizeClassFor(tag as string),
          ].join(" ")}
        >
          {tag}
        </span>
      ) : (
        // No index number anymore either, same reasoning as dropping the
        // caption above: this was already the mobile-only fallback
        // (sm:hidden below 640px) before, now it's the one and only form
        // at every width, since there's no longer a taller tier with room
        // to spare for it.
        <span className="pointer-events-none whitespace-nowrap font-mono text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] lowercase text-[var(--muted)]">
          add tag
        </span>
      )}
    </div>
  );
}

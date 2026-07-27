interface TagChipProps {
  // THE IDENTITY CONTRACT (types.ts): id keys everything — drag payload,
  // toggle callback, data-tag; `name` is display-only.
  id: string;
  name: string;
  active: boolean;
  size?: "base" | "small";
  onToggle: (tagId: string) => void;
}

export function TagChip({ id, name, active, size = "base", onToggle }: TagChipProps) {
  const isBase = size === "base";

  return (
    <button
      type="button"
      draggable
      data-tag={id}
      data-name={name}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(id);
      }}
      className={[
        "inline-flex items-center cursor-grab active:cursor-grabbing select-none lowercase font-mono font-bold",
        // focus-ring-inset: the app's one focus regime — and chips live
        // inside scroll containers, the exact case an outside ring gets
        // clipped by (globals.css).
        "focus-ring-inset border-[length:var(--border-base)] border-[var(--ink)] rounded-[var(--radius-chip)]",
        // small = the DENSE TIER (sizing unification ⑤/2b): fixed
        // h-[--control-h-sm] box (no more py-derived 27px) with text-xs
        // 11px, up from 2xs 10 — chips are read, not just labeled, and 10
        // was the floor of comfortable scanning (SIZING_AUDIT.md §6). The
        // base classes' inline-flex items-center center the label in the
        // fixed box. NOTE: isBase currently has ZERO call sites (both
        // TagPoolBody and TagScrollArea pass size="small") — dead-variant
        // candidate logged in SIZING_AUDIT.md; not removed here.
        isBase
          ? "text-[length:var(--text-sm)] tracking-[var(--tracking-md)] px-[var(--space-lg)] py-[var(--space-md)]"
          : "h-[var(--control-h-sm)] border-[length:var(--border-thin)] text-[length:var(--text-xs)] tracking-[var(--tracking-sm)] px-[var(--space-md)]",
        active ? "bg-[var(--primary)] text-[var(--surface)]" : isBase ? "bg-[var(--surface)] text-[var(--ink)]" : "bg-[var(--fill)] text-[var(--ink)]",
        isBase ? (active ? "shadow-[var(--elev-2-accent)]" : "shadow-[var(--elev-2)]") : "",
      ].join(" ")}
    >
      {name}
    </button>
  );
}

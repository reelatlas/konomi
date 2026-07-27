interface TagChipProps {
  // THE IDENTITY CONTRACT (types.ts): id keys everything — drag payload,
  // toggle callback, data-tag; `name` is display-only.
  id: string;
  name: string;
  active: boolean;
  size?: "base" | "small";
  onToggle: (tagId: string) => void;
}

// Length-tiered downsizing for the small (dense-tier) chip — TagSlot's
// fontSizeClassFor precedent extended to chips (user-ruled 2026-07-26):
// a super-long name steps down so any wrap inside the fixed
// --control-h-sm box stays smooth (two 9px lines fit the 30px box with
// room), maintaining aesthetic over strict type-size accessibility for
// the long tail — a documented, deliberate compromise ("it's okay if
// users have to squint every now and then"). Thresholds are sized to
// the RESULT CARD's ~196px tag area, the one place chips actually hit a
// width limit (the pool is wide): ~26 chars of 11px mono fit one line
// there, so the first step-down lands just before wrapping would start,
// and anything long enough to wrap even at 10px drops to 9px so the
// two-line form fits the fixed box.
function smallChipSizeClass(name: string): string {
  const len = name.length;
  if (len <= 24) return "text-[length:var(--text-xs)]";
  if (len <= 32) return "text-[length:var(--text-2xs)]";
  return "text-[length:var(--text-3xs)]";
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
          : `h-[var(--control-h-sm)] border-[length:var(--border-thin)] ${smallChipSizeClass(name)} tracking-[var(--tracking-sm)] px-[var(--space-md)]`,
        active ? "bg-[var(--primary)] text-[var(--surface)]" : isBase ? "bg-[var(--surface)] text-[var(--ink)]" : "bg-[var(--fill)] text-[var(--ink)]",
        isBase ? (active ? "shadow-[var(--elev-2-accent)]" : "shadow-[var(--elev-2)]") : "",
      ].join(" ")}
    >
      {name}
    </button>
  );
}

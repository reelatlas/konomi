interface TagChipProps {
  // THE IDENTITY CONTRACT (types.ts): id keys everything — drag payload,
  // toggle callback, data-tag; `name` is display-only.
  id: string;
  name: string;
  active: boolean;
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

// Single form since the shadow-tier batch (user-confirmed): the old
// "base" variant had ZERO call sites (found by the sizing audit) and was
// deleted with its elev-2/-2-accent shadows — chips are always the
// dense-tier form now, and per the shadow ruling they carry NO shadow.
export function TagChip({ id, name, active, onToggle }: TagChipProps) {

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
        // The DENSE TIER form (sizing unification ⑤/2b): fixed
        // h-[--control-h-sm] box with length-tiered text (smallChipSizeClass
        // — 11px, stepping down for long names). Zero shadow, per the
        // shadow-tier ruling: tags are flat everywhere (pool + cards).
        `h-[var(--control-h-sm)] border-[length:var(--border-base)] ${smallChipSizeClass(name)} tracking-[var(--tracking-sm)] px-[var(--space-md)]`,
        active ? "bg-[var(--primary)] text-[var(--surface)]" : "bg-[var(--fill)] text-[var(--ink)]",
      ].join(" ")}
    >
      {name}
    </button>
  );
}

interface TagChipProps {
  name: string;
  active: boolean;
  size?: "base" | "small";
  onToggle: (tag: string) => void;
}

export function TagChip({ name, active, size = "base", onToggle }: TagChipProps) {
  const isBase = size === "base";

  return (
    <button
      type="button"
      draggable
      data-tag={name}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", name);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(name);
      }}
      className={[
        "inline-flex items-center cursor-grab select-none uppercase font-mono font-bold",
        "border-[length:var(--border-base)] border-[var(--ink)] rounded-[var(--radius-chip)]",
        isBase
          ? "text-[length:var(--text-sm)] tracking-[var(--tracking-md)] px-[var(--space-lg)] py-[var(--space-md)]"
          : "border-[length:var(--border-thin)] text-[length:var(--text-2xs)] tracking-[var(--tracking-sm)] px-[var(--space-md)] py-[var(--space-xs)]",
        active ? "bg-[var(--primary)] text-[var(--surface)]" : isBase ? "bg-[var(--surface)] text-[var(--ink)]" : "bg-[var(--fill)] text-[var(--ink)]",
        isBase ? (active ? "shadow-[var(--elev-2-accent)]" : "shadow-[var(--elev-2)]") : "",
      ].join(" ")}
    >
      {name}
    </button>
  );
}

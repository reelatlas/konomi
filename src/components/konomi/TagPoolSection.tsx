import { ALL_TAGS } from "@/lib/konomi/data";
import { TagChip } from "./TagChip";

interface TagPoolSectionProps {
  selectedTags: string[];
  onChipToggle: (tag: string) => void;
}

export function TagPoolSection({ selectedTags, onChipToggle }: TagPoolSectionProps) {
  return (
    <section className="border-[length:var(--border-base)] border-[var(--ink)] bg-[var(--surface)] shadow-[var(--elev-5)] p-[var(--space-2xl)] mb-[var(--space-xl)]">
      <div className="flex items-center gap-[var(--space-md)] mb-[var(--space-xl)]">
        <h2 className="font-display text-[length:var(--text-xl)] m-0 uppercase tracking-[var(--tracking-sm)]">Tag Pool</h2>
        <span className="font-body font-bold text-[var(--primary)] text-[length:var(--text-md)]">タグ</span>
        <span className="ml-auto font-mono text-[length:var(--text-xs)] text-[var(--muted)]">drag or tap to load a slot</span>
      </div>
      <div className="flex flex-wrap gap-[var(--space-md)]">
        {ALL_TAGS.map((tag) => (
          <TagChip key={tag} name={tag} active={selectedTags.includes(tag)} onToggle={onChipToggle} />
        ))}
      </div>
    </section>
  );
}

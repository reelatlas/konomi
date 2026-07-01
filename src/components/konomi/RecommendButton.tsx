import { DEFAULT_ACCENT } from "@/lib/konomi/config";

const STAR_CLIP = "[clip-path:polygon(50%_0,61%_35%,98%_35%,68%_57%,79%_91%,50%_70%,21%_91%,32%_57%,2%_35%,39%_35%)]";

interface RecommendButtonProps {
  filledCount: number;
  onRecommend: () => void;
}

export function RecommendButton({ filledCount, onRecommend }: RecommendButtonProps) {
  const enabled = filledCount > 0;
  const accent = DEFAULT_ACCENT;

  return (
    <div className="flex-none min-w-[188px] min-h-[92px] self-start flex items-center justify-center">
      <div className="relative flex items-center justify-center">
        <div
          className={[
            "absolute w-[190px] h-[190px] bg-[var(--ink)] animate-[kono-spin_20s_linear_infinite] z-0",
            STAR_CLIP,
            enabled ? "opacity-100" : "opacity-35",
          ].join(" ")}
        />
        <div
          className={[
            "absolute w-[176px] h-[176px] animate-[kono-spin_20s_linear_infinite] z-0",
            STAR_CLIP,
            accent === "primary" ? "bg-[var(--secondary)]" : "bg-[var(--primary)]",
            enabled ? "opacity-95" : "opacity-35",
          ].join(" ")}
        />
        <button
          type="button"
          onClick={onRecommend}
          disabled={!enabled}
          className={[
            "relative z-1 uppercase font-display text-[length:var(--text-lg)] tracking-[var(--tracking-md)] border-[length:var(--border-base)] border-[var(--ink)] px-[var(--space-xl)] py-[var(--space-lg)]",
            enabled ? "cursor-pointer shadow-[var(--elev-4)]" : "cursor-not-allowed shadow-none",
            enabled
              ? accent === "primary"
                ? "bg-[var(--primary)] text-[var(--on-primary)]"
                : "bg-[var(--secondary)] text-[var(--on-secondary)]"
              : "bg-[var(--disabled-bg)] text-[var(--disabled-text)]",
          ].join(" ")}
        >
          RECOMMEND ▸
        </button>
      </div>
    </div>
  );
}

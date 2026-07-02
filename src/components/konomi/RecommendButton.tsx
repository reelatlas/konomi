import { DEFAULT_ACCENT } from "@/lib/konomi/config";
import type { MixerError } from "@/lib/konomi/types";

const STAR_CLIP = "[clip-path:polygon(50%_0,61%_35%,98%_35%,68%_57%,79%_91%,50%_70%,21%_91%,32%_57%,2%_35%,39%_35%)]";

// Half of (mt-space-xs gap + subtext line height) = (4 + 15) / 2, measured
// live — shifts the star+button block up by exactly enough that the whole
// block+subtext group re-centers on the same point the button alone used to
// occupy, rather than the subtext just growing the block downward.
const ERROR_SHIFT = "-translate-y-[9.5px]";

const ERROR_MESSAGE: Record<NonNullable<MixerError>, string> = {
  "impossible-min": "lower MIN TAG MATCH",
  "no-match": "no series match this mix",
};

interface RecommendButtonProps {
  filledCount: number;
  onRecommend: () => void;
  error: MixerError;
}

export function RecommendButton({ filledCount, onRecommend, error }: RecommendButtonProps) {
  const enabled = filledCount > 0 && !error;
  const accent = DEFAULT_ACCENT;

  return (
    <div className="flex-none min-w-[188px] min-h-[92px] self-start flex items-center justify-center">
      <div
        className={["relative flex items-center justify-center transition-transform duration-200", error ? ERROR_SHIFT : ""].join(
          " ",
        )}
      >
        <div
          className={[
            "absolute w-[190px] h-[190px] bg-[var(--ink)] z-0",
            STAR_CLIP,
            error ? "" : "animate-[kono-spin_20s_linear_infinite]",
            enabled ? "opacity-100" : "opacity-35",
          ].join(" ")}
        />
        <div
          className={[
            "absolute w-[176px] h-[176px] z-0",
            STAR_CLIP,
            error ? "" : "animate-[kono-spin_20s_linear_infinite]",
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
        {error && (
          // --primary-deep, not --secondary: a bold, high-contrast variant
          // of primary (darkened for light-surface themes, lightened for
          // Tide's dark surface — see its doc comment in types.ts), and
          // matches the mini hint stars' color so the two read as
          // one connected hint rather than two unrelated accents.
          <span className="absolute top-full mt-[var(--space-xs)] whitespace-nowrap font-mono font-bold text-[length:var(--text-2xs)] tracking-[var(--tracking-xs)] text-[var(--primary-deep)]">
            {ERROR_MESSAGE[error]}
          </span>
        )}
      </div>
    </div>
  );
}

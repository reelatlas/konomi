import { scoreSeries, streamsFor } from "@/lib/konomi/scoring";
import type { ResultEntry } from "@/lib/konomi/types";
import { DiceIcon, LockClosedIcon, LockOpenIcon } from "./icons";
import { TagScrollArea } from "./TagScrollArea";

const DOT_CLASSES = ["bg-[var(--secondary)]", "bg-[var(--primary)]", "bg-[var(--muted)]"];

const ICON_BTN =
  "w-[30px] h-[30px] inline-flex items-center justify-center p-0 border-[length:var(--border-thin)] border-[var(--ink)] shadow-[var(--elev-1)] cursor-pointer text-[var(--ink)]";

interface ResultCardProps {
  entry: ResultEntry;
  rank: number;
  index: number;
  selectedTags: string[];
  filledCount: number;
  locked: boolean;
  flipped: boolean;
  canSwap: boolean;
  onFlip: (title: string) => void;
  onToggleLock: (title: string) => void;
  onReplace: (index: number) => void;
  onChipToggle: (tag: string) => void;
}

export function ResultCard({
  entry,
  rank,
  index,
  selectedTags,
  filledCount,
  locked,
  flipped,
  canSwap,
  onFlip,
  onToggleLock,
  onReplace,
  onChipToggle,
}: ResultCardProps) {
  const { series } = entry;
  // Recomputed live against the current tag selection on every render — not
  // taken from entry.score, which is frozen at whatever moment this card was
  // last (re)generated and would otherwise go stale the instant tags change
  // without a RECOMMEND in between.
  const score = scoreSeries(series, selectedTags);
  const perfect = score === filledCount && filledCount > 0;
  const scoreLabel = perfect ? "PERFECT" : `${score}/${filledCount}`;
  const swapDisabled = locked || !canSwap;
  const streams = streamsFor(series.title);

  return (
    <article
      data-title={series.title}
      onClick={() => onFlip(series.title)}
      className="h-[293px] [perspective:1100px] cursor-pointer"
    >
      <div
        className={[
          "relative w-full h-full [transform-style:preserve-3d] transition-transform duration-500 [transition-timing-function:cubic-bezier(.4,.2,.2,1)]",
          flipped ? "[transform:rotateY(180deg)]" : "[transform:rotateY(0deg)]",
        ].join(" ")}
      >
        {/* FRONT */}
        <div
          className={[
            "absolute inset-0 [backface-visibility:hidden] border-[length:var(--border-base)] border-[var(--ink)] shadow-[var(--elev-4)] overflow-hidden flex flex-col transition-opacity duration-200 bg-[var(--surface)]",
            flipped ? "opacity-0 pointer-events-none z-[1]" : "opacity-100 pointer-events-auto z-[2]",
          ].join(" ")}
        >
          <div className="relative h-[114px] border-b-[length:var(--border-base)] border-b-[var(--ink)] bg-[var(--fill)] bg-[radial-gradient(var(--muted)_1.4px,transparent_1.5px)] [background-size:8px_8px] flex items-center justify-center overflow-hidden">
            <span className="font-display text-[length:var(--text-cover)] text-[var(--primary)] opacity-85 leading-none">
              {series.title[0]}
            </span>
            <div className="absolute top-[var(--space-md)] right-[var(--space-md)] font-mono text-[length:var(--text-2xs)] tracking-[var(--tracking-2xl)] text-[var(--primary)] bg-[var(--surface)] border-[length:var(--border-hair)] border-[var(--ink)] px-[var(--space-sm)] py-[var(--space-xs)]">
              COVER
            </div>
            <div
              className={[
                "absolute bottom-[var(--space-md)] left-[var(--space-md)] font-display text-[length:var(--text-sm)] tracking-[var(--tracking-lg)] border-[length:var(--border-thin)] border-[var(--ink)] px-[var(--space-md)] py-[var(--space-xs)] -rotate-[4deg] shadow-[var(--elev-1)]",
                perfect ? "bg-[var(--secondary)] text-[var(--on-secondary)]" : "bg-[var(--surface)] text-[var(--ink)]",
              ].join(" ")}
            >
              {scoreLabel}
            </div>
            <div className="absolute top-[var(--space-md)] left-[var(--space-md)] flex gap-[var(--space-sm)]">
              <button
                type="button"
                title="Lock card"
                data-title={series.title}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLock(series.title);
                }}
                className={[
                  ICON_BTN,
                  locked ? "bg-[var(--secondary)] text-[var(--on-secondary)]" : "bg-[var(--surface)] text-[var(--ink)]",
                ].join(" ")}
              >
                {locked ? <LockClosedIcon /> : <LockOpenIcon />}
              </button>
              <button
                type="button"
                title="Swap for another"
                data-idx={index}
                disabled={swapDisabled}
                onClick={(e) => {
                  e.stopPropagation();
                  onReplace(index);
                }}
                className={[ICON_BTN, "bg-[var(--surface)] text-[var(--ink)]", swapDisabled ? "opacity-40 cursor-not-allowed" : "opacity-100 cursor-pointer"].join(
                  " ",
                )}
              >
                <DiceIcon />
              </button>
            </div>
          </div>
          <div className="px-[var(--space-lg)] pt-[var(--space-lg)] pb-[var(--space-lg)] flex flex-col gap-[var(--space-md)] flex-1 min-h-0">
            <div className="flex items-baseline gap-[var(--space-md)]">
              <span className="font-display text-[length:var(--text-base)] text-[var(--muted)]">#{rank}</span>
              <h3 className="font-body font-black text-[length:var(--text-md)] leading-[var(--leading-tight)] m-0">{series.title}</h3>
            </div>
            <div className="font-mono text-[length:var(--text-xs)] text-[var(--primary)]">
              {series.year} · {series.eps} EP
            </div>
            <TagScrollArea tags={series.tags} selectedTags={selectedTags} onChipToggle={onChipToggle} />
          </div>
        </div>

        {/* BACK */}
        <div
          className={[
            "absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] border-[length:var(--border-base)] border-[var(--ink)] shadow-[var(--elev-4)] overflow-hidden flex flex-col transition-opacity duration-200 bg-[var(--fill)] bg-[radial-gradient(var(--muted)_1.4px,transparent_1.5px)] [background-size:8px_8px]",
            flipped ? "opacity-100 pointer-events-auto z-[2]" : "opacity-0 pointer-events-none z-[1]",
          ].join(" ")}
        >
          <div className="bg-[var(--primary)] text-[var(--secondary)] font-display text-[length:var(--text-lg)] tracking-[var(--tracking-md)] px-[var(--space-lg)] py-[var(--space-md)] border-b-[length:var(--border-base)] border-b-[var(--ink)] uppercase flex gap-[var(--space-md)] items-baseline">
            WATCH ON
            <span className="font-body font-bold text-[length:var(--text-base)] text-[var(--on-primary)]">配信</span>
          </div>
          <div className="px-[var(--space-lg)] py-[var(--space-lg)] flex flex-col gap-[var(--space-md)] flex-1 overflow-hidden">
            {streams.map((name, di) => (
              <div
                key={name}
                className="flex items-center gap-[var(--space-md)] bg-[var(--surface)] border-[length:var(--border-thin)] border-[var(--ink)] px-[var(--space-md)] py-[var(--space-md)] shadow-[var(--elev-1)]"
              >
                <span className={["w-[14px] h-[14px] flex-none border-[length:var(--border-hair)] border-[var(--ink)]", DOT_CLASSES[di % DOT_CLASSES.length]].join(" ")} />
                <span className="font-body font-bold text-[length:var(--text-base)]">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

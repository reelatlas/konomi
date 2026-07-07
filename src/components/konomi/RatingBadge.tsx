// AniList's own weighted-average viewer score (0-100), shown as X.X/10,
// with a "double ghost" echo-frame treatment whose tier reflects how good
// the score is. Deliberately NOT rotated, unlike ResultCard's own match-%
// score badge (`-rotate-[4deg]`) — a plain, standard rectangle reads as a
// distinct kind of information (an external rating) rather than another
// instance of that badge's own "tag-match strength" language.

interface RatingBadgeProps {
  averageScore: number | null;
}

// This app's own bands over AniList's 0-100 averageScore — AniList itself
// doesn't define "good/mid/bad" cutoffs, these are a product decision, so
// they're named constants here rather than inline magic numbers.
const GOOD_THRESHOLD = 80; // >= 8.0 / 10
const MID_THRESHOLD = 60; // >= 6.0 / 10, below GOOD_THRESHOLD

// Hollow echo-frame ghosts, trailing toward the bottom-right of the plate —
// each one the plate's own size/shape, offset diagonally, unfilled (stroke
// only) so cover art shows through their own body; only the sliver that
// pokes out past the plate's own edge actually reads as a separate shape.
// Offsets/opacities are independently tunable per tier (GOOD's own first
// ghost doesn't have to match MID's just because they share an offset).
interface Ghost {
  x: number;
  y: number;
  opacity: number;
}
const GOOD_GHOSTS: Ghost[] = [
  { x: 8, y: 7, opacity: 0.35 },
  { x: 16, y: 14, opacity: 0.15 },
];
const MID_GHOSTS: Ghost[] = [{ x: 8, y: 7, opacity: 0.3 }];

// White, not a theme token: these outlines sit on arbitrary cover art, not
// a flat app surface — a theme-derived color could vanish against a dark
// cover the same way ResultCard's other on-cover controls (lock/swap row)
// already have to guard against. Tunable here since nothing else in the
// app needs an "on-cover ghost outline" role yet.
const GHOST_STROKE_COLOR = "white";
// Deliberately thinner than the plate's own border (--border-base, 2.5px)
// — a heavier ghost stroke would read as a second real badge instead of a
// fading echo of the first.
const GHOST_BORDER_WIDTH_PX = 1.5;

interface Tier {
  // Complete className strings (not composed from smaller pieces) for the
  // plate's own bg/border/text — matches the existing score badge's own
  // ternary-of-complete-strings pattern (see the "PERFECT" badge above the
  // title block) rather than building a class from parts.
  plateClassName: string;
  ghosts: Ghost[];
}

function tierFor(averageScore: number | null): Tier {
  if (averageScore === null) {
    // White/flat — a real border (--ink), same as GOOD/MID, just no ghosts
    // and no color-coded verdict since there's nothing to grade yet.
    return { plateClassName: "bg-[var(--surface)] border-[var(--ink)] text-[var(--ink)]", ghosts: [] };
  }
  if (averageScore >= GOOD_THRESHOLD) {
    return {
      plateClassName: "bg-[var(--secondary)] border-[var(--ink)] text-[var(--on-secondary)]",
      ghosts: GOOD_GHOSTS,
    };
  }
  if (averageScore >= MID_THRESHOLD) {
    return { plateClassName: "bg-[var(--primary)] border-[var(--ink)] text-[var(--surface)]", ghosts: MID_GHOSTS };
  }
  // BAD: grey border + grey number specifically (not the shared --ink every
  // other tier uses) — reads as deliberately muted/flat, not just "no
  // ghosts". --disabled-text is this app's closest existing neutral-grey
  // role (already used for disabled controls elsewhere).
  return {
    plateClassName: "bg-[var(--slot-empty)] border-[var(--disabled-text)] text-[var(--disabled-text)]",
    ghosts: [],
  };
}

export function RatingBadge({ averageScore }: RatingBadgeProps) {
  const tier = tierFor(averageScore);
  const label = averageScore === null ? "—" : (averageScore / 10).toFixed(1);

  return (
    // w-fit/h-fit: sizes to exactly the plate's own box (the one in-flow
    // child — ghosts are absolute, so they don't contribute to this sizing)
    // so the ghosts' own inset-0 + translate offsets below are relative to
    // the plate's real rendered size, not a guessed fixed box.
    <div className="relative w-fit h-fit" aria-hidden="true">
      {/* Ghosts render before the plate in DOM order, and neither they nor
          the plate set an explicit z-index — both are "positioned"
          elements (absolute/relative) with z-index:auto, so plain DOM
          order decides paint order here (later paints on top), the same
          rule now documented in DESIGN_SYSTEM.md's Z-index scale section.
          That's what keeps the plate opaque and on top nearest the
          origin, with only each ghost's translated, non-overlapping
          sliver visible beyond its bottom-right edge. */}
      {tier.ghosts.map((ghost) => (
        <div
          key={`${ghost.x}-${ghost.y}`}
          className="absolute inset-0 pointer-events-none"
          style={{
            transform: `translate(${ghost.x}px, ${ghost.y}px)`,
            border: `${GHOST_BORDER_WIDTH_PX}px solid ${GHOST_STROKE_COLOR}`,
            opacity: ghost.opacity,
          }}
        />
      ))}
      <div
        className={[
          "relative font-display font-black text-[length:var(--text-sm)] tracking-[var(--tracking-lg)] border-[length:var(--border-base)] px-[var(--space-md)] py-[var(--space-xs)] shadow-[var(--elev-1)]",
          tier.plateClassName,
        ].join(" ")}
      >
        {label}
      </div>
    </div>
  );
}

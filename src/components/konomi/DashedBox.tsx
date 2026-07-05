import type { ComponentPropsWithoutRef } from "react";

interface DashedBoxProps extends ComponentPropsWithoutRef<"div"> {
  strokeWidth?: number;
  dashArray?: string;
  color?: string;
}

// A dashed rectangular outline drawn with an SVG <rect> (stroke-dasharray),
// not CSS `border-dashed` — real iOS WebKit drops border-dashed's left/right
// edge segments (confirmed live: only empty, dashed-border MixerBar tag
// slots clipped; solid-border filled slots, otherwise pixel-identical,
// rendered fine — not reproducible in desktop Chrome emulation). A known
// engine-specific border-renderer bug with no CSS-only fix, so this
// sidesteps that renderer entirely rather than working around it.
//
// The caller is expected to keep its own border reserved via a real (but
// transparent) `border-[length:Npx] border-solid border-transparent` —
// `border-style: none` collapses the reserved border-box space entirely,
// so this only replaces the border's *visible paint*, not its footprint.
// That's what keeps an empty (dashed) and filled (solid) slot pixel-
// identical in size, with no layout shift the instant one fills.
//
// width="100%"/height="100%", no viewBox: 1 SVG user unit is already
// exactly 1 rendered CSS pixel this way, so there's no viewBox-to-viewport
// scale transform that could distort stroke-width/dash rhythm at different
// box sizes — no ResizeObserver, no ref, no re-render needed on resize;
// the box scales in plain CSS same as anything else, and this SVG scales
// identically alongside it for free. `vector-effect="non-scaling-stroke"`
// is extra insurance for that same guarantee (not strictly load-bearing
// without a scaling viewBox here), kept since it costs nothing.
//
// The <rect> straddles its own 100%×100% path (half the stroke paints
// outward, half inward) rather than being inset by half the stroke width —
// `overflow="visible"` on the <svg> lets that outward half paint into the
// caller's own transparent-border ring instead of getting clipped at the
// SVG's default viewport edge, landing flush against the box's outer edge
// (matching where the old CSS border sat) with no inset math, and without
// introducing `calc()` into an SVG geometry attribute — itself a
// cross-browser support risk this component exists specifically to avoid
// adding more of.
export function DashedBox({
  strokeWidth = 2.5,
  dashArray = "6 4",
  color = "var(--ink)",
  className,
  children,
  ...rest
}: DashedBoxProps) {
  return (
    <div className={`relative ${className ?? ""}`} {...rest}>
      <svg
        className="absolute inset-0 pointer-events-none"
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        overflow="visible"
      >
        <rect
          width="100%"
          height="100%"
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={dashArray}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {children}
    </div>
  );
}

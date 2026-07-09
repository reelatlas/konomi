// A tag-shaped badge (rounded rectangle body + gently rounded point, echoing
// this app's own Tabler tag icon) with a small transparent hole punched near
// the tip. Replaces ResultCard's earlier plain-rectangle score badge.
//
// The body and point are ONE continuous SVG path, not two separate elements
// glued together at a seam. That's the load-bearing decision this whole
// component rests on: two independently-rasterized elements (a CSS-bordered
// div for the body, a separate shape for the point) can never be guaranteed
// to blend with zero sub-pixel seam artifacts, no matter how precisely their
// geometry is matched — they're two separate paint operations. A single
// path has no seam to blend, by construction.
//
// Because the shape has to keep growing to fit arbitrary label text (a
// score fraction like "2/3", or the word "PERFECT"), the path is rebuilt on
// every render from a measured text width rather than baked as a fixed SVG
// string.

import { useId, useLayoutEffect, useRef, useState } from "react";

// Body's own left-corner radius. Both this and POINT_RADIUS are plain
// circular-arc radii, drawn with real SVG arc commands (not bezier
// approximations) so the geometry below can reason about them exactly.
const CORNER_RADIUS = 7;

// Radius for both the point's seam-transition corners (where the body's
// flat top/bottom edges bend into the point) and the tip itself. Kept
// equal for a uniform rounding treatment through the whole point; split
// into two separate values if the tip and the transition ever need
// different softness.
//
// The point's silhouette is the right half of a rotated square (its own
// four corners map to the point's top/tip/bottom/hidden-left vertices under
// a 45deg rotation) — which is also why its diagonal edges sit at exactly
// 45deg, matching this app's own tag icon. Rounding a 90deg corner with
// radius r pulls the outline back from the sharp corner by r*(√2−1) along
// that corner's own bisector (a plain consequence of a circle inscribed
// r away from each of the two edges meeting there). Left uncorrected, that
// recession would leave the point's rounded top/bottom corners short of the
// body's own full HEIGHT — the point would visibly fail to reach as tall as
// the body. buildTagPath (below) compensates by inflating the point's own
// sharp-corner half-diagonal by exactly that recession amount, so the
// ROUNDED corner's own outer edge — not the sharp corner underneath it —
// lands exactly on y=0/y=HEIGHT.
//
// That fix has a second, unplanned benefit: at the exact point the rounded
// corner meets y=0 (or HEIGHT), its tangent direction is provably
// horizontal (the corner's own bisector, rotated into the final frame,
// works out to vertical, and a rounding arc's tangent at its bisector point
// is perpendicular to that bisector — i.e. horizontal). That's what makes
// the point flow into the body's own flat edge with no directional kink,
// not just a touching point.
const POINT_RADIUS = 6;

// Horizontal padding around the label. Hardcoded as a number (not a
// Tailwind class) because it has to feed into path-width math, not just
// apply a CSS class. Deliberately a bit tighter than --space-md (8px,
// TagChip and this app's other bordered chips' own token) — matching that
// token exactly measured out visually looser than felt right once compared
// directly against RatingBadge.
const BODY_PADDING = 6;

// Vertical counterpart to BODY_PADDING, matching --space-xs. HEIGHT is
// derived from this plus the label's own measured line-height (see
// TagCountBadge's own textHeight), not a flat constant — that measurement-
// driven construction is what let this land exactly on RatingBadge's own
// real rendered height (30px total: 18px line-height + 4+4px padding +
// 2+2px border) once actually compared side by side, instead of an
// earlier, ungrounded flat HEIGHT=36 guess.
const VERTICAL_PADDING = 4;

// The hole's radius, as a fraction of HEIGHT rather than a fixed pixel
// value — 3.5/36, the original validated proportion (sized so a meaningful
// transparent center still shows through even under this component's
// thickest stroke; see holeRingWidth below — a smaller radius reads as
// solid ink rather than a visible hole, since the ring stroke is centered
// on the hole's own boundary and eats into it from both sides).
//
// A fixed absolute radius went visibly stale here once: HEIGHT is
// measurement-driven (see TagCountBadge's own HEIGHT comment), so it can
// legitimately change for reasons that have nothing to do with the hole at
// all — the tighter line-height fix below shrank HEIGHT from 30 to 24, and
// a hole radius that had stayed fixed at 3.5 immediately read as too big
// for the new, shorter badge. Deriving it as a ratio of whatever HEIGHT
// actually is keeps it right-sized automatically instead of needing a
// re-tuned magic number every time HEIGHT moves for an unrelated reason.
const HOLE_RADIUS_RATIO = 3.5 / 36;

// Nudges the hole left from dead-center on the body box's own right edge —
// confirmed (via getBBox, exact SVG-space geometry) that dead-center itself
// measures out perfectly true, so this isn't correcting an alignment bug;
// it's a deliberate default offset. Negative moves left.
const HOLE_NUDGE_X = -1;

// Deliberately NOT the same width as the main outline's own border — a
// hole ring drawn at the full border width reads as heavy/graphic; half
// that reads as a lighter, secondary detail. This is why the hole can't be
// baked into the main outline path as a second (evenodd) subpath the way a
// simpler version of this component once did: one <path> element only has
// one stroke-width, and there's no way to vary it per subpath. Instead the
// hole is cut via an SVG <mask> (a true cutout to whatever's behind the
// badge, not just a same-color circle painted over the top — which matters
// for the "bordered + shadow" look below, where the shadow should be able
// to show through the hole like it would through a real physical cutout),
// and its ring is a separate <circle> drawn with its own, independent
// stroke-width.
function holeRingWidth(borderWidth: number) {
  return borderWidth / 2;
}

// Where "the body" ends, for centering the label — defined as the
// x-coordinate at which the shape's own height has narrowed to
// `heightFraction` of the full HEIGHT, not the x where the perfectly
// straight edge stops (bodyW itself). Centering directly against bodyW
// measures out technically correct but visually wrong: the curve just past
// it is gentle, and a real span of it still reads as "body," not "point."
// Defining the boundary as a fraction of height (rather than a fixed pixel
// offset past bodyW) keeps it correct if POINT_RADIUS or HEIGHT ever
// change, instead of needing a re-tuned magic number.
const BODY_HEIGHT_FRACTION = 0.85;

// Builds the closed body+point outline as one SVG path, using true circular
// arcs for every rounded corner. bodyW is the x-coordinate where the flat
// top/bottom edges end and the point begins; h is the shape's total
// height. Both are expected in the "stroke-free" coordinate space described
// in TagCountBadge itself (see its own hEff comment) — this function has no
// opinion about stroke width at all.
function buildTagPath(bodyW: number, h: number, cornerRadius: number, pointRadius: number) {
  const cy = h / 2;
  const recession = pointRadius * (Math.SQRT2 - 1);
  const rDiag = cy + recession; // sharp (pre-rounding) half-diagonal, inflated
  // to compensate for that recession — see POINT_RADIUS's own comment.

  // Top transition corner: tangent to the flat top edge at (bodyW, 0), so
  // its arc center sits directly below that point by exactly pointRadius.
  const topArcStart = { x: bodyW, y: 0 };
  const sharpTop = { x: bodyW, y: cy - rDiag };
  const topArcEnd = {
    x: sharpTop.x + pointRadius * Math.SQRT1_2,
    y: sharpTop.y + pointRadius * Math.SQRT1_2,
  };

  // Tip: the two 45deg diagonals meeting here form their own 90deg corner
  // (mirrored around the horizontal bisector instead of the vertical one
  // the top/bottom corners use), so the same recession formula applies.
  const sharpTip = { x: bodyW + rDiag, y: cy };
  const tipArcStart = { x: sharpTip.x - pointRadius * Math.SQRT1_2, y: sharpTip.y - pointRadius * Math.SQRT1_2 };
  const tipArcEnd = { x: sharpTip.x - pointRadius * Math.SQRT1_2, y: sharpTip.y + pointRadius * Math.SQRT1_2 };

  // Bottom transition corner: exact mirror of the top one around cy.
  const bottomArcStart = { x: topArcEnd.x, y: h - topArcEnd.y };
  const bottomArcEnd = { x: bodyW, y: h };

  return [
    `M ${cornerRadius} 0`,
    `L ${topArcStart.x} ${topArcStart.y}`,
    `A ${pointRadius} ${pointRadius} 0 0 1 ${topArcEnd.x} ${topArcEnd.y}`,
    `L ${tipArcStart.x} ${tipArcStart.y}`,
    `A ${pointRadius} ${pointRadius} 0 0 1 ${tipArcEnd.x} ${tipArcEnd.y}`,
    `L ${bottomArcStart.x} ${bottomArcStart.y}`,
    `A ${pointRadius} ${pointRadius} 0 0 1 ${bottomArcEnd.x} ${bottomArcEnd.y}`,
    `L ${cornerRadius} ${h}`,
    `A ${cornerRadius} ${cornerRadius} 0 0 1 0 ${h - cornerRadius}`,
    `L 0 ${cornerRadius}`,
    `A ${cornerRadius} ${cornerRadius} 0 0 1 ${cornerRadius} 0`,
    "Z",
  ].join(" ");
}

// See BODY_HEIGHT_FRACTION's own comment for what this is calibrating.
// Walks the same two geometric regions buildTagPath's top edge passes
// through (the rounded transition corner, then the straight 45deg
// diagonal) and solves each for the x where the target height is reached.
function bodyRightEdge(bodyW: number, h: number, pointRadius: number, heightFraction: number) {
  const cy = h / 2;
  const recession = pointRadius * (Math.SQRT2 - 1);
  const rDiag = cy + recession;
  const sharpTopY = cy - rDiag;
  const topArcEndX = bodyW + pointRadius * Math.SQRT1_2;
  const topArcEndY = sharpTopY + pointRadius * Math.SQRT1_2;

  const targetTopY = (h * (1 - heightFraction)) / 2;

  if (targetTopY <= topArcEndY) {
    // Still within the rounded transition corner — a circle centered at
    // (bodyW, pointRadius), radius pointRadius: solve
    // y = pointRadius - sqrt(pointRadius^2 - (x-bodyW)^2) for x.
    const dy = pointRadius - targetTopY;
    const dx = Math.sqrt(Math.max(pointRadius * pointRadius - dy * dy, 0));
    return bodyW + dx;
  }
  // Past the transition corner, on the straight 45deg diagonal (slope 1).
  return topArcEndX + (targetTopY - topArcEndY);
}

interface TagCountBadgeProps {
  label: string;
  // Full-match state: --secondary/on-secondary fill instead of the default
  // --surface/ink. Named after the domain concept (a "perfect" mix result)
  // rather than a generic "variant" prop, matching how ResultCard already
  // thinks about this state elsewhere.
  perfect?: boolean;
  // Independent toggles, not a fixed set of named presets — any combination
  // is valid. Defaults match this component's own intended default look
  // (bordered + shadowed, regular weight), so a bare <TagCountBadge /> with
  // only label/perfect set reads the same as the very first version of
  // this component did.
  bordered?: boolean;
  shadow?: boolean;
  bold?: boolean;
  // Rotation in degrees, applied to the whole badge (shape, border, hole,
  // shadow, and label together) as one rigid unit. Defaults to 0 — this
  // component's own neutral default, not tied to any one caller's own
  // placement needs. ResultCard's own usage passes -5 (a touch more than
  // its previous plain-rectangle badge's own "-rotate-[4deg]", tuned once
  // placed alongside this badge's own new shape).
  tiltDeg?: number;
}

export function TagCountBadge({ label, perfect = false, bordered = true, shadow = true, bold = false, tiltDeg = 0 }: TagCountBadgeProps) {
  const borderWidth = bordered ? 2 : 0; // matches --border-thin
  const ringWidth = holeRingWidth(borderWidth);
  const fill = perfect ? "var(--secondary)" : "var(--surface)";
  const textColorClass = perfect ? "text-[var(--on-secondary)]" : "text-[var(--ink)]";

  // The hole-mask's own rect (below) has to extend past the visible canvas
  // by at least borderWidth/2 in every direction — that's exactly how far
  // the path's stroke bleeds outward from its own local coordinates
  // (including to negative x/y at the shape's top-left corner), and a mask
  // only shows what falls inside its own rect. Deriving this from
  // borderWidth directly, rather than a fixed guess, keeps it correct if
  // borderWidth is ever changed here.
  const maskPad = borderWidth / 2 + 4;

  // Measures the label's own rendered width AND height (real text, real
  // font/weight) so the badge genuinely sizes to content on both axes, the
  // same requirement ordinary HTML flex layout satisfies for free — SVG
  // has no equivalent auto-sizing, so this measures a real DOM text node
  // and feeds both dimensions back into the geometry below. Stores
  // textWidth/textHeight themselves (not the padded body/badge size)
  // since the centering calc further down needs the raw text width too.
  // Fallback defaults (32/18) are just there to avoid an ugly flash of a
  // wrong size before the very first layout effect runs — 18 specifically
  // matches text-sm's own real line-height, measured live.
  const textRef = useRef<HTMLSpanElement>(null);
  const [textWidth, setTextWidth] = useState(32);
  const [textHeight, setTextHeight] = useState(18);
  useLayoutEffect(() => {
    if (textRef.current) {
      setTextWidth(textRef.current.offsetWidth);
      setTextHeight(textRef.current.offsetHeight);
    }
  }, [label, bold]);
  const bodyW = textWidth + BODY_PADDING * 2;

  // HEIGHT is the label's own measured line-height plus vertical padding
  // plus the border on both top and bottom — not a flat guessed constant
  // (see VERTICAL_PADDING's own comment for why that changed). This is the
  // exact same "measure content, add padding/border" construction
  // RatingBadge's own plain CSS box gets for free; SVG just has to do it
  // by hand.
  const HEIGHT = textHeight + VERTICAL_PADDING * 2 + borderWidth * 2;
  const holeRadius = HEIGHT * HOLE_RADIUS_RATIO;

  // The path is built at hEff = HEIGHT - borderWidth, then translated by
  // borderWidth/2 (below) — this is what makes an SVG stroke (which by
  // default centers on the path, half inside/half outside) behave like an
  // inset CSS border instead, so the OUTER edge of the stroke lands exactly
  // on HEIGHT/0 regardless of borderWidth, the same border-box convention
  // CSS gives every plain bordered <div> in this app for free.
  const hEff = HEIGHT - borderWidth;
  const bodyWEff = Math.max(bodyW - borderWidth, 0);

  // Body box for centering the label: [borderWidth, borderWidth +
  // bodyBoxWidth] in the final/outer frame, NOT [0, ...]. The stroke is
  // centered on the path, so it straddles the true fill edge — half of it
  // sits outside at x=0 (the stroke's OUTER edge, where half the border's
  // own ink is drawn), half sits inside up to x=borderWidth (where the
  // fill color is actually fully exposed). bodyBoxWidth itself is computed
  // in the stroke-free (hEff/bodyWEff) frame, so anchoring it at
  // borderWidth (the stroke's inner edge) — not borderWidth/2, the path's
  // own still-straddled position — is what correctly starts the box
  // "immediately inside the stroke."
  const bodyBoxWidth = bodyRightEdge(bodyWEff, hEff, POINT_RADIUS, BODY_HEIGHT_FRACTION);
  const bodyBoxLeft = borderWidth;
  const textLeft = bodyBoxLeft + (bodyBoxWidth - textWidth) / 2;

  const path = buildTagPath(bodyWEff, hEff, CORNER_RADIUS, POINT_RADIUS);
  // Deliberately generous, not pixel-exact — this only pads the SVG's own
  // viewBox/wrapper width; erring larger just adds a hair of transparent
  // margin, while erring smaller would clip the tip outright.
  const totalW = bodyW + hEff / 2 + POINT_RADIUS * 2 + borderWidth * 2;

  // Hole position: centered on the body box's own right edge, vertically
  // on the badge's true center. Derived FROM bodyBoxLeft/bodyBoxWidth
  // directly (the same values that define the body box above), not
  // recomputed independently — computing it separately is exactly what let
  // an earlier version of this drift a pixel off from the body box's own
  // edge.
  const holeMaskId = useId();
  const holeXFinal = bodyBoxLeft + bodyBoxWidth + HOLE_NUDGE_X; // outer/final frame
  const holeYFinal = HEIGHT / 2;
  const holeXEff = holeXFinal - borderWidth / 2; // back to the pre-translate
  const holeYEff = holeYFinal - borderWidth / 2; // frame the masked <g> uses

  return (
    <div className="relative inline-block" style={{ height: HEIGHT, width: totalW, transform: `rotate(${tiltDeg}deg)` }}>
      <svg
        width={totalW}
        height={HEIGHT}
        viewBox={`0 0 ${totalW} ${HEIGHT}`}
        className="absolute inset-0 block"
        // 1px offset, not --elev-1's own 2px — at 2px the shadow (a same-
        // shaped, offset copy of this badge's own silhouette, hole
        // included) fully covers the now-small holeRadius: background only
        // shows through where the true hole and the shadow's own shifted
        // hole overlap, and 2px isn't small relative to holeRadius the way
        // it is against a bigger hole.
        style={shadow ? { filter: "drop-shadow(1px 1px 0 var(--ink))" } : undefined}
      >
        <defs>
          {/* Padded well past [0,totalW]x[0,HEIGHT] on every side, not sized
              to exactly match the visible canvas — see maskPad's own
              comment for why. */}
          <mask id={holeMaskId} maskUnits="userSpaceOnUse" x={-maskPad} y={-maskPad} width={totalW + maskPad * 2} height={HEIGHT + maskPad * 2}>
            <rect x={-maskPad} y={-maskPad} width={totalW + maskPad * 2} height={HEIGHT + maskPad * 2} fill="white" />
            <circle cx={holeXEff} cy={holeYEff} r={holeRadius} fill="black" />
          </mask>
        </defs>
        <g transform={`translate(${borderWidth / 2}, ${borderWidth / 2})`} mask={`url(#${holeMaskId})`}>
          <path d={path} fill={fill} stroke={borderWidth > 0 ? "var(--ink)" : "none"} strokeWidth={borderWidth} />
        </g>
        {borderWidth > 0 && (
          <circle cx={holeXFinal} cy={holeYFinal} r={holeRadius} fill="none" stroke="var(--ink)" strokeWidth={ringWidth} />
        )}
      </svg>
      {/* leading-none: the top:50%/translateY(-50%) pair below centers this
          span's own CSS line-height box exactly on HEIGHT/2 (confirmed via
          the resolved transform matrix, not just assumed) — but a font's
          default line-height reserves descender space (for g/y/p/q/j) that
          digit labels like "1/3" never use, so the reserved space above and
          below the actual glyphs isn't symmetric even though the BOX is
          centered. That reads as the glyphs themselves sitting above true
          center (confirmed live, zoomed in). Tightening the line-height
          shrinks that mismatched reserve so the glyphs' own visual center
          lands much closer to the box's center. */}
      <span
        ref={textRef}
        className={[
          "absolute whitespace-nowrap font-display leading-none",
          textColorClass,
          bold ? "font-black" : "",
          "text-[length:var(--text-sm)] tracking-[var(--tracking-lg)]",
        ].join(" ")}
        style={{ left: textLeft, top: "50%", transform: "translateY(-50%)" }}
      >
        {label}
      </span>
    </div>
  );
}

import type { CSSProperties } from "react";
import type { WordmarkWord } from "@/lib/konomi/wordmarkPaths";

// One word of the masthead wordmark as an SVG letter-path lockup, wired for
// the hover outline-draw (trace & fill). GRADUATED from the sandbox — tag:
// sandbox:wordmark-outline-draw/C-v5 (SANDBOX_GRADUATIONS.md; batch
// notes.md while it exists).
//
// Rendering model: per letter, THREE stacked paths — the solid fill, the
// echo stroke (offset ghost, the RatingBadge echo language), and the main
// stroke — all sharing the letter's compound path data. pathLength="1"
// normalizes every letter's stroke to one unit, so the CSS dash draw
// (globals.css .wm-* rules) needs no per-letter measurements. Each
// letter's group carries --i, its index in the ACROSS-BOTH-WORDS stagger
// chain (latin 0-5, JP 6-9 — the caller passes the offset), which the CSS
// multiplies into animation-delay.
//
// The animation itself is deliberately pure CSS (ladder rungs 1-2 — the
// Codex was consulted; Motion's pathLength pattern buys nothing for a
// hover one-shot). This component only lays out geometry.

interface WordmarkDrawProps {
  word: WordmarkWord;
  // First letter's index in the shared stagger chain.
  indexOffset: number;
  // The morphing height (the masthead's font-size calc × glyphExtentRatio)
  // plus any other inline geometry the call site owns.
  style?: CSSProperties;
  className?: string;
}

export function WordmarkDraw({ word, indexOffset, style, className }: WordmarkDrawProps) {
  return (
    <svg
      className={className}
      viewBox={word.viewBox}
      role="img"
      aria-label={word.word}
      // width:auto follows from the viewBox aspect once height is set;
      // overflow visible lets the echo offset and glow bleed past the
      // tight glyph box instead of clipping.
      style={{ width: "auto", overflow: "visible", display: "block", ...style }}
    >
      {word.letters.map((l, i) => (
        <g key={i} className="wm-ltr" style={{ "--i": indexOffset + i } as CSSProperties}>
          <path className="wm-fill" d={l.d} />
          <path className="wm-stroke wm-echo" pathLength={1} d={l.d} />
          <path className="wm-stroke wm-main" pathLength={1} d={l.d} />
        </g>
      ))}
    </svg>
  );
}

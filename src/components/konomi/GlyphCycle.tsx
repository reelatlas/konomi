import { useEffect, useState } from "react";

// Hold-hover glyph flipbook: while `active`, steps through `glyphs` on an
// interval and loops; when inactive it rests on (and resets to) the first
// glyph. Shared by the ThemeSwitcher subtext and the film LevelSelector
// hints — one mechanism, per-surface glyph sets.
//
// Deliberately NOT Motion (decision surfaced + Codex consulted per
// CLAUDE.md): this is a discrete content swap at an interval — no
// interpolable value exists between two unrelated glyphs, so there is
// nothing for a spring/tween to do; Motion's nearest offering (motion-plus
// Typewriter) animates typing, not frame-flipping. A plain interval is the
// cheapest tool that fits, matching the ladder's "discrete state" rung.
// The 150ms opacity fade on the hint containers stays CSS, unchanged.
//
// prefers-reduced-motion: the cycle simply never starts — the first glyph
// shows statically, which is exactly the pre-animation behavior.
const GLYPH_CYCLE_INTERVAL_MS = 350;

// The glyph's reserved box, in em (so it scales with the hint's own font
// size). Sized for the widest frames in use (emoji ≈ 1.4-1.6em); every
// frame centers inside it, so a narrow frame (░) simply gets breathing
// room instead of moving its neighbors.
const GLYPH_BOX_EM = 1.6;

interface GlyphCycleProps {
  glyphs: string[];
  active: boolean;
}

export function GlyphCycle({ glyphs, active }: GlyphCycleProps) {
  const [index, setIndex] = useState(0);

  // Reset-to-frame-one on deactivation happens in the RENDER phase,
  // converging in a single pass (the same react-hooks/set-state-in-effect-
  // satisfying pattern TagPoolBody/MixerBar already use) — after the set,
  // the condition is false on the immediate re-render, so it can't loop.
  if (!active && index !== 0) setIndex(0);

  useEffect(() => {
    if (!active || glyphs.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % glyphs.length), GLYPH_CYCLE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [active, glyphs]);

  // aria-hidden: purely decorative — the hint text beside it carries the
  // meaning, and a screen reader announcing each frame would be noise.
  // Modulo guards a stale index across a glyphs-array swap mid-flight.
  //
  // Fixed-width inline-flex box, glyph centered: frames vary in advance
  // width (emoji vs hieroglyph vs ░), and without the reservation each
  // flip re-flowed its neighbors — worst in the collapsed masthead's
  // RIGHT-anchored theme subtext, where the whole line slid sideways
  // (requested: "the glyph stays centered within the space").
  return (
    <span aria-hidden="true" className="inline-flex justify-center" style={{ width: `${GLYPH_BOX_EM}em` }}>
      {active ? (glyphs[index % glyphs.length] ?? "") : (glyphs[0] ?? "")}
    </span>
  );
}

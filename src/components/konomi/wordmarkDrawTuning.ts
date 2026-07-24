// Tuning for the masthead wordmark outline-draw hover (trace & fill).
//
// GRADUATED from the sandbox — tag: sandbox:wordmark-outline-draw/C-v5.
// Every value here is the USER-LOCKED default from that batch's round-5
// review (2026-07-24), tuned live in the sandbox debug panel — see
// SANDBOX_GRADUATIONS.md and the batch notes.md. Named constants per
// AGENTS.md (no inline timing literals); the component exports them into
// CSS custom properties that globals.css's .wm-* rules consume, so CSS
// stays the animation engine while TS remains the single source of truth.

// One letter's full drain -> draw -> flood cycle. The whole-word length is
// DRAW_MS * CYCLE_SCALE + 9 * STAGGER_MS (10 letters, indices 0-9 across
// both scripts — ミックス continues KONOMI's stagger chain).
export const WORDMARK_DRAW_MS = 3300;
export const WORDMARK_STAGGER_MS = 220;
// Keyframe cycle length as a multiple of DRAW_MS (drain/draw/flood phases
// live inside one animation — see globals.css keyframes).
export const WORDMARK_CYCLE_SCALE = 1.7;
// Stroke width in viewBox units (100 units/em). The JP word renders ~1/2.7
// the latin's height, so its stroke scales up to hold equal VISUAL weight.
export const WORDMARK_STROKE_W = 2;
export const WORDMARK_JP_STROKE_SCALE = 2.6;
// The trailing offset ghost outline — deliberately the RatingBadge
// ghost-echo brand language. Draws ECHO_DELAY_MS behind the main stroke.
export const WORDMARK_ECHO_OFFSET_PX = 7;
export const WORDMARK_ECHO_DELAY_MS = 90;
export const WORDMARK_ECHO_OPACITY = 0.32;
// Soft bloom on the strokes while they draw. Kept deliberately faint
// (user-locked at 1px). WATCH ITEM: this is a filter on animating paths —
// verify on-device WebKit before trusting it (house lore re: filters).
export const WORDMARK_GLOW_PX = 1;

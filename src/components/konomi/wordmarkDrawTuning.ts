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

// Release behavior: letting go of the hover REVERSES the animation from
// wherever it is (Web Animations API updatePlaybackRate on the same CSS
// animations — see Masthead's handlers) at this multiple of forward
// speed (a mid-flight release rewinds in elapsed/1.8; was 2, softened to
// 1.8 by user feel). A FULLY-completed forward run does NOT reverse at
// all — Masthead's leave handler drops the class instead (the cycle's end
// state is visually identical to rest, so the cutoff is invisible).
export const WORDMARK_REVERSE_SPEED = 1.8;

// What a mid-flight release does — a SETTLED two-variant switch (user
// ruling 2026-07-24 after A/B-ing both live: "reverse" is the main;
// "finish" is the kept alternate — flip this ONE WORD to swap):
//   "reverse" — the drawn animation rewinds to rest at
//               WORDMARK_REVERSE_SPEED (release feels like letting go)
//   "finish"  — the remainder plays out FORWARD at WORDMARK_FINISH_SPEED,
//               then rests (hover = controlled pace, release = the rest
//               of the performance double-times to the payoff)
// Both run through the same handlers (Masthead's releaseMidFlight); a
// COMPLETED forward run never reverses in either mode (playState cutoff —
// the cycle's end state is visually identical to rest).
export const WORDMARK_RELEASE_MODE: "reverse" | "finish" = "reverse";
export const WORDMARK_FINISH_SPEED = 3;

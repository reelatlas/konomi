/**
 * Theme-switch transition tuning — the app's cross-fade + result-card spring-pop
 * that plays when the active theme changes.
 *
 * PROVENANCE — graduated 2026-07-16 from the sandbox.
 *   • Origin:  _sandbox/animation/2026-07-15-theme-transition — concept "A v5"
 *              (Tier-2 playground: ?concept=a-theme-crossfade&v=v5).
 *   • Tuned:   the values below were dialed in live in the playground and copied
 *              out as-is; see that batch's notes.md for the full exploration and
 *              why A v5 (color cross-fade + Motion spring-pop) was the pick.
 *   • Tag:     sandbox:theme-transition/A-v5   ← grep to find code ↔ register ↔ sandbox.
 *   • Register: SANDBOX_GRADUATIONS.md (repo root).
 *   • Scope:   whole-app UNIFORM colour cross-fade (dur/ease) + spring-pop on the
 *              result cards (stagger/dir + spring). The sandbox's radial-stagger of
 *              *every* element doesn't scale app-wide, so the fade is uniform and the
 *              pop is scoped to the (bounded) cards — see notes.md graduation note.
 *   • Drift:   graduated != frozen — tuned in the real app post-graduation.
 *              2026-07-16 on-device WebKit: (1) dropped box-shadow and (2) went
 *              linear, but the tail-stall persisted because the cost was
 *              per-element paint (transitioning colour on every node). So (3) the
 *              MECHANISM changed to the View Transitions API — A v5's uniform
 *              cross-fade LOOK, re-implemented as a single GPU-composited page
 *              dissolve (that is Concept B's tool). durMs/ease still feed it.
 *              Logged in SANDBOX_GRADUATIONS.md; the sandbox A v5 snapshot is
 *              unchanged and can be reopened to explore further.
 */
export const THEME_TRANSITION = {
  // colour cross-fade (CSS, whole-app, uniform)
  durMs: 320,
  // linear (drifted from the sandbox's cubic-bezier(.4,0,.2,1)). Now the timing
  // function of the ::view-transition-old/new(root) cross-fade. Uniform rate: a
  // cross-fade has no momentum to decelerate into, and an ease's flat tail made
  // mobile WebKit step in the last frames back when this was a per-element CSS
  // transition. See the PROVENANCE "Drift" note.
  ease: "linear",
  // spring-pop (Motion, result cards, radial from the theme switcher)
  pop: true,
  staggerMs: 30,
  dir: "radial",
  stiffness: 30,
  damping: 2,
  mass: 0.3,
  liftPx: 2,
} as const;

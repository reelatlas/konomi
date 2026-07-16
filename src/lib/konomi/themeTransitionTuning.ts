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
 */
export const THEME_TRANSITION = {
  // colour cross-fade (CSS, whole-app, uniform)
  durMs: 320,
  ease: "cubic-bezier(.4,0,.2,1)",
  // spring-pop (Motion, result cards, radial from the theme switcher)
  pop: true,
  staggerMs: 30,
  dir: "radial",
  stiffness: 30,
  damping: 2,
  mass: 0.3,
  liftPx: 2,
} as const;

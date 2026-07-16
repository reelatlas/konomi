/**
 * Theme-switch transition tuning — the app's whole-page colour cross-fade that
 * plays when the active theme changes. (A v5's result-card spring-pop, its other
 * half, was explored and REVERTED — see the "Outcome" bullet below.)
 *
 * PROVENANCE — graduated 2026-07-16 from the sandbox.
 *   • Origin:  _sandbox/animation/2026-07-15-theme-transition — concept "A v5"
 *              (Tier-2 playground: ?concept=a-theme-crossfade&v=v5).
 *   • Tuned:   the values below were dialed in live in the playground and copied
 *              out as-is; see that batch's notes.md for the full exploration and
 *              why A v5 (color cross-fade + Motion spring-pop) was the pick.
 *   • Tag:     sandbox:theme-transition/A-v5   ← grep to find code ↔ register ↔ sandbox.
 *   • Register: SANDBOX_GRADUATIONS.md (repo root).
 *   • Scope:   whole-app UNIFORM colour cross-fade (dur/ease). The sandbox's
 *              radial-stagger of *every* element doesn't scale app-wide, so the
 *              shipped fade is uniform. (The card pop was cut — see Outcome.)
 *   • Drift:   graduated != frozen — tuned in the real app post-graduation.
 *              2026-07-16 on-device WebKit: (1) dropped box-shadow and (2) went
 *              linear, but the tail-stall persisted because the cost was
 *              per-element paint (transitioning colour on every node). So (3) the
 *              MECHANISM changed to the View Transitions API — A v5's uniform
 *              cross-fade LOOK, re-implemented as a single GPU-composited page
 *              dissolve (that is Concept B's tool). durMs/ease still feed it.
 *              Logged in SANDBOX_GRADUATIONS.md; the sandbox A v5 snapshot is
 *              unchanged and can be reopened to explore further.
 *   • Outcome: SHIPPED (changed) — the cross-fade (View Transitions dissolve +
 *              a freeze of looping animations during it). A v5's card spring-pop
 *              was built in 3 variants (subtle / full bounce / radial ripple),
 *              tested on-device, and REVERTED: animating the cards on a frequent
 *              action read as unwanted motion, not delight. See DESIGN_SYSTEM.md
 *              + SANDBOX_GRADUATIONS.md (REVERTED entry).
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
  // Card pop (A v5's second half) — EXPLORED then REVERTED, so intentionally
  // absent from the shipped constant. Three on-device variants (subtle ease-out
  // settle · full bounce-0.67 spring · radial ripple from the switcher) were all
  // dropped: animating the result cards on a frequent action (theme switch) read
  // as unwanted motion, not delight. See the PROVENANCE "Outcome" above.
} as const;

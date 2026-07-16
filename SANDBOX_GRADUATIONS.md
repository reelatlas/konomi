# Sandbox → code graduations

Committed register of ideas that graduated from `_sandbox/` (exploratory, gitignored)
into real `src/` code. **Newest first.** Each row carries a **provenance tag** — grep it
to find the code site, this row, and (while it still exists) the sandbox batch's
`notes.md`. See the graduation-provenance protocol in
`.claude/skills/_shared/sandbox-framework.md`.

| Date | Provenance tag | From (sandbox batch) | Concept | To (code) | What / why |
| ---- | -------------- | -------------------- | ------- | --------- | ---------- |
| 2026-07-16 | `sandbox:theme-transition/A-v5` | `_sandbox/animation/2026-07-15-theme-transition` | A v5 | `src/lib/konomi/themeTransitionTuning.ts` + theme-switch effect (KonomiApp) + `globals.css` | **Outcome: SHIPPED (changed).** Theme-switch **cross-fade** (uniform, whole-app), re-mechanised as a View Transitions dissolve + a freeze of looping animations during it. A v5's **card spring-pop** was explored in 3 variants and **REVERTED** — see drift log. |

## Drift log

Graduated ≠ frozen — code values get tuned in the real app after graduation, and the
sandbox concept stays reopenable. Post-graduation changes:

- **2026-07-16 · `sandbox:theme-transition/A-v5` · REVERTED (card pop)** — A v5's second half
  (a spring pop on the result cards after the dissolve) was built in 3 variants and tested
  on-device off `test/theme-pop-{subtle,full,radial}`: subtle ease-out settle · full
  bounce-0.67 spring · radial ripple staggered from the switcher. **All reverted** — animating
  the cards on a frequent, non-primary action read as unwanted motion in every variant, not
  delight. Shipped product = the cross-fade + star-freeze alone. Mechanics kept for a possible
  revisit: pop the perspective wrapper's independent `scale`/`translate` (composes with
  Motion's FLIP transform), never the flip div (iOS scroll path). A negative result, kept.
- **2026-07-16 · `sandbox:theme-transition/A-v5`** — **mechanism change → View Transitions
  API.** The box-shadow-drop and linear ease (below) didn't clear the mobile-WebKit
  tail-stall, because the cost was per-element paint (transitioning colour on every node).
  Re-implemented A v5's uniform-cross-fade *look* as a single GPU-composited page dissolve
  via `document.startViewTransition()` — Concept B's *mechanism* under A's *look*. Feature-
  detected with an instant-swap fallback; `durMs`/`ease` now time the `::view-transition-*(root)`
  animation. Sandbox A v5 snapshot unchanged. **Status: SHIPPED — confirmed smooth on-device.**
- **2026-07-16 · `sandbox:theme-transition/A-v5`** — on-device (mobile WebKit) tuning of
  the cross-fade: **dropped `box-shadow`** from the fade (Safari box-shadow interpolation
  is paint-janky at the decelerating tail) and **retuned `ease` `cubic-bezier(.4,0,.2,1)`
  → `linear`** (the S-curve's flat tail stepped in the last frames — per-frame colour
  deltas below one 8-bit step). The sandbox A v5 snapshot is unchanged.

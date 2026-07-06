import { DEFAULT_SNAP_EASE_DURATION_MS, type EasingCurveName } from "./scrollSnapEase";

// TEMPORARY — live-tunable values for the wheel/touch scroll forwarders'
// snap-ease and fling feel, backing ScrollTuningPanel.tsx's on-screen
// sliders. A plain mutable object (not React state) so both forwarders
// (ScrollFadeArea.tsx's wheel handler, ResultCard.tsx's touch handler) can
// read the CURRENT value at the moment a gesture actually happens, rather
// than a value frozen into their effect closures at mount time — the
// panel's sliders write directly into this object, and the very next
// gesture picks up the new value with no reload/recompile needed.
//
// Delete this whole file (and ScrollTuningPanel.tsx, and its mount point,
// and switch the forwarders back to plain local constants with the final
// chosen values baked in) once the right feel is dialed in — this is not
// meant to ship long-term.
export const scrollTuning = {
  snapEaseDurationMs: DEFAULT_SNAP_EASE_DURATION_MS,
  flingFriction: 0.9,
  minFlingVelocity: 0.08,
  // The settle's shape, not just its duration — see EASING_CURVES' own
  // comment for what each option actually is. cubicCurrent matches this
  // module's original, pre-panel default.
  easingCurve: "cubicCurrent" as EasingCurveName,
};

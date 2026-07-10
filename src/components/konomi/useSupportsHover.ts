import { useEffect, useState } from "react";

// True on mouse/trackpad devices, false on touch-only ones — defaults to
// true (desktop's own existing behavior, unchanged) until the one-time
// client-side matchMedia check resolves post-hydration, so SSR output
// always matches the default and there's no hydration mismatch warning.
// Not a persistent listener (no addEventListener for changes mid-session,
// e.g. a 2-in-1 laptop's mouse getting connected/disconnected) — this app
// has no other reactive capability-detection like that, and re-rendering a
// hover-driven hint out from under a held hover isn't worth the extra
// machinery for a case nobody's asked for yet.
//
// Extracted here once a second caller (MatchSelector.tsx/LevelSelector.tsx's
// own collapsed single-selector forms) needed the identical check —
// previously private to ResultCard.tsx. Both callers use it the same way:
// gate onMouseEnter/onMouseLeave/onBlur to hover-capable devices only, and
// rely on an explicit outside-pointerdown/click listener (not native blur)
// to dismiss a tap-shown hint on touch — real device touch/focus/blur
// timing has repeatedly proven unreliable in this app for that job (see
// DESIGN_SYSTEM.md's own history on ResultCard's lock/swap hints and on
// RollingLabel's DOM-swap-under-the-touch-point family of bugs).
export function useSupportsHover(): boolean {
  const [supportsHover, setSupportsHover] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupportsHover(window.matchMedia("(hover: hover)").matches);
  }, []);
  return supportsHover;
}

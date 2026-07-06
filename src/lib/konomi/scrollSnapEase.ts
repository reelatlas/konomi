// Shared by ScrollFadeArea.tsx's wheel forwarder and ResultCard.tsx's cover
// touch forwarder, so both glide into a snap point identically, by
// construction rather than coincidence — both forward gestures to the
// results carousel by hand (manual scrollBy), bypassing the carousel's own
// native scroll entirely, so the carousel's native scroll-snap correction
// (even with scroll-smooth) is never actually driving the settle for either
// of them — this is what does, for both.
//
// There's no CSS-level "scroll-snap-duration" or easing-curve property to
// tune the native correction with, so this animates the settle manually
// instead, with full control over both. DEFAULT_SNAP_EASE_DURATION_MS/the
// ease-out-cubic curve are starting guesses, not measured values — tune
// live against real trackpad/touch feel, the same way this app's other
// empirically-tuned scroll constants were.
export const DEFAULT_SNAP_EASE_DURATION_MS = 320;

// Computes the nearest scroll-snap-align:start target ourselves, rather
// than letting native scroll-snap resolve it — ScrollFadeArea always wraps
// its `children` in exactly one contentRef div, so `ancestor`'s own first
// child is that wrapper and ITS children are the actual snap items
// (ResultCard articles, for the results carousel). scrollPaddingLeft is
// read from the ancestor's own computed style rather than assumed, since
// callers pass it as a CSS length (e.g. "6%"), not a fixed px this
// function could otherwise hardcode.
export function getNearestSnapLeft(ancestor: HTMLElement): number {
  const contentWrapper = ancestor.children[0] as HTMLElement | undefined;
  if (!contentWrapper) return ancestor.scrollLeft;
  const items = Array.from(contentWrapper.children) as HTMLElement[];
  const scrollPaddingLeft = parseFloat(getComputedStyle(ancestor).scrollPaddingLeft) || 0;
  const current = ancestor.scrollLeft;
  const maxScrollLeft = ancestor.scrollWidth - ancestor.clientWidth;
  let nearest = current;
  let nearestDist = Infinity;
  for (const item of items) {
    const target = Math.max(0, Math.min(item.offsetLeft - scrollPaddingLeft, maxScrollLeft));
    const dist = Math.abs(target - current);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = target;
    }
  }
  return nearest;
}

// Eases `ancestor`'s own scrollLeft from wherever it currently sits to `to`
// over `durationMs`, via a plain rAF tween (no scroll-behavior/scrollTo
// involved, so this can't be affected by the ancestor's own CSS
// scroll-behavior the way a scrollTo call could). Callers are expected to
// keep scroll-snap-type disabled on `ancestor` for the whole tween and only
// clear it in `onDone` — by the time this finishes, the position is exactly
// on a valid snap point, so the native re-engage is a no-op rather than a
// second, competing correction.
//
// Returns a cancel function — both callers can have a new gesture start
// (on the same shared carousel, possibly from a different card) while a
// previous settle is still animating; without a way to stop the old one,
// both would keep writing to the same scrollLeft at once and fight.
export function easeToSnap(ancestor: HTMLElement, to: number, durationMs: number, onDone: () => void): () => void {
  const from = ancestor.scrollLeft;
  const start = performance.now();
  let rafId: number;
  function step(now: number) {
    const t = Math.min(1, (now - start) / durationMs);
    const eased = 1 - Math.pow(1 - t, 3);
    ancestor.scrollLeft = from + (to - from) * eased;
    if (t < 1) {
      rafId = requestAnimationFrame(step);
    } else {
      onDone();
    }
  }
  rafId = requestAnimationFrame(step);
  return () => cancelAnimationFrame(rafId);
}

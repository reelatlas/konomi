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
// instead, with full control over both. 320 → 460: confirmed live (real
// device, front cover) that 320ms read as a fast/aggressive snap rather
// than a gentle glide — still a starting guess for this specific value, not
// a measured final one, but a deliberate lengthening in response to real
// feedback, not an arbitrary pick. Tune further live the same way this
// app's other empirically-tuned scroll constants were.
export const DEFAULT_SNAP_EASE_DURATION_MS = 460;

// Walks up from `el` to find the nearest ancestor that's actually a scroll
// container on either axis (auto/scroll overflow) — used below to make
// sure a candidate snap item genuinely belongs to the ancestor we're
// computing a target for, not some OTHER, nested scroll container between
// them.
function nearestScrollableAncestor(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    if (style.overflowX === "auto" || style.overflowX === "scroll" || style.overflowY === "auto" || style.overflowY === "scroll") {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

// Computes the nearest scroll-snap-align:start target ourselves, rather
// than letting native scroll-snap resolve it. Finds the actual snap items
// by their own computed scroll-snap-align (not "none"), scanning
// descendants — not by assuming a fixed DOM depth (e.g. "ancestor's first
// child's children") the way an earlier version of this function did.
// Confirmed live as a real, pre-existing bug: RecommendationsBody nests the
// real snap items (a leading spacer + each ResultCard's own <article>, both
// carrying scroll-snap-align via Tailwind's snap-start or an arbitrary
// [scroll-snap-align:start] value) two levels below ancestor's own
// contentRef wrapper (contentRef → the results grid div → the actual
// items), not one — so the old "first child's children" assumption found
// exactly one non-item (that grid div's own parent wrapper), always
// measured its offsetLeft as 0, and this function always "found" that one
// candidate nearest regardless of actual scroll position, snapping every
// settle back to the very first card no matter how far the scroll had
// gone.
//
// A plain descendant scan by itself isn't enough, though — also confirmed
// live: each ResultCard's own tag chips carry scroll-snap-align too (for
// the tag area's own, separate vertical scroll), and a blind scan picks
// those up as false candidates, with offsetLeft values measured relative
// to whatever THEIR nearest positioned ancestor is (some div inside the
// tag chip row), completely irrelevant to this carousel's own horizontal
// scrollLeft math. nearestScrollableAncestor filters to only items whose
// own closest real scroll container is THIS ancestor specifically — the
// tag chips' nearest scrollable ancestor is the tag area's own scroll div,
// not the carousel, so they're correctly excluded; the actual cards'
// nearest scrollable ancestor genuinely is the carousel.
export function getNearestSnapLeft(ancestor: HTMLElement): number {
  const items = Array.from(ancestor.querySelectorAll<HTMLElement>("*")).filter(
    (el) => getComputedStyle(el).scrollSnapAlign !== "none" && nearestScrollableAncestor(el) === ancestor
  );
  if (items.length === 0) return ancestor.scrollLeft;
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

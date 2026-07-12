<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:webkit-icon-shimmer -->
# WebKit/Safari icon shimmer in animated containers

**Symptom:** thin stroked inline-SVG icons shimmer (jitter ~1px up/down) while a
container they live in animates its layout (e.g. MixerBar resize/open/close).
Filled shapes and text don't shimmer; Chrome doesn't reproduce it. Confirmed
on-device, and on desktop Safari at high DPR — it's WebKit-specific, not mobile-
specific.

**Cause:** when an ancestor's layout (height/margin) animates, WebKit re-
rasterizes that subtree each frame and snaps thin strokes to the device-pixel
grid, so strokes hop by a pixel frame-to-frame. It happens at the fractional
*in-flight* frames, so clean resting geometry alone does NOT prevent it.

## The fix (root cause): promote the moving row to its own compositor layer
Put `transform: translateZ(0)` / `will-change: transform` on the **whole moving
row/element as one unit** (NOT on individual icons — promoting icons alone
desyncs them from the main-thread-laid-out row and makes it worse). A promoted
layer is rasterized once and translated by the compositor, so its strokes are
never re-rastered mid-animation. This is why MixerBar's RecommendButton (in its
own composited subtree) never shimmered. This lets us keep stroked icons AND
real per-frame layout animation on every engine.

## Supporting hygiene (NOT the shimmer cure — do not treat as load-bearing)
Whole-pixel geometry keeps icons sharp and centered **at rest**; it is good
product-wide policy but was not what fixed the shimmer. Apply it with normal
judgment, not as a harsh rule:
- Prefer **whole CSS pixels** for directly-authored structural sizes (boxes,
  icon render `width`/`height`, row heights, gaps, padding, margins). Avoid new
  half-pixel structural values (e.g. `44.5px`) when there's no reason for them.
- Prefer **even** sizes for boxes that center an icon/text, so `(box − child)/2`
  is whole.
- Give inline-SVG icons whole render boxes with a **uniform** scale (don't render
  a `14×20` viewBox at `13×17`).
- Centralize shared sizes as a **single token/constant** rather than copying a
  literal across components.
- Stroked vs filled is a design choice, not a rule — stroked icons are fine;
  the layer-promotion fix is what makes them safe in animated containers.

## Don't over-correct
Fractional values are fine when browser-derived or intentionally decorative:
percentages, `auto`/flex/grid distribution, `mx-auto`/centering math, viewport
math, transform interpolation between whole endpoints, shadows, hairline/`.5px`
symmetric borders, letter-spacing. Per-frame device-pixel snapping of animated
values is NOT recommended — it causes visible stepping and the layer-promotion
fix makes it unnecessary.
<!-- END:webkit-icon-shimmer -->

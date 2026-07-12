<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:whole-pixel-geometry -->
# Whole-Pixel Structural Geometry (WebKit/Safari shimmer)

Safari/WebKit re-rasterizes elements as an ancestor moves sub-pixel during an
animation and snaps thin SVG strokes to the device-pixel grid → visible icon
shimmer. Filled shapes and text don't shimmer; Chrome doesn't reproduce it.
Confirmed on-device. Author structural geometry on whole pixels to avoid it.

## Rules
- Use **whole CSS pixels** for geometry we directly author: component/box sizes,
  icon-button boxes, icon render `width`/`height`, row heights, gaps, padding,
  margins. **Never introduce half-pixel structural values** (e.g. `44.5px`).
- Prefer **even** sizes for any box that centers an icon or text, so
  `(box − child) / 2` is a whole number and lands on-grid at any DPR.
- Give inline-SVG icons **even, whole render boxes** with a **uniform** scale
  (don't render a `14×20` viewBox at `13×17` — change `width`/`height`, keep the
  `viewBox`).
- Centralize shared sizes as a **single token/constant**; never copy a literal
  size (like `h-[44px]`) across components where it can drift.

## Animated geometry (distinct from structural)
- **Structural sizes** (boxes, icons, padding, gaps): always whole integers at
  rest — see Rules above.
- **In-flight animated values** (height, margin, transform during drag/transition):
  may be fractional — that's normal and keeps motion smooth.
- **On settle** (drag end, transition end, snap-to-target): round final committed
  values to whole device pixels (`Math.round(v * dpr) / dpr`).
- **Do not snap every frame** during animation — per-frame rounding causes visible
  stepping. If WebKit icon shimmer persists despite clean structural geometry,
  fix the authored sizes first; only then consider exceptional mitigations (e.g.
  compositor-only drag path), not blanket per-frame snapping.

## Don't over-correct
Fractional values are fine when browser-derived or intentionally decorative:
percentages, `auto`/flex/grid distribution, `mx-auto`/centering math, viewport
math, transform interpolation between whole endpoints, shadows, hairline/`.5px`
symmetric borders, letter-spacing.

## Example
```tsx
// BAD — half-pixel box, odd icon, non-uniform scale
<button className="h-[44.5px] w-[44.5px]">
  <svg width="13" height="17" viewBox="0 0 14 20" fill="none" stroke="currentColor" />
</button>

// GOOD — even box, even icon, uniform scale, whole centering offset
<button className="h-[44px] w-[44px]">           {/* (44 − 16) / 2 = 14 */}
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" />
</button>
```
<!-- END:whole-pixel-geometry -->

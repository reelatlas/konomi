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

**Scope the promotion to WHILE the container is animating — do NOT leave it on
permanently.** A permanent standalone compositor layer rattles during unrelated
layout changes (e.g. a plain window resize): the compositor repositions the
stand-alone layer a frame out of step with the main-thread relayout of the rest
of the bar, on both engines, in every mode. The shimmer only happens while the
row is being moved by the animation, so toggle the promotion class on only for
the open/close/snap/drag animation (MixerBar's `.is-animating` on
`.mixbar-controls-row`) and off at rest, where a normal in-flow element can't
rattle.

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
fix makes it unnecessary. Snapping the *settled* geometry to the device grid was
also tried for the promote/demote boundary shift (below) and did NOT fix it — the
boundary artifact is an anti-aliasing/re-rasterization mode change at layer
create/destroy, not a fractional-position problem, so geometry snapping can't
touch it. Reverted; don't re-add it as a shimmer/boundary fix.
<!-- END:webkit-icon-shimmer -->

<!-- BEGIN:animation-and-dataviz-stack -->
# Animation & data-viz stack — pick the cheapest tool that fits

**The ladder gives the DEFAULT answer; it does NOT skip the surfacing step.**
Per CLAUDE.md you still weigh Motion vs the alternative and name the call before
implementing — the ladder is the starting position you argue *from*, not an
auto-decision. Escalate a rung only for the reason named. Precedent (the earned
case history behind each rung) lives in `DESIGN_SYSTEM.md`.

1. Discrete state / hover / color / visibility toggle (A→B)
   → **CSS transition** (Tailwind `transition-*`). Nothing cheaper; no per-frame JS.
2. One-shot enter/exit on mount/unmount
   → **CSS `@keyframes`** + a `setTimeout` mount-through-exit orchestration.
   NOT `AnimatePresence` — it replays a present child's cached mount `initial` on
   sibling shifts (the "AnimatePresence scar"; a keyframe plays once, never on a
   later reflow).
3. Reorder / FLIP / shared-layout (element moves, no interpolable "from")
   → **Motion `layout="position"`** + a `layoutDependency` guard. CSS has no "from"
   box to animate here; this is the one clear Motion win.
4. Continuous, gesture / scroll / velocity-driven, interruptible
   → **Motion values** (`useMotionValue`/`useVelocity`/`useScroll`), optionally
   driving a CSS custom property that `calc` renders. Needs per-frame input CSS
   can't read.
5. Presence-based content swap (text roll, true mount/unmount replacement)
   → **Motion `AnimatePresence`**, narrowly — only genuine presence replacement,
   never a sibling-shift on a stable child (that's rung 2's scar).

Always, regardless of rung:
- Honor `prefers-reduced-motion` in **both** the CSS and the JS timing.
- Prefer `setTimeout(namedConstant)` over `animationend`/`onAnimationComplete`
  (both unreliable on-device in this app's history).
- Keep timing/easing as named constants in a `*Tuning.ts`, never inline literals.
- Animate `transform`/`opacity`; watch composite cost (a *growing* `filter`/layer
  re-uploads a larger texture every frame — the usual on-device culprit, not
  layout). If a layout animation shimmers WebKit strokes, promote the whole moving
  row to its own layer, scoped to the animating window only (`webkit-icon-shimmer`).
- Verify on-device; headless has hidden nearly every hard animation bug here.

## Data viz (d3)

**Structural rules (locked — these won't change):**
- d3 is for **math only** — layout (`d3-hierarchy` pack/treemap, `d3-force`) and
  scales (`d3-scale`, `d3-scale-chromatic`). **Never** `d3-selection`,
  `d3-transition`, or the `d3` monolith: React owns the DOM.
- **React renders** the SVG/DOM by mapping computed positions to JSX.
- **Motion animates** the rendered nodes, per the ladder above.

**Starting defaults (validate when we build the first chart; correct if reality
differs — same restraint as leaving easing values and chart-libs open):**
- Tokens drive color/size — seed scales from Konomi tokens, not stock d3 palettes;
  size via `scaleSqrt` so a bubble's *area* ∝ weight.
- One coordinate, one owner — if `d3-force` ticks a simulation, don't also
  Motion-animate the same x/y; pick the driver (sim → resting positions, Motion →
  gesture/enter/exit).
- SVG by default; escalate to canvas/WebGL only past the SVG node ceiling (~few
  hundred nodes).
<!-- END:animation-and-dataviz-stack -->

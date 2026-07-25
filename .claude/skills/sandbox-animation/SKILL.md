---
name: sandbox-animation
description: >
  Explores and compares multiple divergent ANIMATION concepts in Konomi's
  _sandbox/ scratch space before any of it touches production. Use whenever the
  user wants to brainstorm, prototype, or compare variations of a motion idea —
  a transition, gesture, micro-interaction, enter/exit, spring/easing feel,
  drag/resize behavior, or layout animation — and see several options side by
  side before deciding what (if anything) graduates into the real app. Trigger on
  "run sandbox-animation: how the mixer bar expands", "run sandbox: <animation
  idea>", "explore a few ways the mixer bar could
  expand", "prototype some card enter animations", "sandbox 3 options for the
  pop-out menu motion", or any request to try divergent animation directions in
  the sandbox. This is exploration only — it generates throwaway concepts into
  _sandbox/animation/ and never edits production code. Use the /motion skill
  instead when implementing a single, already-chosen animation for real.
argument-hint: "[animation idea to explore, e.g. 'how the mixer bar expands', 'card enter transitions', 'pop-out menu motion']"
---

# sandbox-animation

Explore divergent **animation & motion** ideas in the sandbox — motion for a page,
feature, transition, flow, or a one-off visual — to test whether it's worth building.
The goal is usually improved UX, but equally feeling / brand cohesion / atmosphere; a
concept can be "not textbook best-practice" if it reinforces the intended feeling.

> **Read `../_shared/sandbox-framework.md` first.** It holds the phase contract, the
> constraint gradient, the WHAT/HOW/LOOK dial model + LOOK vocabulary, the role-based
> research strategy, the save-default lifecycle, the debug-panel spec, and the Konomi
> project context. This file defines only animation's **WHAT/HOW dials, research
> sources, and type notes.**

## WHAT + HOW dials (LOOK, Feel, and the shared dials live in the framework)

**WHAT — the motion form:**
- **Trigger** — hover · press · drag · scroll · mount/unmount · state-change
- **What-moves** — position · scale · rotation · opacity · color · blur

**HOW — dynamics:**
- **Timing & physics** — duration · delay · velocity-handoff · latency (<100ms=instant);
  easing: linear/ease · **spring** (stiffness·damping·mass) · overshoot · interruptibility
- **Choreography** — stagger · sequence · parent→child · enter/exit · shared-element/layout

**Purpose gate (animation):** orient · feedback · continuity · delight → if none, **cut**.

## Phase 1 — research (fill the four roles from the framework)

- **Authority** — UX + code motion principles (effectiveness · efficiency · reliability)
  **and the Motion MCP / Codex** (current canonical patterns — the currency authority).
  **Invoke the `/motion` skill by name**: it carries the Codex search, spring/curve
  visualisation, and MotionScore.
- **Product precedent** — Mobbin (top-rated · popular · animations; iOS + web); brand
  look/feel.
- **Frontier** — the best Motion work isn't in the docs: @motiondotdev, the Motion
  showcase, CodePen. Discover current-best via search; X is often not fetchable, so lean
  on what's reachable.
- **Adjacent** — game-feel, motion-design reels.
- **Weigh + name the mix**, then **currency-check** any external Motion code (imports
  `motion/react`, never `framer-motion`; no deprecated APIs) via the Motion MCP before it
  enters a concept.

## Type notes

- **Divergence axis:** usually a **HOW** dial (timing/feel) or **WHAT** (motion-style).
  Initial batch wide (dial × register); refine single-variable.
- **Output** → `_sandbox/animation/`; standalone HTML judged in the browser.
- **Debug panel:** animation is the most slider-friendly type — expose timing/physics ·
  stagger · opacity/scale/rotation as live controls first.
- **Judging (Phase 3):** browser to start, but **judge on the physical iPhone before
  graduating** (this project's WebKit-only motion history) — a Stage-2 reminder, not a
  Stage-1 gate.
- **Bugs field (Phase 4):** record on-device shimmer/jank; graduation-readiness = the
  Motion approach + `*Tuning.ts` constants + which components it composes with.

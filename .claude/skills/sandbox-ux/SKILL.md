---
name: sandbox-ux
description: >
  Explores and compares multiple divergent UX-FLOW, FEATURE, and INTERFACE
  concepts — including ideation and Figma prototypes — in Konomi's _sandbox/
  scratch space before any of it touches production. Use whenever the user wants to
  brainstorm, prototype, or compare variations of a flow, feature, interaction
  model, screen, or visual/asset treatment — entry points, information
  architecture, swipe-vs-button, hand-drawn vs geometric UI, an ignore-cards or
  bookmark feature — and see several directions side by side before deciding what
  (if anything) graduates into the real app. Trigger on "run sandbox-ux: an
  ignore-cards feature", "run sandbox: <flow or feature idea>", "explore a few
  flows for bookmarking", "sandbox some entry points for X", "prototype 3 versions
  of this screen in Figma", "buttons as hand-drawn stroke SVGs", or any request to
  try divergent UX / product / visual directions in the sandbox. This is
  exploration only — it pulls Mobbin references and authors Figma canvas prototypes
  and/or local code into _sandbox/ux/, and never edits production code. Use the
  figma-* skills for implementing or syncing a single, already-chosen design for
  real.
argument-hint: "[flow/feature/UI idea to explore, e.g. 'an ignore-cards feature', 'bookmarking flows', 'buttons as hand-drawn SVGs']"
---

# sandbox-ux

Explore divergent **UX flows, features, and interface** ideas in the sandbox — entry
points, information architecture, interaction models, screens, visual treatments — plus
ideation and Figma prototypes, to compare directions before committing to one.

> **Read `../_shared/sandbox-framework.md` first** (phase contract, dial model, research
> strategy, save-default lifecycle, project context). This file defines only ux's
> **WHAT/HOW dials, research sources, medium, and the two rounds.**

## WHAT + HOW dials

**WHAT — the flow form:**
- **Entry point** — on-card · in a menu · gesture · bulk-select
- **Information architecture** — how the destination/list is organized & surfaced
- **Interaction model** — swipe · button · long-press · drag-to-target

**HOW — dynamics:**
- **Flow sequence** — the steps and their order
- **Feedback** — toast · animation · undo · inline confirm
- **Reversibility** — how the user recovers / undoes
- *(When a step needs real motion, borrow animation's HOW + the Motion currency guard.)*

**Purpose gate (ux):** complete a task / cut friction (+ delight) → if it doesn't serve a
task, **cut**. LOOK applies to screens/components (hand-drawn buttons, glass cards, etc.).

## Medium

**Figma canvas is primary** — compare many flows/layouts fast, authored via the `figma-*`
skills (MANDATORY before `use_figma` / `create_new_file` / `get_design_context`), built
from Konomi components once in Stage 2. **Local code** when an interaction must be *felt*.

## Phase 1 — research (fill the four roles)

- **Authority** — usability heuristics (Nielsen) + platform HIG (Apple HIG / Material) +
  interaction best-practice.
- **Product precedent** — **Mobbin is ux's strongest home** (flows · screens · sections;
  top-rated · popular; iOS + web). Pull refs before generating.
- **Frontier** — Mobbin "latest" + Land-book / pageflows / Dribbble (discover current-best
  via search).
- **Adjacent** — game onboarding, physical-product flows.
- **Weigh + name the mix.**

## Type notes

- **Two rounds:** R1 = the **WHAT** (entry-point / IA / interaction-model options,
  precedent-driven, unconstrained, usually Figma frames) → R2 = design-system components /
  tokens + **HOW** (real, felt interactions/motion) + LOOK polish.
- **Output** → Figma canvas (frames named `{shortname} — Concept N ({register})`) with a
  `notes.md` stub in `_sandbox/ux/` linking back; local-code concepts → `_sandbox/ux/`.
- **Debug panel:** flows are structural → mostly **preset toggles** (entry-point variants,
  feedback style); timing sliders only for coded interaction prototypes.
- **Judging (Phase 3):** note which concepts must be *moved through* (interaction) rather
  than judged as a still frame — offer to make those live.

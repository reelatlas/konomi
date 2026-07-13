# Konomi — Claude Code instructions

This file is a **router only**. Follow it to know which docs to read for a task.
Hard rules live in `AGENTS.md` (imported below).

## Always read first

@AGENTS.md

Follow `AGENTS.md` for all code changes. It contains non-negotiable project rules.

## Before you build (design-system-first)

Before creating or changing UI, reference the system first — don't invent in
isolation:

1. **Reuse before authoring.** Check for an existing token (`src/lib/konomi/tokens.ts`,
   `themes.ts`, `src/app/globals.css`), component, or pattern that already covers
   this. Prefer composing or extending what's there over a new one-off value or
   component. Values come from tokens (spacing, color, radius, control sizes);
   visual language and precedent come from `DESIGN_SYSTEM.md`.
2. **Build for reuse or customization.** New shared UI should be token-driven and
   parameterized (props/variants), so the next use is a reuse, not a
   re-implementation. Centralize a shared size/behavior as one token/constant
   rather than copying a literal across components.
3. **Flag one-offs and experiments.** A deliberate exception, prototype, or
   experiment is legitimate — but say so in a brief comment (why it's a one-off,
   and whether it should be generalized later) so it isn't mistaken for a pattern
   or silently copied.

Consistency first; novelty only with a reason. This is a working principle, not a
straitjacket — good hygiene and best practice, applied with judgment (see
`AGENTS.md` "Don't over-correct").

## When to read other docs

### UI / components / layout / tokens

Read `DESIGN_SYSTEM.md` when:
- creating or changing visual UI
- choosing spacing, typography, colors, or button sizes
- understanding why an existing component behaves a certain way

Search it for the specific component or area — do not read the whole file unless
auditing. Token sources of truth are `src/lib/konomi/tokens.ts`, `themes.ts`, and
`src/app/globals.css`.

### Asset / icon creation

Before creating or resizing icons, buttons, or control chrome:
1. Follow `AGENTS.md` `webkit-icon-shimmer` (supporting-hygiene section) for
   sizing — whole/even boxes, uniform icon scale, shared tokens
2. Match conventions in `src/components/konomi/icons.tsx`
3. Stroked icons are fine — a design choice, not a rule
4. Read `DESIGN_SYSTEM.md` for visual language when unsure

### Animation / Motion

Before writing or changing any animation (CSS transitions, keyframes, Motion,
rAF, layout animation, drag/resize motion):
1. Read and follow the Motion skill: `~/.claude/skills/motion/SKILL.md`.
   **"Consulting Motion" means using this project's Motion Pro tooling** — the
   Motion MCP (search the Motion Codex for the official/canonical pattern,
   visualise springs and curves), the Motion agent, and the Motion repos — not
   just recalling Motion from memory. Search the Codex for the pattern before
   hand-rolling one.
2. **Always weigh Motion against a standard alternative BEFORE implementing, and
   surface that decision — never silently pick one, and never randomly mix.**
   For any animation, consider both (a) what Motion offers here (a canonical
   pattern, smoother physics, more expressive creativity — check the Codex) and
   (b) the standard alternative (a CSS transition/keyframe, basic state logic).
   Then state which one you're choosing and the trade-off — e.g. "Motion's
   AnimatePresence is the canonical fit here" or "a CSS transition does this exit
   with less code and no per-frame JS, so I'm NOT using Motion." Present the call
   so it can be acknowledged; do not merge an approach (Motion, CSS, or a
   combination of both) without naming which path and why. If an existing
   animation already works, prefer understanding/keeping its approach over
   swapping it to the other tool "just because" — a migration is itself a
   decision to surface, not a default. (Motion is the usual choice for real,
   interruptible/gesture-driven motion; simpler CSS often wins for one-shot
   enter/exit and state toggles.)
3. **A MotionScore performance audit** (Motion skill → `performance-audit/`) can
   profile an existing animation/component/URL to get a baseline of animation
   strength and jank, and to advise the best way to proceed — run one when
   tuning or evaluating motion, or when unsure whether an approach is smooth.
4. If stroked icons live inside a container whose layout animates and they
   shimmer in Safari, the fix is to promote the **whole moving row** to its own
   compositor layer (`transform: translateZ(0)`), NOT per-frame pixel snapping
   and NOT promoting individual icons. See `AGENTS.md` `webkit-icon-shimmer`.
5. For project-specific animation history and lessons, search `DESIGN_SYSTEM.md`
   (MixerBar, RollingLabel, Masthead, card enter/exit, etc.)

Do not hand-roll animation patterns Motion already covers without checking the
Motion skill first.

### Product-wide geometry

Whole-pixel structural geometry (per `AGENTS.md` `webkit-icon-shimmer`) is
supporting hygiene for at-rest sharpness/centering — apply it with normal
judgment when building UI, not as a harsh rule and not as a shimmer fix.

## Next.js

This project uses a non-standard Next.js version. Before writing Next.js code,
read the relevant guide in `node_modules/next/dist/docs/` and heed deprecation
notices. See `AGENTS.md` `nextjs-agent-rules`.

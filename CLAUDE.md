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
1. Read and follow the Motion skill: `~/.claude/skills/motion/SKILL.md`
2. If stroked icons live inside a container whose layout animates and they
   shimmer in Safari, the fix is to promote the **whole moving row** to its own
   compositor layer (`transform: translateZ(0)`), NOT per-frame pixel snapping
   and NOT promoting individual icons. See `AGENTS.md` `webkit-icon-shimmer`.
3. For project-specific animation history and lessons, search `DESIGN_SYSTEM.md`
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

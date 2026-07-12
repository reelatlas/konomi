# Konomi — Claude Code instructions

This file is a **router only**. Follow it to know which docs to read for a task.
Hard rules live in `AGENTS.md` (imported below).

## Always read first

@AGENTS.md

Follow `AGENTS.md` for all code changes. It contains non-negotiable project rules.

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
1. Follow `AGENTS.md` `whole-pixel-geometry` rules
2. Match conventions in `src/components/konomi/icons.tsx`
3. Use shared tokens/constants — no one-off fractional structural sizes
4. Read `DESIGN_SYSTEM.md` for visual language when unsure

### Animation / Motion

Before writing or changing any animation (CSS transitions, keyframes, Motion,
rAF, layout animation, drag/resize motion):
1. Read and follow the Motion skill: `~/.claude/skills/motion/SKILL.md`
2. Structural sizes stay on whole integers; animated values may be fractional
   in-flight but snap to whole pixels on settle — never per-frame snap (it
   causes stepping). See `AGENTS.md` `whole-pixel-geometry`.
3. For project-specific animation history and lessons, search `DESIGN_SYSTEM.md`
   (MixerBar, RollingLabel, Masthead, card enter/exit, etc.)

Do not hand-roll animation patterns Motion already covers without checking the
Motion skill first.

### Product-wide geometry

When auditing or building new UI, apply whole-pixel structural geometry across
the whole product per `AGENTS.md` — not only MixerBar.

## Next.js

This project uses a non-standard Next.js version. Before writing Next.js code,
read the relevant guide in `node_modules/next/dist/docs/` and heed deprecation
notices. See `AGENTS.md` `nextjs-agent-rules`.

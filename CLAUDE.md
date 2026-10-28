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
   enter/exit and state toggles.) The 5-rung decision ladder in `AGENTS.md`
   (`animation-and-dataviz-stack`) gives the default answer for each case — treat
   it as the starting position to argue *from*, not an auto-decision that skips
   this surfacing step. The human check still happens; the ladder just tells you
   where to start the argument.
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

### Data sourcing / APIs / the shared catalog

Read `DATA_SOURCING.md` before touching how data is pulled, stored, or promoted:
- changing an import script (`scripts/import-anilist.ts`, `scripts/import-tmdb.ts`)
- adding a tag category, changing a tag floor, or weighting tags
- anything involving AniList or TMDB API capabilities

It records **measured** API facts (what can and can't be ranked, hard limits),
the raw → adapter → shared-catalog split and why, the film corpus definition,
and a **rejected-alternatives** section — check that before re-proposing an idea
(`cult` as a vote window, exclusive seed buckets, a payload GIN index) that was
already tried and measured. It also carries the empirical tag distributions:
use **floors, not means** (a mean said Producer was dead; it isn't), and note
that no keyword covers even 13% of the corpus, so any rarity/heat scale must be
per-section, never a global percentage.

The **film tag pool IA** (11 sections, three section shapes, Franchise ≥3) and
the **Reception rating methodology** (Bayesian shrink m=1000 + percentile-within-
decade + impact path + recency guard from `fetched_at`) are settled in §7–8 —
read them before building any film promote/adapter logic or changing a reception
threshold. **Tag consolidation is in progress in §9** — the 123-canonical alias
ledger, cross-section moves, the split-for-precision Theme subsections, and the
locked process rules (consolidate-before-floor, dedup-union-not-sum,
rules-not-edits). §9's "Current state & how to resume" is the pickup point for
continuing the section-by-section pruning (Crime is the big open one). Remaining
open decisions are in §10.

### Data viz / charts (d3)

Before building any visualization (bubble cluster, treemap, heatmap, etc.):
- Hard rules — the d3=math / React=DOM / Motion=motion split, and the animation
  ladder — live in `AGENTS.md` (`animation-and-dataviz-stack`). The structural
  split is locked; never reach for `d3-selection`/`d3-transition`/the `d3` monolith.
- Precedent, token integration, and the running log of chart decisions live in
  `DESIGN_SYSTEM.md` ("Data viz (d3) — architecture & patterns"). The specifics
  there (`scaleSqrt`, token palettes, one-coordinate-one-owner) are **starting
  defaults** — validate and correct them when the first chart actually ships.

### Product-wide geometry

Whole-pixel structural geometry (per `AGENTS.md` `webkit-icon-shimmer`) is
supporting hygiene for at-rest sharpness/centering — apply it with normal
judgment when building UI, not as a harsh rule and not as a shimmer fix.

### Audits / baselines

`docs/audits/` holds frozen, diffable baselines. Before any sizing/type/
elevation/control change, read `docs/audits/SIZING_AUDIT.md` (canonical;
includes the ruled 2-tier target state) and diff measurements against
`docs/audits/sizing-inventory.json` — regenerate via
`node scripts/audit-controls.mjs`, never re-measure by hand.

## Next.js

This project uses a non-standard Next.js version. Before writing Next.js code,
read the relevant guide in `node_modules/next/dist/docs/` and heed deprecation
notices. See `AGENTS.md` `nextjs-agent-rules`.

## _sandbox/ — experiment scratch (ignored by default)

`_sandbox/` holds exploratory, throwaway experiments — animations, data-viz, flows/iterations, and mockups or prototypes (Figma included) — and may lean on the design/reference/motion MCPs (mobbin/figma/motion). It's gitignored and cursorignored. The same one-way boundary below applies to all of it, code or prototype.

- Do NOT read, scan, or reference `_sandbox/` unless I explicitly ask.
- When I DO ask, experiments MAY import from the real app (`src/...`, tokens, components) — that's intended, so ideas use real Konomi code.
- `_sandbox/` code is never graduated into `src/` or referenced by real app code unless I explicitly confirm the idea. It may freely reuse the app's tokens/styles/formats/guidance or explore freely.
## Profile (read by the global skills)

Global skills come from the kit (`~/Projects/claude-kit`,
github.com/reelatlas/claude-kit): `orchestrate`, `tidy`, `ship`, `save`,
`research-practice`, `sandbox-animation`, `sandbox-dataviz`, `sandbox-ux`.
The project copies of the sandbox skills in `.claude/skills/` win while they
exist; `run-konomi` stays a project skill.

```
gate: npx tsc --noEmit && npm run lint && npm test && npm run build
deploy: push main deploys production (Vercel); a branch push builds a preview
branch: wip-2026-10 until Sean merges. Local main holds that work, 167 ahead of origin/main (2026-10-28): push with `git push origin HEAD:wip-2026-10`, never a bare push
commits: Conventional Commits; a visual change ships in its own commit so one revert removes it
scratch: _sandbox/
graduations: SANDBOX_GRADUATIONS.md
homes:
  design: DESIGN_SYSTEM.md
  learnings: DESIGN_SYSTEM.md (lessons live in its logs; no separate file yet)
  state: CLAUDE.md "Pick up here" (created by the first save)
  research: docs/proposals/
tokens: src/lib/konomi/tokens.ts, src/lib/konomi/themes.ts, src/app/globals.css
authorities:
  animation: Motion MCP (motion/react, never framer-motion)
  dataviz: AGENTS.md's locked d3 stack (scales and layout only; React owns the DOM)
  ux: the figma-* skills
platform-notes: DESIGN_SYSTEM.md's WebKit/Safari motion lore; judge motion on the iPhone before graduation
run: run-konomi
```

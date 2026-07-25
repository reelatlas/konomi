---
name: sandbox-dataviz
description: >
  Explores and compares multiple divergent DATA-VISUALIZATION concepts in Konomi's
  _sandbox/ scratch space before any of it touches production. Use whenever the
  user wants to brainstorm, prototype, or compare variations of a chart or
  visualization idea — bubble / circle-pack, treemap, heatmap, force graph,
  radial, chord, sankey — or which data variable maps to which visual channel
  (size, color, position, opacity), and see several forms side by side before
  deciding what (if anything) graduates into the real app. Trigger on "run sandbox-dataviz:
  bubble viz for tag rankings", "explore a few ways to visualize the tag pool",
  "sandbox heatmap vs treemap options for X", or any request to try divergent
  visualization directions in the sandbox. This is exploration only — it generates
  throwaway concepts into _sandbox/dataviz/ following the d3-math /
  React-renders / Motion-animates split, and never edits production code. Use the
  dataviz skill for general chart-design guidance when building one real chart.
argument-hint: "[visualization idea to explore, e.g. 'bubble viz for tag rankings', 'heatmap vs treemap for tag co-occurrence']"
---

# sandbox-dataviz

Explore divergent **data-visualization** ideas in the sandbox — bubble/pack, treemap,
heatmap, force, radial, and beyond — to find the form that represents Konomi's data best,
then push it into something engaging. Dataviz is **two-round**: R1 gets the representation
honest, R2 makes it art.

> **Read `../_shared/sandbox-framework.md` first** (phase contract, dial model, research
> strategy, save-default lifecycle, project context). This file defines only dataviz's
> **WHAT/HOW dials, research sources, the two rounds, and the tech-lever routing.**

## Data first (dataviz-only)

Unlike animation, **data is a Stage-1 constraint**: use real Konomi data when we have it
(honest encoding, real demo); dummy data only when it shows the idea better or the data
doesn't exist yet. Phase 0 gains a quick check — *do we have this data, real or dummy?*

## WHAT + HOW dials

**Round 1 · WHAT — get the representation right:**
- **Visual form** — bar · area · heatmap · treemap · bubble · circle-pack · beeswarm · graph
- **Encoding** — which variable → size/color/position/opacity (seriesCount→area · avgRank→heat)
- **Layout** — pack · treemap · force · grid (d3-hierarchy vs d3-force)
- **Scale** — **scaleSqrt** (area-honest) · linear · log · ordinal; token-seeded domains

**Round 2 · HOW — make it move & land:**
- **Interaction** — hover/tooltip · zoom · drag · filter · toggle-view · shuffle
- **Motion (4 kinds)** — entrance · idle/ambient · interaction · view-transition
  (pack↔treemap↔heatmap morph). **Bring in the Motion MCP here (R2), not R1.**

**Purpose gate (dataviz):** reveal an insight, honestly. LOOK·color obeys the **bound/free
split** (encoding-bound locked to the data; free channels open). LOOK·substance — **poster
art in the marks** — is the signature move.

## Phase 1 — research (fill the four roles)

- **Authority** — encoding principles (Cleveland/McGill perceptual ranking, Munzner
  what–why–how) + the **`dataviz` skill** (form heuristic, color formula, mark specs) + the
  **canonical d3 stack** (AGENTS.md locked rules: d3 = math only; **never** d3-selection /
  d3-transition / the d3 monolith — React owns the DOM). *No d3 MCP exists; this is the
  currency authority.*
- **Product precedent** — Mobbin (real dashboards / data-UIs).
- **Frontier** — Observable (Bostock), D3 Graph Gallery, Nadieh Bremer / Shirley Wu
  (artistic), FlowingData / Datawrapper (editorial) — seeds; discover current-best via search.
- **Adjacent** — scientific viz, generative art.
- **Weigh + name the mix.**

## Tech-lever routing (how each HOW effect is built)

- **CSS** → idle + hover; compositor-cheap, for effects on *many* nodes at once.
- **Motion** → enter/exit, view morphs, interruptible drag, shared-element, **and rebind
  reflows** (React recomputes target positions from the d3-*math*, Motion tweens to them —
  one coordinate, one owner). **Never `d3-transition`.**
- **SVG filters** → glass / glow / shadow — where the logged **drop-shadow trap** bites
  hardest (a Stage-2 concern).
- **Canvas / WebGL** → only past ~hundreds of nodes.

## Type notes

- **Output** → `_sandbox/dataviz/`. React renders the SVG; d3 does the math only.
- **Divergence axis:** R1 diverge on **visual form** (same data, different chart); R2 on
  LOOK / motion.
- **Debug panel:** form/scale/encoding toggles, **free-channel** color pickers, motion timing.
- **Judging (Phase 3):** flag which concepts need interaction (hover/zoom/filter) to judge
  fairly versus which read as a static image.

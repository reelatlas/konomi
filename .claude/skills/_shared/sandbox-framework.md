# Sandbox exploration framework (shared)

**Read this first** when running `sandbox-animation`, `sandbox-dataviz`, or
`sandbox-ux`. It holds everything the three share: the phase contract, the
WHAT/HOW/LOOK dial model, the research strategy, the concept lifecycle, and the
Konomi project context. Your skill's own `SKILL.md` holds only the **type-specific**
pieces that fill this — its WHAT/HOW dials, its research sources, and its output
medium. When the two ever disagree, the skill's type-specific note wins for that type.

> This is a plain reference doc, not a skill (no `SKILL.md`), so it never triggers on
> its own. It's the single place to tune the shared framework — edit here once, all
> three skills inherit it.

---

## Standing rules (non-negotiable)

- **Never write to production code (`src/`).** All output goes to the scratch space
  (`_sandbox/<type>/` — see Project context). Reading production (tokens, components)
  read-only is encouraged so concepts are realistic and easy to graduate later.
- **Save is the default; graduation is separate.** Exploring never edits the real app.
  Pulling a concept into production is its own explicit step the user invokes later.
- **Cite what you drew from.** Every concept names its inspiration sources — it's the
  feedback loop that tells us if research ran too broad or too narrow.

---

## The constraint gradient (how much we constrain, per stage)

A dial that **tightens across iterations**. This is the spine of how exploration
should feel — loose first, precise later.

1. **Stage 1 · Initial generate — unconstrained.** Chase the *best/novel idea*, not
   fit. Pull from best-practice + competitors + frontier examples. **Ignore** the
   design system, tokens, and our own logged project traps. Keep **only** device-
   agnostic hygiene (e.g. animate transform/opacity so a demo isn't misleadingly
   janky). Goal: surface the strongest option and cite where it came from.
   - *Exception (dataviz):* real data is a Stage-1 constraint — use actual Konomi data
     when we have it; dummy data only when it shows the idea better or the data doesn't
     exist yet.
2. **Stage 2 · Iterate (once the user picks a direction) — project-constrained.** Now
   bring in the design system, tokens, live components, and lessons-learned; that
   becomes the assumed working base for further versions.
3. **Stage 3 · Hi-fi refine — open outward.** Pull from *outside* the MCPs/codebase
   (image-gen, external components, whatever lifts the aesthetic) to reach final feel.

---

## The phase contract (Purpose + Output are shared; Logic is per-type)

Each phase has a fixed **Purpose** and **Output shape** (below). *How* each is filled
is the **Logic** in your skill.

- **Phase 0 · Intake** — *Purpose:* lightly understand the prompt (subject, focus, the
  divergence axis). *Output:* a 1–2 line restatement + chosen axis. No interrogation;
  this does **not** gate Phase 1.
- **Phase 1 · Research & gather** — *Purpose:* interface with sources enough to
  genuinely act on the prompt, at **adaptive depth** (quick when simple, deep when it
  pays off). *Output:* a prioritized pull (which source first · what to extract · how
  to weight) + the **named mix** (best-practice / MCP / external / combination).
- **Phase 2 · Generate** — *Purpose:* produce 3 concepts to gauge. *Output:* 3 concepts
  to `_sandbox/<type>/`, each labeled; an **index/preview page** + **debug panel** +
  **inspiration citations**. Initial batch diverges **wide** (axis + register);
  refinement rounds narrow to a **single variable**.
- **Phase 3 · Review & decide** — *Purpose:* after looking/testing, assign each concept
  a state. *Output:* per concept — **continue** (iterate → narrowed Phase 2, versioned
  v1→v2→v3) · **delete** (remove) · else **save**.
- **Phase 4 · Close out** — *Purpose:* save-as-default housekeeping. *Output:* per saved
  concept — notes (idea/interaction · **pros/cons/bugs** · graduation-readiness) +
  **tags/handle** + **version history**; deletes executed; INDEX updated.

The iterate loop is **3 → 2 (narrowed) → 3**, spinning out versions. Delete and Save
terminate a concept. **Save is the default** — never nag "want to save this?"; act only
on explicit *delete* or *continue*, and auto-document the rest at close-out.

---

## The dial model — WHAT / HOW / LOOK

Every exploration varies along three layers plus two qualifiers. Pick **1–2 dials as
the divergence axis** per batch; the rest are the menu. In Phase 0, choose *which layer*
to diverge on. The debug panel exposes the chosen dials as live controls.

- **WHAT** *(the core form)* — **type-specific**, defined in your skill.
- **HOW** *(dynamics: time / interaction)* — **type-specific**, defined in your skill.
- **LOOK** *(the aesthetic skin)* — **shared**, defined below. Identical vocabulary
  whether skinning a moving element, a chart mark, or a UI component.
- **Purpose** *(the gate)* — why does this exist? If nothing → **cut it**. (Type-specific
  purposes: animation = orient/feedback/continuity/delight; dataviz = reveal insight,
  honestly; ux = complete a task / cut friction.)
- **Feel** *(the target)* — the adjective goal the LOOK+HOW should produce (shared
  palette below).

### LOOK vocabulary (shared skin)
- **Style / era** — modern · minimal/flat · retro · Y2K · vaporwave · brutalist ·
  bauhaus · art-deco · memphis · swiss/editorial · skeuomorphic · glassmorphism.
- **Rendering & surface** — line-art · flat-vector · realism · 3D · clay · pixel ·
  hand-drawn/sketch · watercolor · collage · photographic · isometric; finish: grain ·
  gloss · matte · glass/blur · paper · gradient-mesh.
- **Shape & form** — geometric↔organic · sharp↔rounded · blobby · angular; 2D↔2.5D↔3D ·
  the sphere↔cube↔plane axis · flat↔voluminous.
- **Substance** *(abstract shape ↔ literal object)* — circle → real bubble / poster art /
  icon / 3D object / photo-fill · metaphor vs pure geometry. **This is Konomi's signature
  lever** (nodes filled with real cover/poster art turns a generic chart into *your*
  product).
- **Color** — mono · duotone · gradient · pastel · neon · muted/earthy · high-contrast ·
  brand-locked. **When data drives a channel, split it:** *encoding-bound* color is
  locked to the data (honest — don't touch); *free* color (background · stroke · accent ·
  tint) is open. Bound = d3-scale; free = CSS/tokens.
- **Depth & lighting** — flat · drop-shadow · inner-shadow · ambient glow · layered blur ·
  parallax. *(SVG filters / CSS shadow.)*
- **Atmosphere** — plain · gradient-mesh · grain · vignette · dark/moody · genre-themed
  background layer.
- **Composition** — minimal↔maximal · whitespace · grid↔freeform · centered↔dynamic ·
  layered depth · type-as-visual.

### Feel palette (shared target)
- **Energy** snappy ↔ languid · **Weight** floaty ↔ grounded · **Personality** playful ↔
  precise · bouncy ↔ deliberate · subtle ↔ expressive.

### Craft checklist (quality bar, not a dial)
slow-in/out · anticipation · follow-through · staging · arcs. (Techniques that *produce*
Feel — a quality bar to check, not something you vary.) Purpose + Craft + Feel are also
how you articulate an abstract "feeling" goal when a prompt is more vibe than spec.

---

## Research strategy (role-based, not a fixed source list)

Named source lists rot. Instead, pull from four **roles** — your skill fills each with
current sources, and you **discover the best via web search** (galleries/virtuosos
change), rather than trusting a frozen list.

1. **Authority** — the correct baseline + currency source (best-practice principles +
   the official/canonical API for the tech). *This is the "written correctly today"
   guard.*
2. **Product precedent** — how shipped products solve it (Mobbin primarily; polish
   galleries secondarily).
3. **Frontier / virtuosos** — the best current-in-the-wild work (discover via search;
   your skill lists seeds, not fences).
4. **Adjacent fields** — transferable ideas from neighboring domains.

**Rules that replace the list:**
- **Vet** within each role for **popular + recent + authoritative**; use web search to
  find what's currently hot.
- **Currency-check** any external code against the tech's Authority before adopting it
  (stale APIs are a real risk).
- **Weigh + name the mix** — availability ≠ use it; a simple best-practice answer often
  wins. State explicitly whether a concept is best-practice / MCP / external / a
  combination.
- **Cite** the sources each concept drew from — name the **specific** source and its kind
  (e.g. `Motion MCP: generate-css-spring`, `Mobbin: <screen>`, a URL) and distinguish a
  **specific pull** (MCP / tool / URL) from a **broad best-practice**. Keep the index card's
  inspiration line updated as sources are added mid-iteration.

Depth is **adaptive** (Phase 1 Purpose): trivial prompts stop early; high-payoff prompts
go deep.

---

## Generate mechanics (Phase 2)

- **Output** to `_sandbox/<type>/YYYY-MM-DD-shortname/` (today's date; terse kebab slug).
  One folder per surviving concept; versions as subfolders (see Versioning).
- **Register** (default mixed, one each; override for a single-register batch): **safe**
  (proven, ship-ready) · **bold** (higher-risk/reward) · **abstract** (experimental,
  may be impractical).
- **Index / preview page** — a browser page. **At the top:** the batch prompt with a
  **phase toggle (v1/v2/v3)** showing the concise prompt/refinement that led to each version
  (main points only). **Per concept:** a card documenting its idea + 2–3 notes-of-interest +
  **inspiration citations**, and **version links (v1, v2…) that open that version's page
  directly** on click — standalone versions open their HTML file; **Stage-2 versions open the
  Tier-2 playground** deep-linked to that concept+version (`?concept=…&v=…`). (Per-type finer
  hierarchy lives in the skill.)
- **Debug panel** — see spec below. Live-tweak the batch's chosen dials instead of
  regenerating; snapshot a liked setting → a version.
- **Hygiene even in Stage 1:** animate transform/opacity, honor `prefers-reduced-motion`
  in CSS **and** JS, keep timing/easing as named constants, no perpetual rAF/sim left
  running.
- **Run surface — default = Tier 1 (serve the folder).** Serve over http
  (`python3 -m http.server`, `npx serve`, or Live Server) rather than opening `file://`.
  Tiers: **0** = `file://` (CSS + vanilla only) · **1 (default)** = served http, which
  unlocks ES-module imports so a concept can use **real current vanilla Motion via CDN**
  (`import {animate,spring} from "https://esm.sh/motion"`) with no build · **2** = a
  gitignored in-repo `_sandbox/playground/` Vite+React app for **`motion/react`**
  (`useMotionValue`), the granular **`d3`** modules (dataviz), and real **`src/` tokens**
  (real *components* need the app's Tailwind v4 wired in — a follow-up). Version-matched to
  the app (React 19, motion ^12, d3 v3). A **concept switcher** renders the selected one;
  stand up at **Stage 2**
  when a concept needs it. A rung-4 gesture in plain HTML is emulated vanilla
  pointer→CSS-var (or served vanilla-Motion); its graduation path is `useMotionValue`.

---

## Review & decide (Phase 3)

Present each concept in one line (`Concept N ({register}): pushes toward {axis pos}`).
Then per concept: **continue** / **delete** / (default) **save**. Surface type-specific
judging notes (e.g. animation on-device, dataviz interaction-to-judge, ux needs-to-be-
felt). Continue → loop to a **narrowed** Phase 2 (single variable) producing the next
version.

---

## Close out (Phase 4) + Versioning & recall

**Save is the default terminal state** — document everything not explicitly deleted or
mid-iterate.

**Folder layout** (versions are **additive** — a new version never deletes the prior; you
can always reopen an old version, and `notes.md` logs why each existed):
```
_sandbox/<type>/YYYY-MM-DD-shortname/
  concept-a-crossfade-v1.html   ← single-file concept → versions are v1/v2/… FILES
  concept-a-crossfade-v2.html
  concept-b-ripple-v1.html
  index.html                    ← preview/index page linking the concepts + versions
  notes.md                      ← batch: per-concept idea, tags, pros/cons/bugs, version log
```
(Multi-file concepts may use `concept-x/vN/` subfolders instead; single-file HTML uses
`-vN.html`. A deleted concept is removed entirely.)

**Per saved concept** — a stable **slug + freeform tags + status** (saved / iterating),
plus notes: idea/interaction · **pros / cons / bugs** · **graduation-readiness** (what
would change to pull it into production — which inlined tokens become imports, which
scaffolding drops, which rules the real version must satisfy, which components it
composes with). Make graduation a checklist, not archaeology.

**`_sandbox/INDEX.md` — one row per BATCH/experiment** (newest first; create with the
header if missing). Keep per-concept detail (verdicts, pros/cons/bugs, versions) in the
batch `notes.md`, not the INDEX:
```
| Date | Type | Idea (brief context) | Axis / Register | Folder | Verdict | Ready? |
```
*Verdict/Ready?* summarize the batch outcome and flag anything the user plans to graduate
(this skill never graduates it).

---

## Graduation (crossing into `src/`) — provenance protocol

Graduation is the one explicit step that moves an idea from `_sandbox/` into real
production code. Because `_sandbox/` is gitignored and may be cleaned up, leave a
**durable, self-contained provenance trail**, tied by one **provenance tag**
(`sandbox:<batch-shortname>/<concept-version>`, e.g. `sandbox:theme-transition/A-v5`):

1. **Code-site comment (durable, committed).** At the graduation site: what it is · the
   origin (sandbox path + concept + version) · that values were tuned in the playground ·
   a pointer to that batch's `notes.md` · the tag. Must make sense even if `_sandbox/` is
   later deleted.
2. **Central register (committed): `SANDBOX_GRADUATIONS.md`** (repo root) — one row per
   graduation (date · tag · from · concept · to · what/why). One place to scan everything
   that shipped from the sandbox.
3. **Sandbox back-reference (local).** Mark the batch's `INDEX.md` row + `notes.md`
   **GRADUATED \<date\> → \<code path\>** so the exploration shows it shipped, with a pointer
   back to the code. This status is **updated as the outcome settles** (see "Graduation
   outcome" below) — GRADUATED → SHIPPED (as-is) / SHIPPED (changed) / REVERTED — so the
   sandbox never claims something shipped clean when it didn't.

Grepping the **tag** finds all three at once.

**Graduation ≠ closure.** The mark records that a *snapshot* shipped; the sandbox concept
**stays and can be reopened to explore further** (new versions), which may later re-graduate
(update the register/tag) or simply diverge. Drift between the shipped code and continued
sandbox iteration is expected and fine — the sandbox is the exploration space, the code is a
point-in-time snapshot. Never delete a concept just because it graduated.

Also, as part of graduation: convert inlined
values → real constants (with a dated "tuned in playground" comment), satisfy the AGENTS.md
rules (animation ladder · `motion/react` · reduced-motion), compose with real components,
and verify in the real app **+ on-device**.

### Graduation outcome — close the loop (test → tune → decide once → record)

Landing the code is the *start* of finding out what actually ships, not the finish. The
sandbox proved the idea; the real app is where it meets real data, real components, and real
engines — often with surprises (this is exactly where a clean-in-Chrome fade turned out to
stall on mobile WebKit and got re-mechanised). Run the loop, then record where it lands:

1. **Test on both web AND mobile.** Typecheck/build, verify in the real app on desktop *and*
   on a real phone (a pushed preview — a phone needs a real URL). This app's bugs hide on one
   or the other (WebKit-only jank, touch-scroll interactions), so one platform passing isn't a
   pass.
2. **Fine-tune, and log drift as you go.** Iterate on the real thing — values drift, and an
   approach may be swapped wholesale (a per-element CSS transition that stalls on-device → a
   View Transitions dissolve). Record each non-trivial change in the **Drift log** at the bottom
   of `SANDBOX_GRADUATIONS.md` (dated · tagged · the reason). Divergence from the sandbox is fine
   and expected — the goal is a truthful record of where it *actually* landed, so a later sandbox
   revisit knows what did and didn't hold up in real code.
3. **Decide ONCE, when testing is done.** The outcome is a single final call at the *end* of
   testing — you do NOT re-decide "commit vs revert" at every iteration. While testing, the
   graduation sits in an interim **`IN PROGRESS`** state (flag it in the register, e.g.
   `Status: testing in progress`). When done, land on one terminal outcome and set it in *all*
   the provenance places (the tag ties them together):

   | Outcome | Means | Record as |
   | ------- | ----- | --------- |
   | **Committed as-is** | Ships ≈ the sandbox snapshot | Register + sandbox back-ref: `SHIPPED (as-is)`, plus any notes |
   | **Committed with changes** | Ships, but altered — different values, or a different *mechanism* than the concept | Register + Drift log describe *what* changed and *why*; back-ref: `SHIPPED (changed: <what>)`. Divergence is fine — just record where it truly ended up |
   | **Reverted / not shipped** | Tried in code, decided against (didn't work; or worked but not worth the cost) | **Revert the graduated changes to their pre-graduation state** — restore whatever the graduation *added or altered*, so no working/existing code is broken (a revert, not a blind delete). Leave a code-side note it was *tried* (DESIGN_SYSTEM.md + register `REVERTED (<why>)`), and mark the sandbox concept `tried in code → reverted (<why>)`. Keep it — a negative result is a result, and the sandbox stays reopenable |

4. **Log the decision on both sides, concisely.** Code side: the general logic + *why* in
   `DESIGN_SYSTEM.md` (reasoning, not play-by-play) — *especially* for a revert, since the
   implementation was reverted back out and this note is the only record it was attempted. Sandbox side: the
   outcome status in the batch's `notes.md`/`INDEX.md`, so reopening the concept later starts
   from "here's what we tried in code and what happened," not a blank slate.

**Pausing is allowed, but flag it.** If you must step away mid-testing (a break, a context
switch), leave the graduation clearly in `IN PROGRESS` / `PAUSED — resume <what's left>` in the
register — never a silent half-state that reads as finished. **The norm is to close the loop
(test → decide → record) before moving on to new work**; a dangling graduation stuck in testing
limbo is exactly what this protocol prevents.

**Both directions must tell the current truth.** The sandbox is where it was explored, the code
is where it landed — each points at the other with the *live* status, so neither lies.
"Committed with changes" and "reverted" are first-class, expected endings: most good ideas ship
altered, and some correctly don't ship at all. A concept that quietly diverged with no note — a
sandbox row still boasting "SHIPPED" over reverted code, or a graduation abandoned mid-test with
no flag — is the exact failure mode this protocol prevents.

**The outcome decision closes the `run <sandbox-skill>` loop.** Signing off on the final outcome
(committed as-is / with changes / reverted) is the signal that this cycle is complete — the full
arc from Phase 0 intake through graduation and its outcome. (A run that never graduates closes
earlier, at Phase 4 close-out.) Closing isn't deletion: to revisit later, **re-run the skill and
reference the sandbox experiment to reopen** — the tag + back-refs are how you find it, and the
recorded outcome tells you what already did or didn't hold up in code, so you resume from that
state, not a blank slate.

## Debug panel spec (shared)

Wire the batch's **chosen dials** to live controls on the concept/index page, so tweaking
replaces regenerating.
- **Sliders first** (cheapest): timing/physics (duration · delay · spring
  stiffness/damping/mass) · stagger · opacity/scale/rotation ranges · free-color pickers.
- **Toggles / presets** (medium): trigger · style/era · rendering · shape-swap ·
  entry-point variants.
- **Regen-only** (structural): deep choreography / representation restructures → a new
  version.
- **Requirements:** plain-language labels · **collapsible/expandable** (hideable) ·
  **scroll on overflow** when expanded.
- **Snapshot → version:** when a live-tweaked setting is worth keeping, snapshot it as the
  next `vN` (this is what makes v1→v2→v3 cheap).

---

## Project context / assumptions (Konomi)

> The only project-coupled section. To reuse this framework elsewhere, swap this block.

- **Scratch space:** output → `_sandbox/animation/` · `_sandbox/dataviz/` · `_sandbox/ux/`;
  log → `_sandbox/INDEX.md`. `_sandbox/` is **gitignored · cursorignored · tsconfig-
  excluded** — it never touches production or the typecheck.
- **How experiments run:** **standalone**, NOT part of the Next app. "Import from `src/`"
  means *reference* `src/app/globals.css` or *copy* token values from
  `src/lib/konomi/tokens.ts` / `themes.ts` — not a live module import.
- **Tokens:** `src/lib/konomi/tokens.ts`, `src/lib/konomi/themes.ts`,
  `src/app/globals.css`. Seed color/size/timing from these once we're in Stage 2.
- **Currency authorities:** animation → the **Motion MCP / Codex** (current API; imports
  are `motion/react`, never `framer-motion`). dataviz → **AGENTS.md's locked d3 stack** +
  pinned d3 v7 modules + DESIGN_SYSTEM's d3 log (no d3 MCP exists; **never** `d3-selection`
  /`d3-transition`/the `d3` monolith — React owns the DOM, Motion animates). ux → the
  `figma-*` skills (MANDATORY before `use_figma`/`create_new_file`/`get_design_context`).
- **MCPs:** `motion` (animation authority + spring/curve viz + MotionScore) · `mobbin`
  (product precedent — flows/screens/sections, iOS+web, top-rated/popular) · `figma`
  remote (default prototype authoring to canvas) with `figma-desktop` as fallback.
- **On-device lore:** this project has WebKit/Safari-only motion bugs (stroke shimmer in
  animated containers) that never repro in headless Chromium. Browser/localhost is fine to
  *start*; judge anything animated on the **physical iPhone** before it graduates. These
  are *Stage-2* concerns — don't let them constrain the Stage-1 unconstrained round.

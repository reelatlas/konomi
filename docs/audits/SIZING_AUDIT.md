# Control sizing audit — frozen pre-migration baseline

**This file is canonical.** The claude.ai artifact version (📐
`7fd2bca7…`) is a shareable view and may lag; when they disagree, this
file wins. Raw per-control data lives in
[`sizing-inventory.json`](./sizing-inventory.json) — regenerate with
`node scripts/audit-controls.mjs` (dev server on :3000; the script
verifies its registry against source and warns on drift). **Every later
sizing/type/elevation pass diffs against this baseline instead of
re-measuring by hand.**

Baseline capture: commit `8de284c`, clean tree, 1400×1000 @ DPR 1,
default theme, film side, level 3 seeded. Numbers below are always
**authored → measured** pairs (project rule: one without the other is
unverifiable). Mobile rows are **emulated** (390×844 @ DPR 3) — the
user's iPhone remains ground truth for feel.

**Theme invariance (stated, not swept):** themes cannot change geometry —
`ThemeColors` (types.ts) carries only color strings; the theme system has
no channel for a size, border width, or spacing. Geometry is therefore
captured in the default theme only; dark/third capture colors + contrast.

---

## 1 · The height problem

Five interactive heights; only 44 is a named token. 30 is a raw number in
IconButton's `SIZE_PX` map; 36 is authored nowhere.

| Height | Named? | Who renders it (authored → measured) |
|---|---|---|
| 24 | no (`h-[24px]`) | header search field — 24 → 24 |
| 27 | no (derived) | tag chips: `py-xs(4×2) + line 15 + border 2×2` → 27 |
| 30 | no (`SIZE_PX.sm`, `h-[30px]`) | sm buttons, tabs, icon buttons — 30 → 30 |
| 36 | **no — emergent** | Level/Sort/Min Match — see §4 verification |
| 44 | **yes** `--control-h-md` | slots, mixbar buttons, RECOMMEND — 44 → 44 |

Touch: 24/27/30 all sit under the 44px iOS / 48dp Android minimums; the
smallest is the search field, the app's post-v2 primary entry point.

Same control, two sizes by *location*: Clear renders 44 in the mixbar and
30 in the header (both ActionButton, different size prop chosen per
surface).

## 2 · New findings from the states pass

These were not in the first audit round and change the migration scope:

- **Hover feedback is absent on every standard control.** Measured
  hover-vs-rest computed styles for all 19 registry entries: zero changes
  in background/color/border/shadow/opacity on buttons, chips, tabs,
  segments, or the search field. The only hover affordances in the app
  are `cursor: pointer` and the glow-bloom on the few `.glow-host`
  controls (meta lock readout, filter icon, grip). CTA consistency is
  currently resting-state-only — **hover states are un-designed, not
  inconsistent.** New work item.
- **Three focus regimes coexist.** Measured `:focus-visible`: the pool
  controls fixed in search v2 use the inset ring (`2px solid, offset
  -2px`); every other control uses the UA default (`1px auto`); and the
  **search field suppresses focus entirely** (`outline-none` with no
  replacement — an accessibility gap on the primary entry point).
  Target: one regime (the inset ring utility) app-wide.
- **Transitions are ad hoc and untokenized.** Only 4 of 19 controls have
  any transition (tab dim 150ms, slot transform 75ms, readout colors
  500ms) — all Tailwind-default easings, no duration/easing tokens
  exist. Buttons have none, consistent with having no hover states to
  transition to. Decide alongside hover design.
- **Contrast failures (WCAG AA = 4.5:1 normal text):**
  - Header meta readouts (muted-on-surface): **2.44:1** default theme,
    3.63 dark, **2.08 third** — fails everywhere, worst in third.
  - Disabled RECOMMEND (disabled-text on disabled-bg): 2.5–2.6 default,
    **2.02 dark** — disabled is AA-exempt but ≥3:1 is the accepted floor.
  - Filled slot measured 3.02:1 — **flagged, needs a per-element
    re-measure** (the capture may have read the container's inherited
    color rather than the label's).
  All other controls measure 10:1+ (the ink-on-surface system is very
  strong).
- **Dead tokens / variants** (explicit-usage grep; defaults excluded):
  `--elev-5` 0 uses · `--space-3xl/huge/page` 0 uses · `--elev-3` 2 ·
  `--border-hair` 2 · `--text-base` 2. IconButton `border="thin"` /
  `shape="square"` show zero *explicit* uses because they are the
  defaults — not dead.

## 3 · Type, elevation, spacing usage

| Type token | Size | Uses | Elevation | Offset | Uses |
|---|---|---|---|---|---|
| 2xl | 30 | 1 | elev-1 | 2px | 7 |
| xl | 26 | 2 | elev-2 | 3px | 15 |
| lg | 20 | 2 | elev-3 | 4px | 2 |
| md | 18 | 3 | elev-4 | 5px | 7 |
| **base** | **13** | **2** | **elev-5** | **8px** | **0** |
| sm | 12 | 7 | 2-accent | 3px | 1 |
| xs | 11 | 19 | 3-accent | 4px | 3 |
| 2xs | 10 | 16 | | | |
| 3xs | 9 | 4 | | | |

Mono 47 uses / display 10 / body 7 — a mono-label interface with display
headlines. The working range is 9–12px; the nominal body size (13) is
vestigial — and the app's one true *reading* surface, the card-back
synopsis, renders `--text-sm` **12px** body font. Shadow is assigned by
component identity (same header row, same 30px size: Tag Pool elev-2,
Clear none, Filter none), not by any hierarchy rule.

## 4 · The two verified claims

**36px is emergent, confirmed by arithmetic.** Level option button:
measured `h = 32 = 16px authored line-height + 8+8px --space-md padding`;
segment wrapper = 32 + 2×2px rendered border = **36**. No height property
exists anywhere in the chain. The ActionButton precedent applies exactly
(that component got fixed heights after two byte-identical buttons
rendered 0.5px apart on glyph metrics); these three controls pre-date the
fix. Note the derivation is *doubly* fragile: it also embeds the border,
whose rendered width is itself a rounding outcome (below).

**The border scale is two steps, not three — at every DPR (Chromium).**
Screenshot pixel-runs of rendered borders (device px):

| Authored | DPR 1 | DPR 2 | DPR 3 |
|---|---|---|---|
| hair 1.5px | 1 | 2 | 3 |
| thin 2px | 2 | 4 | 6 |
| base 2.5px | **2** | **4** | **6** |

`--border-base` (2.5) and `--border-thin` (2) render **identically at
DPR 1, 2, and 3** — Chromium floors fractional border-widths, so the
0.5px step never paints, and even the earlier "should survive on retina"
prediction was wrong. `hair` floors to 1px. Reality: a 1px/2px two-step
scale wearing three names. Caveat: Chromium-measured; confirm WebKit
on-device before collapsing the tokens (Safari has historically handled
fractional borders differently).

## 5 · Responsive form map + mobile spot pass

Static rungs (from source): mixbar ladder `@min-975 / @max-974 / 654 /
525 / 481` (525/481 flagged for re-bisection — bisected when Tag Pool
still occupied the row) · header sibling forms at `480` · surfaced
Random `@max-481` · RECOMMEND icon form `1070/1071` viewport.

Emulated 390×844@3 spot pass: search field **156×24** (the `40vw` fluid
term, the only fluidly-sized control in the app) · Tag Pool icon form
30×30 · Min Match collapsed 34.8×36 · RECOMMEND 44×44 · slot 78×44 ·
surfaced Random 101.6×44 · mixbar Clear/Random correctly hidden by rungs.
Controls swap fixed-size sibling forms rather than resizing — which is
why a full mobile measurement axis was scoped out.

---

## 6 · Agreed target state (ruled 2026-07-26)

The migration destination, recorded beside the baseline so later passes
diff toward something explicit:

- **Two tiers, by row, not by component.**
  `--control-h-md = 44` (exists): mixbar buttons + slots + RECOMMEND +
  the whole header row (search field, Tag Pool, **Filter icon button** —
  tier follows the row) + Level/Sort/Min Match segments.
  `--control-h-sm = 30` (to mint): chips, section tabs, card lock/swap,
  **panel icon buttons** (close/snap/grip — user-confirmed dense).
  The 36 tier dissolves — it only ever housed the emergent accident.
  Within a row, differentiation is by variant (fill/border/shape), never
  size; "smaller to stand out" is rejected (smaller recedes).
- **Fixed heights everywhere** — no padding-derived control boxes
  (ActionButton's own fix, applied to the segments).
- **Type:** chips 10 → 11 (absorbed by the fixed 30 box); `--text-base`
  13 → **14**, with the card synopsis (currently 12px) adopting it.
  Label register (11px uppercase tracked mono) unchanged. Sub-tab labels
  stay 10 (label register, not reading text).
- **Icons scale with tier:** 16px at dense, 20px at control (16 in a
  44×44 box reads undersized).
- **Shadow encodes tier, not identity:** 2px (elev-1) dense · 3px
  (elev-2) control · 5px (elev-4) surfaces/hero. The floated 1px was
  rejected — a blur-less offset at 1px reads as an artifact, not depth.
- **Padding derives from tier** (dense `--space-md/--space-xs`, control
  `--space-xl`), from the space scale, never fresh literals. Whether
  control-tier px widens 16 → 20 is a density taste call to eyeball
  during migration, not pre-decided.
- **Focus: one regime** — the inset-ring utility app-wide, including a
  real ring on the search field (currently suppressed).
- **Hover: to be designed** — currently absent everywhere; decide the
  treatment (and transition tokens) as its own migration step.
- **Touch targets:** a *shared* expanded-hit-area utility for dense-tier
  controls (per-component padding drifts) — knowing `overflow: hidden`
  clips hit areas exactly like it clips focus rings, so chips inside
  scroll containers may need real size instead. The header at 44 solves
  its own row outright.
- **Candidates pending rulings:** collapse `--border-base`/`--border-thin`
  after a WebKit on-device check; retire `--elev-5`,
  `--space-3xl/huge/page` (0 uses); fix meta-readout + disabled contrast
  (worst: 2.08 and 2.02 in third/dark).

## 7 · Migration sequence

Each step ships and evaluates independently: ① mint `--control-h-sm`,
tokenize the scale ② fix the three padding-derived controls (36 → 44
per target) ③ tier-by-role pass across all four surfaces (header to 44)
④ shadow/border semantics (incl. WebKit border verdict) ⑤ type pass
(chips 11, base 14, synopsis adoption) ⑥ hover + focus + transition
design (new scope from §2) ⑦ re-bisect the mixbar rungs (last — every
size change above invalidates them).

---

## 8 · Migration log

Diffs are against the frozen baseline (`16b882d` version of
`sizing-inventory.json`); the committed JSON always reflects the current
state.

**Batch 1 (2026-07-26) — tiers minted, header + segments to 44, one
focus regime.** Steps ①②③ plus the focus half of ⑥ (pulled forward by
user ruling: one consistent regime now, hover deferred).
- `--control-h-sm: 30px` minted (globals.css + tokens.ts `CONTROL_H`);
  IconButton `SIZE_PX.sm` and ActionButton `SIZE_CLASSES.sm` now consume
  it — no raw 30s remain.
- Fixed heights replace the emergent boxes: Level/Sort/Min Match
  wrappers at `h-[var(--control-h-md)]`, buttons flex-centered, `py`
  dropped (the native select centers its value in a fixed box).
- Header row to the control tier: row min-h, search field (24 → 44,
  px-md → px-lg), Tag Pool / Clear (ActionButton sm → md, responsive
  display moved to wrapper divs — md bakes `inline-flex`), Filter
  (IconButton sm → md), search icon button md.
- `.focus-ring-inset` is now THE focus regime: baked into ActionButton +
  IconButton base classes, added to TagChip, the segments, the native
  select, and the search field (whose ring was previously suppressed
  outright). Documented deviation: the collapsed Min Match/Density
  buttons keep `[outline:none]` (own strong focus affordance —
  hint + RollingLabel).
- Measured result: every control-tier element reads exactly 44
  (search field, Tag Pool, Filter, Clear, Level segment, Sort select,
  Min Match, mixbar buttons, RECOMMEND); regenerated inventory diff
  showed exactly the 8 intended height changes + 11 focus unifications
  and **zero unexpected deltas**. All suites + drivers + build green.
- Still open from the sequence: shadow/border semantics (④ — WebKit
  border verdict pending), type pass (⑤), icon tier-scaling 16/20,
  hover + transitions (⑥, deferred by ruling), rung re-bisect (⑦).

**Batch 2a (2026-07-26) — reading size committed, control-tier icons,
iOS focus-zoom fix.** Step ⑤'s type half (chips deferred to 2b — their
fixed-30 box couples into TagScrollArea's ROW_STEP math and the card
tag-area tokens, a deliberate separate commit).
- `--text-base` 13 → **14** (globals.css + tokens.ts): the committed
  reading size. The card synopsis — the app's one true reading surface,
  previously at `--text-sm` 12px — adopts it; the empty-state
  instruction/payoff lines (base's only prior users) ride along.
- Control-tier icons 16 → **20px** (whole box, uniform scale of the
  24-viewBox glyphs): search/Tag Pool/Close/Filter in the header, Eraser/
  Dice/Tag/GreaterEqual in the mixbar. Explicit per call site, NOT a
  blanket `[&_svg]` selector — RecommendButton's decorative star layers
  share the ActionButton subtree and must not be caught. Dense-tier
  icons stay 16.
- **iOS input focus-zoom suppressed** (user-reported: keyboard zoom blew
  the viewport past 100%, hiding the panel + cards search exists to keep
  visible): `viewport.maximumScale = 1` (layout.tsx). Not an a11y trade —
  since iOS 10 Safari ignores the cap for user pinch and honors it only
  for the automatic sub-16px-input focus zoom. Confirm on-device.

**Parked-by-ruling (2026-07-26, user):**
- **Possible 44 → ~40 control tier**: the offset shadows (2-5px, ~3 min)
  add visual weight beyond the box, so 44 may read larger than intended;
  a smaller tier + the shared invisible-hit-area utility could keep
  mobile accessibility. DELIBERATELY not decided until the remaining
  steps land — the type/shadow passes may change the read. Documented
  compromise: the data-dense tag UI may sit below strict touch-target
  best practice by choice.
- **Resize points + wrap/truncate/hover-overflow-scroll** re-evaluation
  (incl. mobile): parked until after the sizing migration completes.

**Batch 2b (2026-07-26) — chips to the dense tier, coupled math
re-derived.** TagChip small: fixed `h-[--control-h-sm]` box (py-derived
27 gone) + `--text-xs` 11px (chips are read, not just labeled).
Knock-ons re-derived, not guessed: TagScrollArea `ROW_STEP_PX` 33 → 36
(30 chip + 6 gap), natural height 121 → 130; globals card tokens
clamp(96, h−308, 137) → **clamp(102, h−299, 146)** — the cover's flat
portion is 9px shorter, an accepted consequence of the taller chip rows.
Found + logged: **TagChip `isBase` has zero call sites** (both callers
pass size="small") — dead-variant candidate. Inventory diff vs 2a:
exactly the 6 intended chip deltas (h/font/padding × pool + card), zero
collateral; card measured at its 445 ceiling with tag-area token
resolving to the new clamp. All suites green.

**Batch 2c (2026-07-26) — chip length-tiered downsizing.** TagSlot's
fontSizeClassFor precedent extended to small chips (user-ruled): names
>24ch step to 10px, >32ch to 9px, so a wrap inside the fixed 30 box
stays smooth (two 9px lines fit). Deliberate aesthetic-over-strict-a11y
compromise for the long tail, documented at the helper. Thresholds sized
to the result card's ~196px tag area (the one width-constrained chip
surface). User notes banked: the 14px reading size + 11px chips are a
"huge improvement" on mobile (likely keep; final call at end-of-migration
review with everything else); iOS focus-zoom fix confirmed working
on-device.

**Batch 2d (2026-07-26) — sub-tab register bump + fixed badge boxes.**
Sub-tabs 10 → 11px (`--text-xs`, the workhorse label register — sub-tabs
are interactive nav; primary:sub ratio 2.0 → 1.82) with `leading-[16px]`
pinned (11 × 1.5 = 16.5 would be fractional). The anime Theme inline
group labels follow (same semantic tier). Badges: fixed whole/even boxes
now (h-20 primary / h-14 secondary; text stays 2xs 10 — the badge
register is uniform across tiers), replacing padding-derived 20/13 —
and the 14 restores whole-pixel centering under the 16px label line
((16−14)/2 = 1; the old 13 would have sat on a half pixel). Measured:
label 11/16 exact, badge centers equal label centers to the hundredth.
Overlay floor 196 → 198 (rows 57 → 58). WebKit border finding
(user-measured, iPhone screenshot in Figma): **the 0.5px step DOES
render on iOS** (~3 vs ~3.5px at DPR 3) though "extremely hard to
notice" by eye — the border scale renders two-step on Chromium,
three-ish on WebKit only. Verdict OPEN, options tabled.

**Batch 3 (2026-07-26) — border verdict executed + the three subtext
registers.** Border: **option A ruled and shipped** — `--border-base` is
2px, `--border-thin` DELETED (all 15 class usages migrated; IconButton's
"thin" prop option retired, default now "base"). User's reasoning
banked: no weight hierarchy was ever intended; cross-engine consistency
is the requirement — this lands as a FIX (desktop pixel-identical; iOS
base elements imperceptibly lighter). Option B (real 2/3 whole-pixel
hierarchy) stays noted for a possible shadow-pass exploration.
Subtext registers shipped as utility classes (globals.css, the
focus-ring-inset precedent): `.text-label` (static control labels — 10
bold tracking-xl uppercase; renamed from "caption" per user),
`.text-hint` (transient bare helpers — 11 regular subtext; selector
hints, panel empty hints, and the search count line joins at 11), and
`.tooltip-chip` (boxed transients — chip container + 11 **regular**,
user-ruled over bold: error chip, icon tooltips, swap hint; the
ThemeSwitcher narrow variant inlines the recipe under its breakpoint
with a cross-ref). Governing rule: 10 = quiet static labels, 11 =
anything that talks to you. Verified live: label 10/700, tooltip
11/400/2px/elev-1, hint 11/400/subtext. Ops note: Turbopack served
stale CSS through TWO restarts — the second "restart" raced the dying
listener (port never freed, new server EADDRINUSE'd silently, old one
kept serving). Kill → wait for port free → rm -rf .next → start.

**Batch 3b (2026-07-26) — badge ink centering + a windfall recorded.**
User spotted badge digits sitting high; pixel-scanned: ink 6px above /
8px below center (primary), 3/5 (secondary) — the mono font reserves a
descent zone digits never use, so flex centered the line box, not the
ink. Fixed with the purpose-built property: `text-box: trim-both cap
alphabetic` on an inner block span (the property applies to block
containers — on the flex badge itself it computes but trims nothing,
confirmed live). Post-fix pixel scan: 7/7 and 4/4 exactly. Engines
without text-box keep the old half-pixel-high look. Windfall: the
border collapse (2.5 → 2) FIXED the long-accepted iOS dashed-border
clip — the fractional width was the culprit; the empty state's full
dashed perimeter now renders on mobile for the first time
(user-confirmed; both "accepted, don't fix" notes updated to resolved).

**Batch 4 (2026-07-26) — shadow tiers, user-ruled groupings.** Depth
encodes tier: elev-1 2px (card lock/swap, carousel arrows, card-back
stream chips + description panel — restored after the zero preview),
elev-2 3px (ActionButton/IconButton outside the header, segments,
ThemeSwitcher), elev-4 5px (cards, overlay, mixbar, filter popover,
RECOMMEND — kept at hero by ruling), the masthead's 8→4 morph as its own
distinct tier (inlined by design), and a broad ZERO tier: the whole
header row (flat by ruling — ActionButton gained a `shadow` prop as the
one off-switch, no per-component logic), all tags/chips, tabs/sub-tabs,
all badges, tooltips (.tooltip-chip sheds elev-1), empty slots, panel
grip/snap/close. Tokens: --elev-3/--elev-5/--elev-2-accent DELETED;
--elev-3-accent renamed **--elev-2-selected** (the accent→selected
rename, avoiding the ActionButton accent-variant collision) and the
filled slot normalized 4 → 3px to its control tier — the one
shadow-COLOR rule: selected/loaded keeps tier depth, swaps ink →
secondary. The slot's pad-then-cancel coupling in MixerBar re-derived
4 → 3px. TagChip's dead `base` variant DELETED outright (user-confirmed;
size prop gone, both call sites cleaned). Two flagged MY-CALLS pending
veto: RatingBadge → zero (badge-register consistency beside
TagCountBadge) · filter popover → elev-4 (floating-surface family).
Measured live: header all none; mixbar 3 / RECOMMEND 5 / slot selected 3
/ lock 2 / faces+mixbar card 5 / chips+badges none. All suites green.

**Batch 4b (2026-07-26) — two vetoes executed + slot word-fit fix.**
RatingBadge back to elev-1 (user-ruled into the dense-accent tier with
lock/swap + card-back chips/panel — it sits on arbitrary art;
TagCountBadge keeps its own mechanics as intended). Filter popover back
to elev-2 (user: the tag panel is the heavy surface; future
overlays/dropdowns should stay light at 3). Shared-component shadow
logic confirmed as the reuse mechanism: ActionButton `shadow` prop (new)
+ IconButton `shadow` prop (existing) — location decides, headers pass
off. PARKED idea logged: a possible header-specific visual/size variant
or toggle, later. TagSlot fix (user-reported: "shapeshifting" hugged the
right border): the size-tier function now also tiers by LONGEST WORD
(measured: 62px content box; Zen Kaku black ≈5.5/5.1/4.6/4.2 px/char at
12/11/10/9 → one-line fits ≈11/12/13/14 chars, thresholds keep a
one-char buffer), taking the smaller of length-tier and word-tier, plus
a break-words backstop so nothing can ever bleed into the border —
symmetric padding by construction. Verified: shapeshifting → 9px, fits;
heist 12 / cyberpunk 11 / de niro 11 unchanged.

**Batch 4c (2026-07-26) — RECOMMEND to the control tier, the accent
rename, tooltip shadow restored.** RECOMMEND elev-4 → elev-2
(user-ruled: it stood out too much at 5; its color already carries the
emphasis) — ALL button variants now sit at elev-2, and elev-4 is purely
the surface tier (cards / overlay / mixbar). Color rename executed:
`--secondary`/`--on-secondary` → **`--accent`/`--on-accent`** (token,
themes.ts fields accent/onAccent, ThemeColors interface) — user:
"secondary" obscured that this IS the app's pop color. The ActionButton
variant that shared the word renamed **`accent` → `cta`**
(accentColor → `ctaColor: "primary" | "accent"`; DEFAULT_ACCENT domain
updated) so the variant names a ROLE and the token a COLOR — collision
deleted, not relocated. SectionTabStrip's size="secondary" is a
different domain (tab tiers) and deliberately untouched. Pure rename:
computed colors verified identical (RECOMMEND lime bg, slot selected
shadow lime, --accent #e4f46f). Tooltip-chip back to **elev-1**
(user re-ruled after living with zero: "feels weird without it") —
joins the dense-accent tier.

**Batch 5 (2026-07-27) — the 40 trial.** `--control-h-md` 44 → **40**
(user-ruled after a rendered 44-vs-40 comparison: the 2-5px offset
shadows add visual weight beyond the box, so 44 read heavier than
intended). The 44pt touch minimum is now met by **`.touch-44`** — a
shared transparent `::after` expanding every control-tier hit area 2px
per side (ActionButton md, IconButton md, TagSlot, segment option
buttons) — instead of by box size; documented limits: clip ancestors
clip hit areas (slots at scroll edges), and native input/select render
no pseudo-elements (search field + Sort select stay at their real 40px
box). RECOMMEND's star composition verified intact at 40; slot 2-line
wrap verified. Inventory diff: exactly the 12 tier-height deltas
(44→40 everywhere; level options 40→36 wrapper-stretch), zero
collateral. Rung note: the icon forms narrowed 4px, which makes the
already-conservative post-Tag-Pool rungs MORE conservative — safe
without re-bisection (still parked for last). Revert = one token line +
dropping .touch-44 call sites. TRIAL status: user evaluating on mobile.

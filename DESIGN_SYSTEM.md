# Konomi design system

Human-readable reference for the token set defined in [`src/lib/konomi/tokens.ts`](src/lib/konomi/tokens.ts) and [`src/lib/konomi/themes.ts`](src/lib/konomi/themes.ts), mirrored as CSS custom properties in [`src/app/globals.css`](src/app/globals.css). Those three files are the single source of truth — this document is a snapshot of what they currently contain, not a second copy to maintain by hand.

## Colors — 3 theme palettes, 12 semantic roles each

Every color is a **role**, not a hue, so the same class (`bg-[var(--surface)]`, `text-[var(--ink)]`, etc.) works unchanged across all three themes. Switching themes is just changing the `data-theme` attribute on the app root.

| Role | Default ("Konomi") | Dark ("Tide") | Third ("Newsprint") |
|---|---|---|---|
| `bg` | `#EFE7F8` | `#12181C` | `#F3EDE1` |
| `surface` | `#FCFAFF` | `#1C242A` | `#FFFDF6` |
| `ink` | `#191225` | `#DCE4E6` | `#211C17` |
| `muted` | `#A985E2` | `#66727B` | `#B3A589` |
| `fill` | `#E4D7F4` | `#26323B` | `#EBE0CB` |
| `primary` | `#564FD6` | `#3486B4` | `#D8392E` |
| `secondary` | `#E4F46F` | `#6FD3D6` | `#F2C14E` |
| `onPrimary` | `#FCFAFF` | `#EAF3F5` | `#FFF7EC` |
| `onSecondary` | `#191225` | `#0E1518` | `#211C17` |
| `disabledBg` | `#D9CCEC` | `#243038` | `#E3DAC8` |
| `disabledText` | `#9A8BB5` | `#515E66` | `#A99B82` |
| `slotEmpty` | `#F4EEFB` | `#1B2329` | `#F1E9DA` |

## Spacing scale

4 · 6 · 8 · 12 · 16 · 24 · 32 · 48 · 60 (px)

| Token | Value |
|---|---|
| `xs` | 4px |
| `sm` | 6px |
| `md` | 8px |
| `lg` | 12px |
| `xl` | 16px |
| `2xl` | 24px |
| `3xl` | 32px |
| `huge` | 48px |
| `page` | 60px |

## Typography

**Fonts:** Anton (display/headlines), Zen Kaku Gothic New (body/Japanese), Space Mono (mono/UI labels) — loaded via `<link>` in `layout.tsx`, applied via `.font-display` / `.font-body` / `.font-mono` utility classes in `globals.css`.

**Weights:** `bold` (700), `black` (900) — via Tailwind's own `font-bold` / `font-black` utilities, which happen to match these exactly.

**Line-height:** `display` (0.86, tight display headlines), `tight` (1.05, card titles).

**Size scale:**

| Token | Value | Used for |
|---|---|---|
| `2xs` | 10px | smallest chip/label text |
| `xs` | 11px | meta text, hints |
| `sm` | 12px | badges, base chips |
| `base` | 13px | body copy, ranks |
| `md` | 18px | section sub-labels, card titles |
| `lg` | 20px | button/header text |
| `xl` | 26px | section headings |
| `2xl` | 30px | page-level headings |
| `cover` | 70px | card cover-art initial letter |
| `wordmark` | `clamp(44px, 8vw, 78px)` | "KONOMI" wordmark |
| `wordmarkJp` | `clamp(22px, 4vw, 38px)` | "好み" wordmark |

## Letter-spacing (tracking)

0.01 · 0.02 · 0.03 · 0.04 · 0.06 · 0.08em

| Token | Value |
|---|---|
| `xs` | 0.01em |
| `sm` | 0.02em |
| `md` | 0.03em |
| `lg` | 0.04em |
| `xl` | 0.06em |
| `2xl` | 0.08em |

## Borders & radii

| Token | Value |
|---|---|
| `border-hair` | 1.5px |
| `border-thin` | 2px |
| `border-base` | 2.5px |
| `radius-none` | 0 |
| `radius-chip` | 2px |

## Shadows (elevation)

Hard "manga" offset-shadows — no blur, just an offset rectangle in a flat color. Composed at the usage site since the color is theme-dependent.

| Token | Offset | Color |
|---|---|---|
| `elev-1` | 2px 2px 0 | ink |
| `elev-2` | 3px 3px 0 | ink |
| `elev-3` | 4px 4px 0 | ink |
| `elev-4` | 5px 5px 0 | ink |
| `elev-5` | 8px 8px 0 | ink |
| `elev-2-accent` | 3px 3px 0 | secondary |
| `elev-3-accent` | 4px 4px 0 | secondary |

The `-accent` pair exists for the two "selected/filled" states (an active tag chip, a filled mixer slot) that pop against the theme's secondary color instead of ink.

## What's intentionally *not* tokenized

A few categories of number show up in components but aren't part of the scale above — they're one-off implementation details, not reusable design values, so folding them into `tokens.ts` would just be noise:

- **Component-specific layout dimensions** — card height (293px), cover art height (114px), mixer slot height (92px), icon button size (30px), grid column minimum (208px), flex-basis breakpoints (250px/280px/460px), etc. These describe *one component's* geometry, not a shared scale.
- **Decorative one-offs** — the two halftone dot patterns (9px tile on the page background, 8px tile on card covers — intentionally different, matching the original design), the starburst clip-path and its two circle sizes, badge/tilt rotation angles, theme-swatch gradient (necessarily inline — see below).

## Known intentional deviation

`TagScrollArea`'s scroll arrows (▲/▼) use `text-[8px]`, which is below the smallest defined type step (`2xs` = 10px) — and stays that way deliberately. These are functional scroll-control glyphs inside an 18×16px button, not typographic content, so they don't need to track the type scale the way body/label text does. Documented in a code comment at the call site.

## One documented exception

`ThemeSwitcher`'s theme-preview swatches use an inline `style` (not a token/Tailwind class) for their gradient background, because each swatch must render a *specific* palette's raw colors regardless of which theme is currently active — something CSS custom properties can't express (they only resolve to the active theme) and Tailwind can't express either (the gradient stops are dynamic per-palette data, not enumerable as static classes). This is called out in a code comment at the call site.

## Tag Pool hierarchy

The Tag Pool section (`TagPoolSection.tsx`) groups its ~280 tags/genres into 5 top-level sections (Genres, Theme, Setting, Characters, Demographic — "Characters" is a display-only rename of what's still keyed/categorized as `cast`/`Cast-*` throughout the code). Only Theme further splits into labeled subsections (Action, Fantasy, Sci-Fi, etc.) — Setting and Characters merge their categories into one flat list each (same tags, no subsection grouping shown), and Genres/Demographic were always flat. The hierarchy itself (which AniList categories merge where, default expand states) is static config in `src/lib/konomi/tagPool.ts` — not duplicated in the component.

**Section headers** (`CollapsibleSection.tsx`): a smaller variant of the standard section-header pattern — `font-display text-[length:var(--text-lg)] uppercase tracking-[var(--tracking-sm)]` — deliberately *without* the Japanese-subtitle flourish that Mixer/Recommendations/Tag Pool itself use, since that's reserved for app-level sections, not nested groupings inside one. A `▾`/`▸` glyph (plain text, matching `TagScrollArea`'s existing precedent of using unicode glyphs instead of SVG icons for small directional controls) sits at the trailing end of one inline cluster with the title (`GENRES ▾`, not pushed to the far right) — the header *button* itself still spans the full row width for a larger click target, only the visible text/chevron are grouped tightly. The selected-count badge (see below), when present, sits between the title and the chevron (`GENRES 2 ▾`) — it's information about the section, so it groups with the title, while the chevron stays last as the trailing control indicator.

**Collapse persistence**: expand/collapse is per-section, localStorage-backed (`konomi:tagpool:section:<key>`), and implemented with `useSyncExternalStore` rather than read-in-a-`useEffect` — the server/hydration snapshot is always each section's static default, and React reconciles to the real localStorage value right after, so there's no hydration mismatch and no setState-during-effect render cascade. Only the 5 top-level sections collapse; Theme's subsections are an always-visible visual grouping, not independently collapsible. All 5 sections default to expanded — `defaultExpanded` only matters until a user has toggled a section at least once, after which localStorage wins.

**Subsection labels** (e.g. "Action", "Sci-Fi" within Theme) reuse Mixer's existing small-caption style (`font-mono text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] text-[var(--muted)] uppercase`) rather than introducing a new label treatment.

**Genres are tags**: genres (from `series.genres`) are represented as `TagInfo` objects (`isGenre: true`, `category: null`, `avgRank: 100`) merged into the same `allTags` array as real tags, computed in `getCatalog()`. `avgRank: 100` is a deliberate ceiling — genres always clear any rank-threshold filter, since a genre match is at least as strong a signal as any single tag. This means genre chips need zero special-casing anywhere downstream: they render via the same `TagChip`, drag into the same mixer slots, get randomly picked by "Random ×3", and are scored by `scoreSeries` (which checks `series.tags` *or* `series.genres` — the only change genres required in `scoring.ts`). Result cards (`ResultCard.tsx`) merge a series' tags and genres into one chip list sorted by `avgRank` (via a `name → avgRank` lookup built once in `useKonomi.ts`), so genres float to the top and display identically to tags there too.

### `ScrollFadeArea` — shared scroll/fade mechanic

`TagScrollArea` (per-card tags) and the Tag Pool container both need the same affordance: a height-bounded viewport, top/bottom gradient fades that appear only when content is scrollable in that direction, and hover-revealed ▲/▼ arrow buttons. That mechanic is extracted into `ScrollFadeArea.tsx` (`height` prop + children) rather than duplicated — `TagScrollArea` is now a thin wrapper around it (chip-wrap layout + `TagChip`s), and `TagPoolSection` wraps its 5 sections in the same component with its own measured height.

`height` accepts either a fixed `h-[Npx]` or a capping `max-h-[Npx]` Tailwind utility — the two callers deliberately use different ones. `TagScrollArea` uses a fixed height because result cards need uniform height across a grid regardless of how many tags a given series has. `TagPoolSection` uses `max-h-[380px]`: it should hug shorter content (e.g. several sections collapsed) and only cap + scroll once content actually exceeds that height. The overflow-detection logic (`scrollHeight > clientHeight`) needs zero changes to support this — a `max-height` box's `clientHeight` already equals its natural content height whenever that's under the cap, so `hasOverflow` (and therefore the gradients) is already `false` in exactly the cases it should be.

One implementation detail that matters if this is reused again: `ScrollFadeArea` observes an **inner, intrinsically-sized content `div`** with `ResizeObserver`, not the height-bounded scroll viewport itself. A fixed-height viewport's own box never changes size, so a `ResizeObserver` on it would never fire from content changes alone (and even for the `max-h` case, you want the *content's* size change as the signal, not the viewport's). The inner div has no fixed height, so adding/removing children (e.g. a nested `CollapsibleSection` expanding, or one collapsing and shrinking the pool back down) directly changes its rendered height, which `ResizeObserver` does report.

`POOL_AREA_HEIGHT` (`max-h-[380px]`, ~7-8 rows of base-size chips) was measured the same way as `TagScrollArea`'s `TAG_AREA_HEIGHT` — against the live component, not estimated: a base-size chip row measured 46px start-to-start (38px chip + 8px `--space-md` gap) at the time of writing.

### Sticky section headers + `topInset`

Each `CollapsibleSection` header is `sticky top-0` (with an opaque `bg-[var(--surface)]` and `z-[5]`, since a transparent sticky header would show scrolled-past content bleeding through it) so the current section's label stays pinned to the top of the pool's `ScrollFadeArea` viewport, handed off to the next section's header once you scroll past it — this falls out of plain CSS sticky-stacking (each header can only stay stuck while its own section's box still intersects the viewport top), no scroll-tracking JS required.

### Selected-count badge

Each section header shows a small count badge (`Theme 2 ▾`) whenever the user has tags selected inside that section, so a selection isn't invisible when its section is collapsed — it's shown in both collapsed and expanded states for consistency, and only rendered at all when count > 0. Counted across the *whole* section, not per-subsection (Theme's badge counts selections across all 10 of its subsections combined, not one badge per subsection). `CollapsibleSection` takes an optional `selectedCount` prop; `TagPoolSection` computes it per section via `tagsForSection()` (`tagPool.ts`) — a helper that resolves "all tags in this section" regardless of whether that section is flat, subsectioned, or genre-based, so the count logic doesn't duplicate the three different tag-lookup branches already needed for rendering.

## Tag pool Level + Sort filters

Two global preferences, independent of each other, applying identically to the tag pool *and* result cards:

- **Level** (`LevelSelector.tsx`, same segmented-button structure as `MatchSelector`) — which tags are visible: Level 1 "Casual" (only `isGenre: true`), Level 2 "Seasoned" (`avgRank ≥ 70` AND `seriesCount ≥ 5%` of the catalog — `POPULAR_AVG_RANK_THRESHOLD`/`POPULAR_SERIES_COUNT_PCT` in `config.ts`), Level 3 "Otaku" (`avgRank ≥ 40`, the pre-existing baseline). These labels are purely cosmetic — the underlying `LevelKey` values ("1"/"2"/"3") and every threshold/comparison are unchanged; only `LEVEL_OPTIONS`' display `label` (plus a supporting `hint` string — "light enjoyer" / "not my first rodeo" / "power level > 9000", rendered as a smaller second line under the label) changed. Genres always pass every level (`isTagVisibleAtLevel` in `tagPool.ts` short-circuits on `isGenre` before any threshold check).
- **Sort** (`SortSelect.tsx`, same segmented-button structure as `LevelSelector`/`MatchSelector` — no longer a native `<select>`, see below) — Popular/Unpopular (`seriesCount` desc/asc), A-Z, Z-A. Applied *within* each Theme subsection (not flattened across them) — sort reorders a group's contents, it doesn't restructure the section hierarchy.

Level decides *which* tags show; sort decides *what order* — the two compose independently (`tagsForCategories(...)` filters by level, a separate `sortTags(...)` call orders the result), and there's no hidden scoring: since a tag can only ever be selected if it's currently visible, `scoring.ts` needed zero changes — results are naturally scoped to whatever's selectable at the current level.

**Persistence** (`tagPoolPrefs.ts`, `components/konomi/`): same `useSyncExternalStore` + localStorage pattern as `CollapsibleSection`'s per-section expand state, generalized to two global (not per-key) values — `useLevel()`/`useSort()` for reading, `setLevelPref()`/`setSortPref()` for writing. This is a genuine constraint, not just precedent-following: an earlier version tried reading localStorage in a `useEffect` on mount and dispatching a correction into `useKonomi`'s reducer, which is exactly the `react-hooks/set-state-in-effect` anti-pattern the project already hit once for `CollapsibleSection` — moving level/sort out to their own external store (read during render via `useSyncExternalStore`, written from event handlers, never from an effect body) avoids it entirely.

**The level-change deselect edge case**: switching to a level that no longer shows a selected tag must behave exactly like manually deselecting it — cleared from its mixer slot, no longer influencing results, with zero other side effects. `useKonomi` exposes a generic `pruneTags(visible: Set<string>)` action (it doesn't know what a "level" is, just which names remain allowed) that's structurally identical to `TOGGLE_TAG`: it only ever touches `slots`, never `results`/`generated`. Whatever cards are currently showing (if any) stay exactly as they are — a pruned tag's score contribution and chip highlight disappear immediately since `ResultCard` recomputes both live off `selectedTags` on every render, not because the result set changed. Results only regenerate when the user explicitly hits RECOMMEND again, same as any other manual unselect, including the all-selected-tags-pruned case (that's not special-cased into a `clearRecs()` either — it leaves cards on screen at "0/0", exactly like manually removing your last tag while results are up already does). `KonomiApp` is the one place that composes this: its level-change handler calls `setLevelPref()` *and* computes the new visible set to pass into `pruneTags()` — the only reason `KonomiApp` needs to know about levels at all, everywhere else just reads/displays the current value.

**Result cards** (`ResultCard.tsx`) apply the identical level filter + sort to their own tag chip list (via the `tagInfoByName` lookup — `useKonomi`'s former `tagRank: Map<string, number>` was widened to a full `Map<string, TagInfo>` since level-filtering needs `isGenre`/`seriesCount`, not just `avgRank`) — a card never shows a tag the pool wouldn't currently let you select.

**`visiblePoolTagNames()`** (`tagPool.ts`) is the canonical definition of "visible in the pool at this level," and both the level-change prune cascade and Random ×3 use it rather than `isTagVisibleAtLevel` directly. The distinction matters: `isTagVisibleAtLevel` only checks a tag's own rank/count against the level, so a Technical- or Sexual Content-category tag could pass it at Level 2/3 despite never being mapped into any `TAG_SECTIONS` entry (those two categories are intentionally excluded from the pool entirely, at every level). `visiblePoolTagNames` unions `tagsForSection(...)` across every real section instead, so it can never produce a name the pool itself wouldn't render — closing a gap an earlier pass left in place (both surfaces used the looser per-tag check until this pass).

**Hidden (not just collapsed) empty sections**: a section with zero tags at the current level (e.g. every non-Genres section at Level 1) isn't rendered at all, rather than showing an empty collapsed/expanded shell. This is a pure render guard in `TagPoolSection` — `CollapsibleSection`'s expand state lives entirely in `localStorage`, untouched by mounting or unmounting (the in-memory `listeners` map it also uses only exists to notify currently-mounted instances; nothing ever prunes or resets the stored value while a section is hidden), so a section remembers whether it was expanded or collapsed the next time it reappears at a higher level.

## `SortSelect`: segmented control, not a native select

`SortSelect` originally shipped as the app's first native `<select>` (restyled with `appearance-none` plus an overlay `▾`), but was replaced with a `MatchSelector`/`LevelSelector`-style segmented button row so the two Tag Pool controls share one visual pattern rather than mixing a dropdown and segmented buttons side by side. Four segments (Popular/Unpopular/A-Z/Z-A) fit comfortably at the existing `text-xs` size — no new tokens, same bordered-box/`elev-2` treatment as every other segmented control. There's currently no native `<select>` anywhere in the app; if one gets added later, the restyling approach from this now-removed version (`appearance-none` + overlay glyph) is a reasonable starting point, but check first whether a segmented control fits better, as it did here.

**Single shared hint line** (`LevelSelector`): segments themselves stay single-line/uppercase, identical in shape to `SortSelect`'s. The hint for whichever level is currently selected — "light enjoyer" / "not my first rodeo" / "power level > 9000" — renders once, in a small muted line directly below the whole segmented row (found via `LEVEL_OPTIONS.find(option => option.key === value)`), not inside every segment at once. The gap between the row and the hint is `--space-xs` (4px), matching Mixer's caption-to-`MatchSelector` gap exactly — confirmed by measuring both live, not assumed from using the same token. This mirrors the existing caps-label/lowercase-explanation pairing already used for Mixer's "MIN TAG MATCH — how many must overlap" caption, just below the control instead of beside a label.

The hint is always right-aligned to `LevelSelector`'s own right edge (`absolute inset-x-0 text-right`, anchored to a `relative` root) — fixed regardless of which segment is active, deliberately not position-tracking, so it stays visually stable as the level changes rather than jumping around.

### Tag Pool header layout

The header row (`TagPoolSection.tsx`) is `flex items-center justify-between flex-wrap`: the "Tag Pool タグ" title block on the left, `SortSelect`/`LevelSelector` grouped into one shared flex item on the right. Level sits last (rightmost) so its hint — always right-aligned to its own box — lines up flush with the whole group's right edge rather than stopping short of it. `Sort`/`Level` stay `items-start` against each other inside that group (unaffected by anything below — that alignment is between the two controls, not between the two sides of the row).

**Two parallel "primary + hint" structures, centered on their primary elements — not on their combined blocks.** Each side pairs one primary interactive element with a short secondary line beneath it: the title row + "drag or tap to load a slot" on the left, the segmented button row + the Level hint ("light enjoyer" / "not my first rodeo" / "power level > 9000") on the right. `items-center` centers the **title row** against the **button row** specifically. Centering the *combined* title+subtext block against the *combined* controls+hint block instead — an earlier pass did exactly this — produces equal bounding-box heights that still look wrong, because the two hint lines don't correspond to each other the way the two primary rows do; matching wrapper footprints and matching what a viewer's eye actually locks onto are different problems, and only the latter is what "aligned" means here.

For `items-center` to compare the right pair, both hints are pulled out of normal document flow — `position: absolute`, `top-full` on a `relative` parent — so neither contributes to its side's layout height. Without this, whichever hint happened to be taller/longer would skew its own side's height and throw off the centering, exactly as it did when both hints were still in-flow.

**Deliberate tradeoff, worth flagging for anyone revisiting this:** taking the hints out of flow means they stop reserving their own vertical space, so nothing above naturally stops them from overlapping whatever renders next (the first Tag Pool section). `HEADER_HINT_CLEARANCE` (`pb-[var(--space-lg)]` on the header row) exists purely to compensate by hand — reserving clearance for content that no longer reserves it for itself. Confirmed in the browser, not assumed: with zero extra clearance the Level hint sits ~1px from the section below; `--space-lg` leaves a comfortable ~13px, checked across all three levels including the longest hint text.

This is a reasonable choice *because* both hints are short, fixed, single-line strings defined in this codebase (`LEVEL_OPTIONS`), not user input — the manual clearance only has to cover one known, bounded case, measured once. It stops being the right call if the hints ever become dynamic-length, user-generated, or allowed to wrap: at that point "how much clearance to reserve" isn't a fixed constant anymore, and a hand-tuned `pb-` can't reliably track it. The more robust structure for that case is CSS Grid with explicit rows (`grid-template-rows: auto auto`, primary row and hint row), keeping hints in normal flow — so they always reserve their own real space automatically — while still isolating "center these two primary cells against each other" from "let these other rows contribute their own height," via `align-self` scoped to just the primary row's grid items rather than an outer flex `items-center` that sees everything.

**Leading icons** (`SortIcon`/`TagIcon` in `icons.tsx`, same shape as the existing icon set — `IconProps { className? }`, `viewBox="0 0 24 24"`, `stroke="currentColor"`, `strokeWidth={2.2}`, round caps/joins): `SortSelect` and `LevelSelector` are each paired with their icon in their own nested `flex items-center gap-sm` — not one icon-row centered against the whole controls group — so each icon centers against *its own* control's height specifically. This composes cleanly with the primary/hint structure above: `LevelSelector`'s icon+control pair still only reflects the button row's real height (the hint stays `absolute`, uninvolved), so pairing it with an icon doesn't reopen the centering problem this section spent so much time solving. `SortIcon` is two simple arrows side by side (up on the left, down on the right) rather than a lines-plus-single-arrow "list" glyph — kept simpler after a first version read as too busy at 16px.

**Responsive overlap — a second-order effect of making the subtext `absolute`.** Once the subtext stopped being normal-flow content (see above), its real ~172px rendered width became invisible to the flex row's own wrap-width calculation, which only "sees" the much narrower title row. Confirmed live before fixing: this produced an actual ~40px-wide viewport window (roughly 720–760px) where the row hadn't wrapped yet but the subtext's real width already reached past where the controls begin — genuine overlap, not just tight spacing. `HEADER_TITLE_MIN_WIDTH` (`min-w-[190px]` on the title block, ~172px measured + a small buffer) fixes this by giving the flex row a width to reserve for that block that actually matches its visible content, not just its in-flow content — same "measure precisely, hardcode a named constant" pattern as `SECTION_HEADER_HEIGHT`/`POOL_AREA_HEIGHT` elsewhere in this file. Re-confirmed live afterward across the full width range (600–1400px): zero overlap anywhere, and the row now wraps around ~800–810px, comfortably before the old danger zone rather than into it.

The general lesson, since this is the second layout bug this same `absolute` hint pattern has produced (the first being the subtext's own wrapping issue a few paragraphs up): pulling an element out of flow to solve a *height* problem (centering) can silently reintroduce a *width* problem (wrap/overlap timing) somewhere else, because "out of flow" means out of **both** axes' sizing calculations, not just the one you were targeting. Anything similarly pulled out of flow in the future should get checked against the *other* axis too, not just the one it was fixed for.

**...and a third instance, this time vertical.** Once the controls *do* wrap below the title block (narrow viewports), the same blind spot shows up again on the cross axis: the flex container computes the gap between its two wrapped lines from in-flow content only, so it has no idea the subtext hangs below line 1. The wrapped controls line landed directly on top of the subtext — confirmed live, then fixed by reserving clearance the layout can't compute for itself. At this point the pattern is well-established enough to name plainly: **any time a hint is pulled out of flow, check both directions it could still collide with something — sideways, before the row wraps, and downward, after it does.**

**A fourth instance — and this one wasn't caught until it visibly broke same-line centering.** `HEADER_TITLE_WRAP_CLEARANCE`'s first version was `margin-bottom` on the title-block *item*. That fixed the wrap-collision, but `margin-bottom` on a flex item counts toward that item's own box for *every* cross-axis alignment purpose — not just the wrapped-lines gap it was added for, but also `items-center`'s same-line comparison between the title block and the controls group. It silently inflated the title block's effective height by 24px, which skewed `items-center` by half that (~12px) even when both sides were sharing one line — moving the segmented controls visibly below the title's true optical center. Confirmed two ways before concluding it wasn't a font-metrics problem: Canvas `TextMetrics.actualBoundingBoxAscent/Descent` (careful to measure the actual *rendered* casing — `text-transform: uppercase` means the DOM text and the rendered text differ) and an empirical pixel scan of a screenshot both agreed the title text was already well-centered on its own box to within ~0.3px. The 12px gap was coming from the wrap-clearance fix, not the title's typography.

The corrected version moves this clearance from `margin-bottom` on the *item* to `gap-y` (row-gap) on the *container*. Row-gap only inserts space *between* wrapped lines — it never contributes to any single item's own box, so it can solve the wrap-collision without being visible to `items-center` at all. Re-confirmed live afterward across the full width range (1400px → 320px, 10px steps): the title/controls center-diff sits at ~0.01px on every single-line width, and zero overlap (comfortable ~11-15px clearance) at every wrapped width.

The general lesson from all four instances together: **`margin`, `position: absolute`, and `gap` are not interchangeable ways to add space — each participates in layout calculations differently, and picking the wrong one for a given job tends to silently break some *other* calculation that happens to depend on the same box.** When adding spacing to fix one specific problem, it's worth asking which layout computations that spacing will also participate in, not just whether it visually looks right for the case at hand.

### Title rows: the `h2` and its companion span must be tightened together

Both section titles pair a `font-display` (Anton) `h2` with a `font-body` companion span carrying the Japanese label (`ミックス` for Mixer, `タグ` for Tag Pool). Anton's default line-height carries a lot of built-in leading — that's why `h2` gets `leading-[var(--leading-display)]` (0.86). But tightening only the `h2` fixes the row exactly until the *other* element becomes the tall one: Tag Pool's `h2` was tightened in an earlier pass while its `タグ` span was left at the browser default (~1.4-1.6× for `font-body`), so the span silently took over as the row's tallest child and reintroduced the same visual "extra space above the title" symptom from a different source — a same-line sibling swapping in for the wrap-clearance box in the four instances above, but the identical underlying mistake: whichever child has the tallest *line box* dictates the row's rendered height, regardless of which child visually looks like "the title."

Fixed by tightening **both** elements of every title row: `h2` keeps `leading-[var(--leading-display)]` (0.86, calibrated for Anton's all-caps Latin glyphs), and the companion span gets `leading-[var(--leading-tight)]` (1.05) rather than reusing `leading-display` — 0.86 is tuned for Anton specifically, and applying that same aggressive a ratio to a CJK `font-body` span risks visually clipping full-width katakana glyphs, which have different vertical metrics than Latin caps. `leading-tight` is the existing, more conservative token already used elsewhere for body-text titles (`ResultCard`'s `h3`, `TagSlot`'s tag text), and confirmed live afterward to render `ミックス`/`タグ` cleanly with no clipping or cramping at either section's title size.

**This only fully closes the gap when the title row's height is what determines the row's rendered position.** Re-measured live (`section top → title row top → h2 own box top → h2 ink top` decomposition) after tightening both elements in each row: Mixer's visual top gap shrank from ~32-33px to ~29.5px, closely tracking the ~26px raw padding — the ~3.5px residual is `items-center` centering the (now-short) title row against the taller locked-count badge (`{lockedLabel}`) sharing its flex row, a legitimate centering effect rather than leftover leading slop. Tag Pool's visual top gap, however, stayed at ~32px, essentially unchanged, because Tag Pool's outer header row (`flex items-center justify-between`, see above) centers the *title block* against the *Sort/Level controls block*, and the controls block (~36.5px tall) is taller than even a fully leading-tightened title block (~22.4px) — the ~7px residual there comes entirely from that cross-block centering, a mechanism this leading fix cannot touch (tightening the title further, if anything, *widens* this particular gap, since a shorter title gets centered with a larger offset against the same taller controls block). Closing Tag Pool's remaining gap would mean changing how the outer row aligns those two blocks against each other — a separate, deliberate decision from the "Tag Pool header layout" section above, not a title-leading problem.

The reusable rule going forward: **any title row pairing a display `h2` with a companion span needs `leading-display` on the `h2` and `leading-tight` on the span, applied together, every time** — never just one. But also check whether anything *else* sharing that row or a parent row (a badge, a controls block being centered against it) is taller than the now-tightened title; if so, the remaining visual gap belongs to that other element's alignment, not to the title's typography.

### Trailing space below the last Tag Pool section

`CollapsibleSection`'s wrapper uses `last:mb-[var(--space-md)]`, not `last:mb-0`. A bare zero let the last section's chip row sit flush against `ScrollFadeArea`'s `overflow-y-auto` clip boundary, cutting off the `elev-2` shadow (3px offset) every base-size `TagChip` renders — invisible until you scrolled a full section to the bottom, or landed on a level/collapse state where a section happened to end flush with the viewport's edge. `--space-md` matches the existing row-to-row gap inside a `ChipRow`, so the trailing space reads as "one more row-gap," not an arbitrary buffer value.

`justify-between` (not `ml-auto`) is what makes the wrap behavior work with zero extra logic: with both blocks on one line, it pushes the header left and the controls right, same as most toolbar-style headers. When there isn't room and the controls group (kept as one atomic flex item, so Level and Sort move together rather than splitting from each other) wraps to its own line below the header, `justify-content: space-between` degenerates to `flex-start` for a lone item on a line — so the wrapped group naturally reverts to left-alignment matching the header above it, rather than staying docked right, with no responsive breakpoints or extra classes needed.

Styled as a small bordered `--fill`-background box (`font-mono font-bold text-2xs`, hairline ink border) — reusing Mixer's existing `0/3` counter look rather than an accent color, since this is an informational readout (like that counter), not an active/selected-state indicator (like a filled `TagChip` or `TagSlot`). No new tokens needed.

This creates one real conflict worth remembering if `ScrollFadeArea` gets a third caller: its top gradient/arrow are positioned at `top-0` by default, which is the *same* spot a sticky header occupies — since a section's header goes sticky the instant its content scrolls at all, "scrolled down" and "some header is currently stuck at top" are effectively the same condition here, so the gradient would render right on top of (and functionally hide) whichever header is stuck. `ScrollFadeArea` takes a `topInset` (px) prop to push the gradient and the ▲ arrow down below a caller's own sticky header instead of fighting it for the same strip — `TagPoolSection` passes `SECTION_HEADER_HEIGHT` (`38px`, measured live against the actual header button, not estimated). `TagScrollArea` has no sticky header of its own, so it doesn't pass `topInset` and is completely unaffected (defaults to `0`).

## Mixer responsive behavior — grouping items so they wrap as a unit

`MixerSection` has two independent things that can wrap: the MIN TAG MATCH block vs. the Random+Clear pair, and the mixer column vs. `RecommendButton`. Both use the same two-part technique:

**Force a group to wrap as one unit, not split apart.** Random and Clear are wrapped together in their own nested `flex` div *without* its own `flex-wrap` — from the outer row's perspective that's a single flex item, so the wrap algorithm can only place it whole on the current line or whole on the next one. There's nothing inside it that the wrap decision could split, because nothing inside it is allowed to wrap independently. This is the same technique used for Sort+Level in the Tag Pool header.

**Keep a group right-aligned whether it shares the line or wraps alone — `margin-left: auto`, not `justify-between`.** The Tag Pool header wanted the *opposite* behavior (revert to left-aligned once wrapped), which came from `justify-between` degenerating to `flex-start` for a lone wrapped item. Here, Random+Clear and `RecommendButton` (wrapped in a plain div, since the component takes no `className`) both need to *stay* flush-right in both states — `justify-between` can't do that, since it only pushes an item away from a sibling that's still sharing its line. `margin-left: auto` does, because it claims all leftover space on whatever line the item ends up on, alone or not. Pick between these two based on which direction you want the "wrapped alone" state to fall.

**"Stretch to fill the full line when alone" falls out of existing `flex-grow`, no extra rule needed.** MIN TAG MATCH's block already has `flex-grow: 1` while Random+Clear (and, one level up, the mixer column relative to `RecommendButton`) don't grow at all. That asymmetry is what already pushes the non-growing group to the right when both share a line — and when the growing block ends up alone on a line, the same `flex-grow: 1` naturally fills it. It's one mechanism producing both behaviors, not two.

**Confirmed live across the full width range (1400px → 320px, 2px steps), not just spot-checked**: Random and Clear never separate from each other at any width. One characteristic worth knowing about, not a bug: the two wraps aren't independent in effect — once `RecommendButton` wraps below (~772px), the mixer column gets its width back, which is enough to briefly *un-wrap* the MIN TAG MATCH/Random/Clear row back onto one line before it wraps again for good below ~608px. The inner row's own wrap threshold, checked in isolation, sits around ~820px. All of this is a legitimate consequence of two independently-wrapping flex rows nested inside each other, not an error — the invariants that actually matter (no group ever splits, right-alignment holds in every wrapped state) held at every width tested.

## Mixer error system, and why there's no live filtering at all

**The displayed result set is always exactly `state.results` — there is no filtered/derived view sitting in front of it.** An earlier version of this app had a `visibleResults` layer that hid stored entries live based on min-match (frozen `entry.score` vs a live threshold). That's been removed entirely: it turned out to be the wrong model. The actual requirement is simpler and stricter — **only RECOMMEND and Clear ✕ change what's visible.** Adjusting MIN TAG MATCH or changing/swapping/removing tags never hides or shows a card; they only change what *setting* the next RECOMMEND will use, and (for tags) what each already-visible card's live score badge and highlights show. Remove every tag down to zero and every card stays put, honestly showing `0/0` — nothing to hide, because hiding isn't a thing tag or min-match changes do anymore.

This means `entry.score` (the field stored on each `ResultEntry`) is now purely informational — nothing reads it to decide whether a card is shown. The only score that ever drives anything a user sees is the *live* `scoreSeries(series, selectedTags)` call inside `ResultCard`, used for the count badge and tag highlighting, recomputed fresh on every render regardless of what's stored. Because there's no visibility filter left to satisfy, the locked-carry-forward path in `recommend()` no longer needs to clamp its score to the current min-match either (see below) — it's just the honest live score, kept only for whatever informational value it has.

**`state.error` — reducer state, set only by RECOMMEND, cleared only by specific actions.** This can't be a derived value — if it were computed live from `tagCount < minMatch`, it would flicker on/off automatically as tags or min-match change, which directly contradicts "errors fire only on RECOMMEND." So it's real state (`MixerError = "impossible-min" | "no-match" | null` in `types.ts`), mutated by exactly one reducer function (`recommend()`, which sets it) and a handful of specific clearing rules elsewhere. On either error, `results` is deliberately left completely untouched.

**Priority order inside `recommend()`, checked in this sequence every time:** first `sel.length < min` → `"impossible-min"` (never touches the catalog at all); else run the real `scorePool` rescore, and if it comes back empty → `"no-match"` — checked as `pool.length === 0`, not `out.length === 0`. This distinction matters: locked cards surviving in `out` doesn't mean the error shouldn't fire, since the error is about whether a *fresh* search for *new* matches succeeded, which is an entirely separate question from whether anything old is still on screen. A `RECOMMEND` can legitimately show "no series match this mix" right next to two locked cards that are still sitting there from before.

**Clearing tracks current state, not which action originally triggered the error.** `"no-match"` clears on *any* tag or min-match change — the whole combination was the problem, so any edit is a fresh attempt worth trying again. `"impossible-min"` clears whenever the underlying condition (`tagCount < min`) stops being true, from either side: `SET_MIN_MATCH` lowering the threshold to `<= tagCount`, *or* `clearErrorForTagChange` seeing `tagCount` rise back to `>= min` (a manual tag add, or Random ×3 refilling all slots) — both are handled, not just the min-match-control path. The first version of this only cleared on the min-match side, which left a real gap: erroring at min-3 with 2 tags, then adding a third tag, should obviously clear it (2 tags making min-3 impossible has stopped being true), but nothing re-evaluated the error until the user touched MIN TAG MATCH itself. `clearErrorForTagChange` also still handles the separate global-override case — tag count dropping to exactly zero clears either error type, since `min-match` can never be lower than `"1"`, so `tagCount >= min` is never satisfied by zero tags on its own; the zero-tags case needs its own explicit check. Called from every slot-mutating action (`TOGGLE_TAG`, `CLEAR_SLOT`, `PLACE_IN_SLOT`, `CLEAR_SLOTS`, `PRUNE_TAGS`, `RANDOM_TAGS`).

**`SET_MIN_MATCH` no longer calls `recommend()`.** It used to cascade a full rescore whenever results were already showing. That's now handled entirely by live filtering (which needs no reducer action at all) — the reducer's job on a min-match change is just to update the value and apply the two clearing rules above, nothing else.

**Visual treatment reuses the existing disabled styling, but decouples two conditions that used to be one.** `RecommendButton`'s star has always dimmed to `opacity-35` when disabled (unchanged, still tied to `!enabled`, now `enabled = filledCount > 0 && !error`). What's new: the star's *rotation* is tied to a different condition (`!error`, not `!enabled`) — so the pre-existing zero-tags state still dims while continuing to spin (unchanged behavior), but an active error additionally freezes it (`animation-name` verified live: `kono-spin` → `none`), giving the two disabled states a distinct feel even though they share a color treatment.

**The upward-shift layout is a precise formula, not a guessed offset.** The star+button assembly sits in a `min-h-[92px] flex items-center justify-center` box; adding a taller subtext below and letting the box grow would leave the button pinned at the top (`items-start` in the row above already fixes that edge), not shifted up. Instead, `RecommendButton` applies a `translate-y` to the star+button wrapper (Tailwind v4 note: individual translate utilities compile to the native CSS `translate` property now, not `transform` — check `getComputedStyle(el).translate`, not `.transform`, when verifying) and renders the subtext `position: absolute, top-full`, matching the same out-of-flow hint pattern used for `LevelSelector`/`TagPool`'s hints elsewhere in this file. The shift amount is `(gap + subtextLineHeight) / 2` — half of what's being added below — which is exactly the offset that makes the *new* block (button + gap + subtext) center on the same point the button *alone* used to occupy in that fixed 92px box. Measured live: `9.5px` (`4px` gap + `15px` line height), verified to a `0px` diff between the box's natural center and the shifted block's center.

**The old "no series match that strict" banner in `RecommendationsSection` is retired.** It's now redundant with the button-adjacent error message. `hasResults`/`empty` keep their prior meaning (`generated && results.length > 0` / `!generated`); there's no longer a distinct banner for "generated, but currently nothing to show" — that state (which can now only happen right after an errored `RECOMMEND`, since a *successful* one always produces at least one result) is deliberately blank in the grid area, since the error message at the button already explains it, and duplicating that explanation with slightly different copy would be more confusing than nothing.

### Locked cards are real, positioned members of `results` — not a visual overlay

**`recommend()` walks the raw stored order directly, and that's correct — not a simplification that cuts a corner.** An earlier version of this logic walked a separately-filtered "current visible" list instead of `state.results`, because at the time a card could be hidden live (by min-match) while still being stored — meaning stored order and displayed order could diverge, and a locked card could visually "jump" position across a RECOMMEND if the loop walked the wrong one. That entire divergence is gone now that there's no live filtering at all (see the section above): the displayed set *is* `state.results`, always, so there is no separate "visible order" left to reconcile against. Walking the raw array directly is therefore the *correct* model again, not a reversion that reintroduces a bug — the bug it used to cause can't occur without the live-filtering layer that originally created the mismatch.

**Relative order + compaction still falls out of the loop shape for free, unrelated to any of that.** `recommend()` walks `state.results[i]` for `i` in `0..DEFAULT_RESULT_COUNT`, pushing (a) the locked entry when found at that index or (b) the next fresh pool pick when one's available, skipping only when neither applies. Locked entries get visited and pushed in the same relative sequence they already had (order preserved for free), and a skipped iteration contributes nothing rather than a gap (compaction for free) — this was true before the live-filtering detour and remains true now that it's been removed.

**Locked-carry-forward no longer clamps its score.** It used to compute `Math.max(scoreSeries(old.series, sel), min)` specifically to guarantee a carried-over locked entry would satisfy the live visibility filter's `score >= min` check even after being unlocked. With no visibility filter left to satisfy, that clamp was solving a problem that no longer exists — it's now a plain `scoreSeries(old.series, sel)`, the honest live score, kept only because `ResultEntry.score` is still a field on the type (informational, read by nothing).

**`REPLACE_CARD` still targets by title, not index — this didn't need to change.** It moved to title-based targeting during the live-filtering era for a reason that no longer applies (displayed and stored order could diverge), but title is the same stable identifier `TOGGLE_LOCK`/`TOGGLE_FLIP` already use, and there's no reason to revert something that's strictly more robust just because its original motivating scenario went away.

## React Native portability

`src/lib/konomi/` (types, data, tokens, themes, scoring, and the `useKonomi` state hook) contains zero DOM or web-only APIs — no `document`, `window`, `HTMLElement`, or browser event types. It's plain TypeScript plus React hooks, which run the same way under React Native. The one deliberately web-only concern — HTML5 drag-and-drop — lives entirely in the web components (`TagChip`, `TagSlot`), which call into the same plain actions (`toggleTag`, `placeInSlot`, etc.) a React Native gesture handler would call.

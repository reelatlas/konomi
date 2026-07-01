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

The Tag Pool section (`TagPoolSection.tsx`) groups its ~280 tags/genres into 5 top-level sections (Genres, Theme, Setting, Cast, Demographic). Only Theme further splits into labeled subsections (Action, Fantasy, Sci-Fi, etc.) — Setting and Cast merge their categories into one flat list each (same tags, no subsection grouping shown), and Genres/Demographic were always flat. The hierarchy itself (which AniList categories merge where, default expand states) is static config in `src/lib/konomi/tagPool.ts` — not duplicated in the component.

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

- **Level** (`LevelSelector.tsx`, same segmented-button structure as `MatchSelector`) — which tags are visible: Level 1 "Genres" (only `isGenre: true`), Level 2 "Popular" (`avgRank ≥ 70` AND `seriesCount ≥ 5%` of the catalog — `POPULAR_AVG_RANK_THRESHOLD`/`POPULAR_SERIES_COUNT_PCT` in `config.ts`), Level 3 "All" (`avgRank ≥ 40`, the pre-existing baseline). Genres always pass every level (`isTagVisibleAtLevel` in `tagPool.ts` short-circuits on `isGenre` before any threshold check).
- **Sort** (`SortSelect.tsx`) — Most/Least Popular (`seriesCount` desc/asc), A-Z, Z-A. Applied *within* each Theme subsection (not flattened across them) — sort reorders a group's contents, it doesn't restructure the section hierarchy.

Level decides *which* tags show; sort decides *what order* — the two compose independently (`tagsForCategories(...)` filters by level, a separate `sortTags(...)` call orders the result), and there's no hidden scoring: since a tag can only ever be selected if it's currently visible, `scoring.ts` needed zero changes — results are naturally scoped to whatever's selectable at the current level.

**Persistence** (`tagPoolPrefs.ts`, `components/konomi/`): same `useSyncExternalStore` + localStorage pattern as `CollapsibleSection`'s per-section expand state, generalized to two global (not per-key) values — `useLevel()`/`useSort()` for reading, `setLevelPref()`/`setSortPref()` for writing. This is a genuine constraint, not just precedent-following: an earlier version tried reading localStorage in a `useEffect` on mount and dispatching a correction into `useKonomi`'s reducer, which is exactly the `react-hooks/set-state-in-effect` anti-pattern the project already hit once for `CollapsibleSection` — moving level/sort out to their own external store (read during render via `useSyncExternalStore`, written from event handlers, never from an effect body) avoids it entirely.

**The level-change deselect edge case**: switching to a level that no longer shows a selected tag must behave exactly like manually deselecting it — cleared from its mixer slot, no longer influencing results, with zero other side effects. `useKonomi` exposes a generic `pruneTags(visible: Set<string>)` action (it doesn't know what a "level" is, just which names remain allowed) that's structurally identical to `TOGGLE_TAG`: it only ever touches `slots`, never `results`/`generated`. Whatever cards are currently showing (if any) stay exactly as they are — a pruned tag's score contribution and chip highlight disappear immediately since `ResultCard` recomputes both live off `selectedTags` on every render, not because the result set changed. Results only regenerate when the user explicitly hits RECOMMEND again, same as any other manual unselect, including the all-selected-tags-pruned case (that's not special-cased into a `clearRecs()` either — it leaves cards on screen at "0/0", exactly like manually removing your last tag while results are up already does). `KonomiApp` is the one place that composes this: its level-change handler calls `setLevelPref()` *and* computes the new visible set to pass into `pruneTags()` — the only reason `KonomiApp` needs to know about levels at all, everywhere else just reads/displays the current value.

**Result cards** (`ResultCard.tsx`) apply the identical level filter + sort to their own tag chip list (via the `tagInfoByName` lookup — `useKonomi`'s former `tagRank: Map<string, number>` was widened to a full `Map<string, TagInfo>` since level-filtering needs `isGenre`/`seriesCount`, not just `avgRank`) — a card never shows a tag the pool wouldn't currently let you select.

**`visiblePoolTagNames()`** (`tagPool.ts`) is the canonical definition of "visible in the pool at this level," and both the level-change prune cascade and Random ×3 use it rather than `isTagVisibleAtLevel` directly. The distinction matters: `isTagVisibleAtLevel` only checks a tag's own rank/count against the level, so a Technical- or Sexual Content-category tag could pass it at Level 2/3 despite never being mapped into any `TAG_SECTIONS` entry (those two categories are intentionally excluded from the pool entirely, at every level). `visiblePoolTagNames` unions `tagsForSection(...)` across every real section instead, so it can never produce a name the pool itself wouldn't render — closing a gap an earlier pass left in place (both surfaces used the looser per-tag check until this pass).

**Hidden (not just collapsed) empty sections**: a section with zero tags at the current level (e.g. every non-Genres section at Level 1) isn't rendered at all, rather than showing an empty collapsed/expanded shell. This is a pure render guard in `TagPoolSection` — `CollapsibleSection`'s expand state lives entirely in `localStorage`, untouched by mounting or unmounting (the in-memory `listeners` map it also uses only exists to notify currently-mounted instances; nothing ever prunes or resets the stored value while a section is hidden), so a section remembers whether it was expanded or collapsed the next time it reappears at a higher level.

## First native `<select>`: `SortSelect`

`SortSelect` is the first native `<select>` in the app, so it establishes the pattern for any future one: `appearance-none` strips the browser's own chrome (which can't be restyled to match the hard-edged bordered look everything else uses), replaced with the same bordered-box treatment as every other control (`border-base`/`ink`, `elev-2` shadow, `font-mono font-bold uppercase text-xs`), plus a plain `▾` glyph absolutely positioned on top (`pointer-events-none`, so clicks still reach the real `<select>` underneath) standing in for the native dropdown arrow. No new tokens — same borders/shadow/type scale as `MatchSelector`/`LevelSelector`. This reads close enough to the manga aesthetic to ship as-is for this pass; if a future control needs more visual control than a native `<select>` allows (e.g. custom option styling), that's the point to reach for a custom dropdown instead.

Styled as a small bordered `--fill`-background box (`font-mono font-bold text-2xs`, hairline ink border) — reusing Mixer's existing `0/3` counter look rather than an accent color, since this is an informational readout (like that counter), not an active/selected-state indicator (like a filled `TagChip` or `TagSlot`). No new tokens needed.

This creates one real conflict worth remembering if `ScrollFadeArea` gets a third caller: its top gradient/arrow are positioned at `top-0` by default, which is the *same* spot a sticky header occupies — since a section's header goes sticky the instant its content scrolls at all, "scrolled down" and "some header is currently stuck at top" are effectively the same condition here, so the gradient would render right on top of (and functionally hide) whichever header is stuck. `ScrollFadeArea` takes a `topInset` (px) prop to push the gradient and the ▲ arrow down below a caller's own sticky header instead of fighting it for the same strip — `TagPoolSection` passes `SECTION_HEADER_HEIGHT` (`38px`, measured live against the actual header button, not estimated). `TagScrollArea` has no sticky header of its own, so it doesn't pass `topInset` and is completely unaffected (defaults to `0`).

## React Native portability

`src/lib/konomi/` (types, data, tokens, themes, scoring, and the `useKonomi` state hook) contains zero DOM or web-only APIs — no `document`, `window`, `HTMLElement`, or browser event types. It's plain TypeScript plus React hooks, which run the same way under React Native. The one deliberately web-only concern — HTML5 drag-and-drop — lives entirely in the web components (`TagChip`, `TagSlot`), which call into the same plain actions (`toggleTag`, `placeInSlot`, etc.) a React Native gesture handler would call.

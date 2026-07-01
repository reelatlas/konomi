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

**Section headers** (`CollapsibleSection.tsx`): a smaller variant of the standard section-header pattern — `font-display text-[length:var(--text-lg)] uppercase tracking-[var(--tracking-sm)]` — deliberately *without* the Japanese-subtitle flourish that Mixer/Recommendations/Tag Pool itself use, since that's reserved for app-level sections, not nested groupings inside one. A `▾`/`▸` glyph (plain text, matching `TagScrollArea`'s existing precedent of using unicode glyphs instead of SVG icons for small directional controls) sits immediately after the title inside one inline cluster (`GENRES ▾`, not pushed to the far right) — the header *button* itself still spans the full row width for a larger click target, only the visible text/chevron are grouped tightly.

**Collapse persistence**: expand/collapse is per-section, localStorage-backed (`konomi:tagpool:section:<key>`), and implemented with `useSyncExternalStore` rather than read-in-a-`useEffect` — the server/hydration snapshot is always each section's static default, and React reconciles to the real localStorage value right after, so there's no hydration mismatch and no setState-during-effect render cascade. Only the 5 top-level sections collapse; Theme's subsections are an always-visible visual grouping, not independently collapsible. All 5 sections default to expanded — `defaultExpanded` only matters until a user has toggled a section at least once, after which localStorage wins.

**Subsection labels** (e.g. "Action", "Sci-Fi" within Theme) reuse Mixer's existing small-caption style (`font-mono text-[length:var(--text-2xs)] tracking-[var(--tracking-xl)] text-[var(--muted)] uppercase`) rather than introducing a new label treatment.

**Genres are tags**: genres (from `series.genres`) are represented as `TagInfo` objects (`isGenre: true`, `category: null`, `avgRank: 100`) merged into the same `allTags` array as real tags, computed in `getCatalog()`. `avgRank: 100` is a deliberate ceiling — genres always clear any rank-threshold filter, since a genre match is at least as strong a signal as any single tag. This means genre chips need zero special-casing anywhere downstream: they render via the same `TagChip`, drag into the same mixer slots, get randomly picked by "Random ×3", and are scored by `scoreSeries` (which checks `series.tags` *or* `series.genres` — the only change genres required in `scoring.ts`). Result cards (`ResultCard.tsx`) merge a series' tags and genres into one chip list sorted by `avgRank` (via a `name → avgRank` lookup built once in `useKonomi.ts`), so genres float to the top and display identically to tags there too.

### `ScrollFadeArea` — shared fixed-height scroll/fade mechanic

`TagScrollArea` (per-card tags) and the Tag Pool container both need the same affordance: a fixed-height viewport, top/bottom gradient fades that appear only when content is scrollable in that direction, and hover-revealed ▲/▼ arrow buttons. That mechanic is extracted into `ScrollFadeArea.tsx` (`height` prop + children) rather than duplicated — `TagScrollArea` is now a thin wrapper around it (chip-wrap layout + `TagChip`s), and `TagPoolSection` wraps its 5 sections in the same component with its own measured height.

One implementation detail that matters if this is reused again: `ScrollFadeArea` observes an **inner, intrinsically-sized content `div`** with `ResizeObserver`, not the fixed-height scroll viewport itself. The viewport's own box never changes size (its height is fixed via the `height` prop), so a `ResizeObserver` on it would never fire from content changes alone. The inner div has no fixed height, so adding/removing children (e.g. a nested `CollapsibleSection` expanding) directly changes its rendered height, which `ResizeObserver` does report — this is what lets the Tag Pool's fade/scroll state react correctly to section expand/collapse, which isn't a prop change the wrapper would otherwise see.

`POOL_AREA_HEIGHT` (`380px`, ~7-8 rows of base-size chips) was measured the same way as `TagScrollArea`'s `TAG_AREA_HEIGHT` — against the live component, not estimated: a base-size chip row measured 46px start-to-start (38px chip + 8px `--space-md` gap) at the time of writing.

### Sticky section headers + `topInset`

Each `CollapsibleSection` header is `sticky top-0` (with an opaque `bg-[var(--surface)]` and `z-[5]`, since a transparent sticky header would show scrolled-past content bleeding through it) so the current section's label stays pinned to the top of the pool's `ScrollFadeArea` viewport, handed off to the next section's header once you scroll past it — this falls out of plain CSS sticky-stacking (each header can only stay stuck while its own section's box still intersects the viewport top), no scroll-tracking JS required.

This creates one real conflict worth remembering if `ScrollFadeArea` gets a third caller: its top gradient/arrow are positioned at `top-0` by default, which is the *same* spot a sticky header occupies — since a section's header goes sticky the instant its content scrolls at all, "scrolled down" and "some header is currently stuck at top" are effectively the same condition here, so the gradient would render right on top of (and functionally hide) whichever header is stuck. `ScrollFadeArea` takes a `topInset` (px) prop to push the gradient and the ▲ arrow down below a caller's own sticky header instead of fighting it for the same strip — `TagPoolSection` passes `SECTION_HEADER_HEIGHT` (`38px`, measured live against the actual header button, not estimated). `TagScrollArea` has no sticky header of its own, so it doesn't pass `topInset` and is completely unaffected (defaults to `0`).

## React Native portability

`src/lib/konomi/` (types, data, tokens, themes, scoring, and the `useKonomi` state hook) contains zero DOM or web-only APIs — no `document`, `window`, `HTMLElement`, or browser event types. It's plain TypeScript plus React hooks, which run the same way under React Native. The one deliberately web-only concern — HTML5 drag-and-drop — lives entirely in the web components (`TagChip`, `TagSlot`), which call into the same plain actions (`toggleTag`, `placeInSlot`, etc.) a React Native gesture handler would call.

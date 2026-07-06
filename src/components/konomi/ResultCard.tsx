import Image from "next/image";
import { useLayoutEffect, useRef, useState } from "react";
import { scoreSeries, streamsFor } from "@/lib/konomi/scoring";
import { isTagVisibleAtLevel, sortTags } from "@/lib/konomi/tagPool";
import type { LevelKey, ResultEntry, SortKey, TagInfo } from "@/lib/konomi/types";
import { DiceIcon, LockClosedIcon, LockOpenIcon } from "./icons";
import { IconButton } from "./IconButton";
import { ERROR_MESSAGE } from "./RecommendButton";
import { TagScrollArea } from "./TagScrollArea";

const DOT_CLASSES = ["bg-[var(--secondary)]", "bg-[var(--primary)]", "bg-[var(--muted)]"];

interface ResultCardProps {
  entry: ResultEntry;
  selectedTags: string[];
  filledCount: number;
  minNum: number;
  locked: boolean;
  flipped: boolean;
  canSwap: boolean;
  onFlip: (title: string) => void;
  onToggleLock: (title: string) => void;
  onReplace: (title: string) => void;
  onChipToggle: (tag: string) => void;
  tagInfoByName: Map<string, TagInfo>;
  totalSeriesCount: number;
  level: LevelKey;
  sort: SortKey;
}

export function ResultCard({
  entry,
  selectedTags,
  filledCount,
  minNum,
  locked,
  flipped,
  canSwap,
  onFlip,
  onToggleLock,
  onReplace,
  onChipToggle,
  tagInfoByName,
  totalSeriesCount,
  level,
  sort,
}: ResultCardProps) {
  const [hoveredIcon, setHoveredIcon] = useState<"lock" | "swap" | null>(null);
  // Separate from `hasImage` below — that only tells us a URL exists, not
  // that it actually decoded. Scoped to just the reflection's own <Image>
  // instance (not the sharp cover's), so a failure here can't affect
  // whether the cover itself renders, and vice versa. Either failure mode
  // (no URL, or a URL that 404s/fails to decode) falls back to the same
  // flat --surface tint the tag area always had — see the JSX below.
  const [reflectionBroken, setReflectionBroken] = useState(false);
  const { series } = entry;
  // Recomputed live against the current tag selection on every render — not
  // taken from entry.score, which is frozen at whatever moment this card was
  // last (re)generated and would otherwise go stale the instant tags change
  // without a RECOMMEND in between.
  const score = scoreSeries(series, selectedTags);
  // Genres display exactly like tags (same chip, same highlight-on-match),
  // filtered to the current level and sorted by the current sort — same
  // rules the pool itself uses, so a card never shows a tag the pool
  // wouldn't let you select at this level.
  const cardTagInfos = [...series.tags, ...series.genres]
    .map((name) => tagInfoByName.get(name))
    .filter((t): t is TagInfo => t !== undefined && isTagVisibleAtLevel(t, level, totalSeriesCount));
  const cardTags = sortTags(cardTagInfos, sort).map((t) => t.name);
  const perfect = score === filledCount && filledCount > 0;
  const scoreLabel = perfect ? "PERFECT" : `${score}/${filledCount}`;
  const swapDisabled = locked || !canSwap;
  // Same priority order as recommend()'s own error check in useKonomi.ts:
  // tag count below MIN TAG MATCH is checked (and reported) before "nothing
  // else qualifies," since that's the more specific, more actionable reason.
  // null while locked — the lock icon's own hint already explains why swap
  // is unavailable, so this doesn't duplicate/contradict that with a
  // different reason.
  //
  // The !canSwap branch does NOT reuse ERROR_MESSAGE["no-match"] — canSwap
  // excludes every currently-*shown* title (locked and unlocked), while
  // recommend()'s no-match error excludes only *locked* titles. They're
  // different conditions: canSwap can be false while a fresh RECOMMEND
  // would succeed fine (e.g. every series that matches this mix is already
  // displayed, none locked — recommend()'s pool isn't empty, since it
  // doesn't exclude the shown-but-unlocked ones). Reusing "no series match
  // this mix" there would be false in exactly that case.
  //
  // "no swaps available for this mix" — not "all series shown for this
  // mix" (an earlier version of this copy) — because that phrasing asserts
  // the shown cards themselves belong to the current mix, which isn't
  // always true: results can go stale (tags changed since the last
  // RECOMMEND, see "Locked cards are real, positioned members of `results`"
  // below and the mixer error system notes) while still being displayed.
  // This wording only claims what canSwap actually reports — no series is
  // available to swap in — without asserting anything about whether
  // what's currently on screen matches the current mix.
  const swapHint = locked ? null : filledCount < minNum ? ERROR_MESSAGE["impossible-min"] : !canSwap ? "no swaps available for this mix" : "swap";
  const lockHint = locked ? "unlock" : "lock";
  const activeHint = hoveredIcon === "lock" ? lockHint : hoveredIcon === "swap" ? swapHint : null;
  const hintRef = useRef<HTMLSpanElement>(null);
  const [hintWrapped, setHintWrapped] = useState(false);
  // CSS has no way to select on "did this text wrap to multiple lines," so
  // this is measured directly: derive the expected single-line box height
  // from the hint's own computed line-height/padding/border (not a guessed
  // pixel constant — stays correct regardless of font-size or theme
  // changes), then compare against its actual rendered height. Taller means
  // it wrapped. Runs after every hint change since a different hint string
  // (different length) can wrap where the previous one didn't. useLayoutEffect,
  // not useEffect — this reads layout (offsetHeight) and writes state that
  // changes layout (items-start/items-center) in response; useEffect would
  // let the browser paint once with the stale alignment first, a one-frame
  // flash right when the whole point is to avoid visible jumps.
  useLayoutEffect(() => {
    const el = hintRef.current;
    if (!activeHint || !el) {
      setHintWrapped(false);
      return;
    }
    const style = getComputedStyle(el);
    const singleLineHeight =
      parseFloat(style.lineHeight) +
      parseFloat(style.paddingTop) +
      parseFloat(style.paddingBottom) +
      parseFloat(style.borderTopWidth) +
      parseFloat(style.borderBottomWidth);
    setHintWrapped(el.offsetHeight > singleLineHeight + 1);
  }, [activeHint]);
  const streams = streamsFor(series.title);
  const hasImage = Boolean(series.coverImageUrl);
  // year/eps come from AniList and can genuinely be null (e.g. unreleased
  // media) — omit whichever part is missing instead of rendering "null".
  const meta = [series.year ?? "TBA", series.eps != null ? `${series.eps} EP` : null].filter(Boolean).join(" · ");

  return (
    <article
      data-title={series.title}
      onClick={() => onFlip(series.title)}
      // h-[var(--result-card-height)], not a literal h-[421px]: shared with
      // RecommendationsSection's empty-state placeholder so the two can
      // never drift out of sync (see the token's own comment in
      // globals.css). max-[1152px]: below the width where all
      // DEFAULT_RESULT_COUNT (5) cards stop fitting in one grid row —
      // NOT the grid's 1-column breakpoint (480px), which was tried first
      // and confirmed live to be wrong: the grid wraps to 2-3 rows well
      // above 480px already (5 cards, 208px min width, only 2 fit per row
      // once width drops below ~1152px), so a carousel that only kicked in
      // below 480px left most of the resize range still wrapping into
      // multiple rows — defeating the entire "stay a single row, keep the
      // mixer co-visible" point of building this. Below 1152px, this card
      // becomes a snap-carousel item instead of a grid cell — flex-none so
      // it doesn't shrink/grow. snap-start (not snap-center) — the active
      // card stays mostly left-aligned, not dead-centered in the
      // scrollport; the "previous card peeks in too" requirement is
      // instead handled by scroll-padding-left on the row itself (see
      // RecommendationsSection), which shifts *where* a start-aligned card
      // comes to rest, not whether it's centered. snap-center was tried
      // first and explicitly rejected: centering reads as a different,
      // more "look at one thing at a time" carousel feel than wanted here.
      //
      // Width steps down through 4 tiers as the row narrows — 4 comfortable
      // cards, then 3, then 2, falling back to one dominant card (with a
      // peek either side) only once 2 no longer fit at a reasonable size.
      // Each tier is bounded by BOTH a min and max (not a bare max-[Npx],
      // which would leave every wider tier's rule simultaneously "true" at
      // narrow widths too, since max-width ranges nest/overlap) so exactly
      // one tier ever applies at a given width. Tailwind v4 compiles
      // max-[Npx] as strictly-less-than (`not (min-width: Npx)`), not
      // "Npx or narrower" — confirmed by inspecting the actual generated
      // media rules live, after the first version of these tiers left a
      // 1px gap at each boundary (992/740/500 exactly matched *no* tier,
      // collapsing the card to 0 width). Each tier's max is therefore set
      // to the exact same number as the next tier's min, not min-1, so
      // the exclusive/inclusive pairing meets with zero gap or overlap.
      // Percentages, not fixed px, so card size still flexes smoothly
      // within each tier rather than jumping. Boundaries tuned live, not
      // purely computed — see DESIGN_SYSTEM.md for the measured values.
      //
      // The 1152px ceiling itself is unchanged: coupled to
      // DEFAULT_RESULT_COUNT (config.ts) — re-derive (5×208 + 4×16 gaps +
      // 48px page margins = 1152) if that count ever changes.
      //
      // pointer-events-auto: the parent grid (RecommendationsBody) sets
      // pointer-events-none on itself so its own pt/pb-[40px] flip-bulge
      // padding (blank, but real layout space) doesn't intercept clicks
      // meant for whatever's actually above/below the row — see that
      // grid's own comment. Every card opts back in explicitly here, or
      // none of them would be clickable at all.
      className="h-[var(--result-card-height)] [perspective:1100px] cursor-pointer pointer-events-auto max-[1152px]:flex-none max-[1152px]:snap-start min-[993px]:max-[1152px]:w-[22%] min-[741px]:max-[993px]:w-[30%] min-[501px]:max-[741px]:w-[46%] max-[501px]:w-[85%]"
    >
      <div
        className={[
          "relative w-full h-full [transform-style:preserve-3d] transition-transform duration-500 [transition-timing-function:cubic-bezier(.4,.2,.2,1)]",
          flipped ? "[transform:rotateY(180deg)]" : "[transform:rotateY(0deg)]",
        ].join(" ")}
      >
        {/* FRONT */}
        <div
          className={[
            "absolute inset-0 [backface-visibility:hidden] border-[length:var(--border-base)] border-[var(--ink)] shadow-[var(--elev-4)] overflow-hidden flex flex-col transition-opacity duration-200 bg-[var(--surface)]",
            flipped ? "opacity-0 pointer-events-none z-[var(--z-base)]" : "opacity-100 pointer-events-auto z-[var(--z-raised)]",
          ].join(" ")}
        >
          <div className="relative h-[295px] border-b-[length:var(--border-base)] border-b-[var(--ink)] bg-[var(--fill)] overflow-hidden">
            {hasImage ? (
              <Image
                src={series.coverImageUrl as string}
                alt={`${series.title} cover art`}
                fill
                sizes="208px"
                className="object-cover object-top [filter:contrast(1.05)_saturate(0.85)]"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-display text-[length:var(--text-cover)] text-[var(--primary)] opacity-85 leading-none">
                  {series.title[0]}
                </span>
              </div>
            )}
            {/* Dark scrim so overlaid title text stays readable over any
                photo. on-secondary (not ink/surface) because it's the one
                role that's guaranteed dark in every theme — ink/surface
                flip per theme and would go light-on-light in Tide. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[100px] bg-gradient-to-t from-[var(--on-secondary)] to-transparent" />
            {/* items-center normally (centers the single-line hint nicely
                against the 30px icons, which are still the tallest/only
                item defining the row's height in that case), but switches
                to items-start the moment the hint wraps to two lines and
                becomes taller than the icons — items-center would then
                re-center the whole row against that new taller height,
                visibly shifting both icons every time a multi-line hint
                mounts/unmounts. items-start pins them to the row's own top
                edge instead, so only the hint grows downward. hintWrapped
                is measured, not guessed (see the effect above). */}
            <div
              className={[
                "absolute top-[var(--space-md)] left-[var(--space-md)] right-[var(--space-md)] flex gap-[var(--space-sm)]",
                hintWrapped ? "items-start" : "items-center",
              ].join(" ")}
            >
              <IconButton
                size="sm"
                aria-label={lockHint}
                data-title={series.title}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLock(series.title);
                }}
                onMouseEnter={() => setHoveredIcon("lock")}
                onMouseLeave={() => setHoveredIcon(null)}
                onFocus={() => setHoveredIcon("lock")}
                onBlur={() => setHoveredIcon(null)}
                shadow
                backgroundColor={locked ? "var(--secondary)" : "var(--surface)"}
                textColor={locked ? "var(--on-secondary)" : "var(--ink)"}
              >
                {locked ? <LockClosedIcon /> : <LockOpenIcon />}
              </IconButton>
              <IconButton
                size="sm"
                aria-label={swapHint ?? "swap"}
                aria-disabled={swapDisabled}
                onClick={(e) => {
                  e.stopPropagation();
                  // aria-disabled, not the native disabled attribute — a
                  // real disabled button can silently fail to fire hover
                  // events in some browsers, which would break exactly the
                  // hint this button needs to show (explaining *why* it's
                  // disabled). Guarding the handler here instead keeps
                  // hover/focus always reliable.
                  if (swapDisabled) return;
                  onReplace(series.title);
                }}
                onMouseEnter={() => setHoveredIcon("swap")}
                onMouseLeave={() => setHoveredIcon(null)}
                onFocus={() => setHoveredIcon("swap")}
                onBlur={() => setHoveredIcon(null)}
                shadow
                visuallyDisabled={swapDisabled}
              >
                <DiceIcon />
              </IconButton>
              {/* In-flow, not absolute — a normal third flex item sitting to
                  the right of the two icons in the same row (items-center
                  on the row vertically centers it against their 30px
                  height), not below them. min-w-0 (not the flex default
                  min-w-auto) is what lets it actually wrap instead of
                  overflowing the card: flex items refuse to shrink below
                  their content's unwrapped width unless min-width is
                  explicitly relaxed, and cards in this grid can be as
                  narrow as 208px — nowhere near enough for the longest hint
                  ("no series match this mix") on one line. An opaque
                  bordered/shadowed chip (matching the lock/swap IconButtons'
                  own elev-1 treatment), not plain muted text like other hints — this
                  one floats over arbitrary cover art, not a flat surface
                  color, so it needs its own background to stay legible
                  regardless of the photo underneath. */}
              {/* Conditionally mounted, not always-rendered + opacity
                  toggled like every other hint in this app — this one is
                  in-flow now, so an always-present (even invisible) chip
                  would permanently reserve its padding/border footprint
                  next to the icons. Mounting only while there's a hint to
                  show keeps the icon row exactly as wide as its two 30px
                  buttons the rest of the time. */}
              {activeHint && (
                <span
                  ref={hintRef}
                  className="min-w-0 bg-[var(--surface)] border-[length:var(--border-thin)] border-[var(--ink)] shadow-[var(--elev-1)] px-[var(--space-sm)] py-[var(--space-xs)] font-mono text-[length:var(--text-2xs)] text-[var(--ink)]"
                >
                  {activeHint}
                </span>
              )}
            </div>
            {/* Score badge + title/meta stack together, bottom-anchored, so
                the badge naturally sits above the title with no manual
                offset math. Both on-primary — guaranteed light in every
                theme, same reasoning as the scrim above. */}
            <div className="absolute inset-x-0 bottom-0 flex flex-col items-start gap-[var(--space-sm)] px-[var(--space-lg)] pb-[var(--space-md)]">
              <div
                className={[
                  "font-display text-[length:var(--text-sm)] tracking-[var(--tracking-lg)] border-[length:var(--border-thin)] border-[var(--ink)] px-[var(--space-md)] py-[var(--space-xs)] -rotate-[4deg] shadow-[var(--elev-1)]",
                  perfect ? "bg-[var(--secondary)] text-[var(--on-secondary)]" : "bg-[var(--surface)] text-[var(--ink)]",
                ].join(" ")}
              >
                {scoreLabel}
              </div>
              <div>
                <h3 className="font-body font-black text-[length:var(--text-md)] leading-[var(--leading-tight)] text-[var(--on-primary)] m-0">
                  {series.title}
                </h3>
                <div className="font-mono text-[length:var(--text-xs)] text-[var(--on-primary)] opacity-80 mt-[var(--space-xs)]">{meta}</div>
              </div>
            </div>
          </div>
          {/* relative + overflow-hidden: the reflection/veil below are
              absolutely positioned against THIS box, and the reflection's
              own overscan (see its own comment) needs to be clipped
              exactly at this box's edges, not bleed into the cover image
              above or past the card's own border.

              flex-1: this box's own auto (content-driven) height doesn't
              quite reach the bottom of FRONT's fixed --result-card-height —
              FRONT is flex-col with the 295px cover fixed above this, and
              this wrapper's natural height (padding + TagScrollArea's own
              121px) leaves a few px of FRONT's own flex-col unclaimed at
              the very bottom. That gap always existed but was invisible
              before this change, since it just showed more of the same
              flat --surface FRONT itself is filled with — confirmed live
              as a real (if previously harmless) layout quirk the moment
              this box's background became visually distinct from FRONT's:
              a thin mismatched --surface line right above the card's own
              border. flex-1 makes this box stretch to claim exactly
              FRONT's true remaining space instead of just its own
              content's height, so the reflection/veil below cover all of
              it, regardless of the precise px math between the cover's
              fixed height and TagScrollArea's own. */}
          <div className="relative overflow-hidden flex-1 px-[var(--space-lg)] pt-[var(--space-lg)] pb-[var(--space-lg)]">
            {hasImage && !reflectionBroken && (
              <>
                {/* Reflection: the same cover, flipped and heavily blurred —
                    "pure color/mood, no recognizable detail," not a literal
                    mirror continuation of the sharp cover's exact pixels
                    (the two crops are independent regions of very
                    different heights, so pixel-for-pixel continuity at the
                    seam was never achievable here, and the blur makes it a
                    non-issue anyway). aria-hidden: purely decorative, the
                    real alt text lives on the sharp cover above.
                    sizes="48px" (vs. the sharp cover's own "208px") is
                    deliberate — this only needs to read as a soft color
                    wash after ~18px of blur, so a much smaller optimized
                    variant keeps the download/decode cost low without any
                    visible quality loss once blurred; see this file's own
                    top-level notes on why this stayed a plain CSS blur
                    rather than a separate pre-blurred asset. */}
                <div className="absolute inset-0 overflow-hidden">
                  {/* -inset-[24px]: overscans this box by more than the
                      18px blur radius on every side, so the blur always has
                      real image pixels to draw from right up to the
                      visible edge — confirmed live as a real bug otherwise:
                      without this, `filter: blur` has nothing to sample
                      beyond the element's own rendered content, so the
                      edges nearest the box boundary come out visibly
                      lighter/faded (less "energy" in the Gaussian kernel),
                      an unwanted vignette rather than a uniform wash. The
                      outer div's own overflow-hidden clips this back down
                      to the true visible box. */}
                  <div className="absolute -inset-[24px]">
                    <Image
                      src={series.coverImageUrl as string}
                      alt=""
                      aria-hidden="true"
                      fill
                      sizes="48px"
                      className="object-cover object-top [transform:scaleY(-1)] [filter:blur(18px)]"
                      onError={() => setReflectionBroken(true)}
                    />
                  </div>
                </div>
                {/* Veil: --cover-reflection-veil (globals.css) — a
                    translucent wash of this theme's --slot-empty over the
                    reflection, so the tag area reads as this app's own
                    muted surface with a hint of the cover's mood, on any
                    cover, dark or bright — not the photo itself bleeding
                    through. Bump that token's opacity (not this file) if a
                    future cover is ever found to need more. */}
                <div className="absolute inset-0 bg-[var(--cover-reflection-veil)]" />
              </>
            )}
            {/* relative: keeps this in front of the two absolutely
                positioned decorative layers above regardless of paint-order
                edge cases — normal-flow content after positioned siblings
                already paints on top in every browser, but this is cheap
                insurance and matches how the rest of this file treats
                local front/back stacking explicitly rather than relying on
                implicit DOM-order behavior. surfaceColor matches the same
                veil token, but fadeSize is 0 whenever the veil is active —
                tried keeping the 4px fade (matching surfaceColor) first,
                and it read as a visible seam, not a blend: the fade adds
                more of the *same* translucent veil color on top of the
                veil that's already covering the whole area, so the strip
                right at the scroll edge came out visibly more washed-out
                than the rest of the tag area — confirmed live as a real,
                distracting artifact, not a hypothetical. The peek (a
                partially-visible next row) already signals "there's more
                to scroll" on its own, so dropping this depth cue only in
                the veiled case isn't a regression. arrowBackgroundColor
                stays plain --surface (opaque) regardless of fadeSize:
                passing the translucent veil there too made the hover
                arrows nearly invisible against the image behind them
                (confirmed live as a separate real regression), so the
                arrows need their own solid backing either way. */}
            <div className="relative">
              <TagScrollArea
                tags={cardTags}
                selectedTags={selectedTags}
                onChipToggle={onChipToggle}
                surfaceColor={hasImage && !reflectionBroken ? "var(--cover-reflection-veil)" : "var(--surface)"}
                arrowBackgroundColor="var(--surface)"
                fadeSize={hasImage && !reflectionBroken ? 0 : 4}
              />
            </div>
          </div>
        </div>

        {/* BACK */}
        <div
          className={[
            "absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] border-[length:var(--border-base)] border-[var(--ink)] shadow-[var(--elev-4)] overflow-hidden flex flex-col transition-opacity duration-200 bg-[var(--fill)] bg-[radial-gradient(var(--muted)_1.4px,transparent_1.5px)] [background-size:8px_8px]",
            flipped ? "opacity-100 pointer-events-auto z-[var(--z-raised)]" : "opacity-0 pointer-events-none z-[var(--z-base)]",
          ].join(" ")}
        >
          <div className="bg-[var(--primary)] text-[var(--secondary)] font-display text-[length:var(--text-lg)] tracking-[var(--tracking-md)] px-[var(--space-lg)] py-[var(--space-md)] border-b-[length:var(--border-base)] border-b-[var(--ink)] uppercase flex gap-[var(--space-md)] items-baseline">
            WATCH ON
            <span className="font-body font-bold text-[length:var(--text-base)] text-[var(--on-primary)]">配信</span>
          </div>
          <div className="px-[var(--space-lg)] py-[var(--space-lg)] flex flex-col gap-[var(--space-md)] flex-1 overflow-hidden">
            {streams.map((name, di) => (
              <div
                key={name}
                className="flex items-center gap-[var(--space-md)] bg-[var(--surface)] border-[length:var(--border-thin)] border-[var(--ink)] px-[var(--space-md)] py-[var(--space-md)] shadow-[var(--elev-1)]"
              >
                <span className={["w-[14px] h-[14px] flex-none border-[length:var(--border-hair)] border-[var(--ink)]", DOT_CLASSES[di % DOT_CLASSES.length]].join(" ")} />
                <span className="font-body font-bold text-[length:var(--text-base)]">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

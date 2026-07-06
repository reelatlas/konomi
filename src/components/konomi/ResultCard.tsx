import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { scoreSeries, streamsFor } from "@/lib/konomi/scoring";
import { isTagVisibleAtLevel, sortTags } from "@/lib/konomi/tagPool";
import type { LevelKey, ResultEntry, SortKey, TagInfo } from "@/lib/konomi/types";
import { DiceIcon, LockClosedIcon, LockOpenIcon } from "./icons";
import { IconButton } from "./IconButton";
import { ERROR_MESSAGE } from "./RecommendButton";
import { TagScrollArea } from "./TagScrollArea";

const DOT_CLASSES = ["bg-[var(--secondary)]", "bg-[var(--primary)]", "bg-[var(--muted)]"];

// Cover box's own fixed height, matching h-[295px] on that div below — the
// reflection's vertical offset has to equal this exactly (see its own
// comment), so it's one shared constant rather than two numbers that could
// silently drift apart.
const COVER_HEIGHT_PX = 295;
// Both 1px — matching, not stepped (an earlier version stepped this to 3px
// for the reflection). Tested live whether the hairline seam at the
// boundary (masked below with a 1px marginTop overlap on the mirror
// image) was actually caused by the mismatched blur radii rather than the
// sub-pixel rasterization first diagnosed: with both images temporarily
// at the same 1px and the overlap removed, the seam was STILL measurably
// there (pixel-sampled the exact seam row across several cards — a real,
// if faint, brightness spike right at the boundary, not blur-mismatch-
// dependent). So matching the blur wasn't the fix; the overlap (see the
// mirror image's own comment below, and its own -3px tuning) is what's
// actually doing the work — confirmed by re-adding it and re-running the
// same pixel-sample check, which is also how -3 specifically was chosen
// over the original -1.
const REFLECTION_BLUR_CONTINUATION_PX = 0;
const REFLECTION_BLUR_REFLECTED_PX = 1;

// BACK face's own full-bleed cover fill: a blurred copy of the cover as
// BACK's background, mounted directly on BACK's own div (see its JSX
// below) so it flips with the card. Gentle blur (detail would otherwise
// still show through a sharper one) and a fairly high opacity — BACK's own
// content (the WATCH ON header and stream list) still has to read on top
// of it.
const BACK_FILL_BLUR_PX = 10;
const BACK_FILL_OPACITY = 0.9;
const BACK_FILL_SCALE_DOWN = 4;

// TEMPORARILY DISABLED — testing whether touch-pan-y on the article alone
// (see its own comment) is enough for native touch-scroll chaining to reach
// the carousel from the cover, without this manual forwarder at all. If a
// real device confirms native chaining now works: delete this constant and
// the whole effect it gates below. If not: flip this back to true and keep
// the manual forwarder.
const COVER_TOUCH_FORWARD_ENABLED = false;

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
  // Cover-area touch forwarder's own element ref — see the effect below.
  const coverRef = useRef<HTMLDivElement>(null);
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

  // Cover-area touch forwarder: manually drives the results carousel from a
  // horizontal swipe that starts over the cover, instead of relying on the
  // browser's own native touch-scroll chaining reaching it. The cover box
  // isn't a scroll container itself, so in principle a swipe over it should
  // already fall through to the carousel with no help — and that's exactly
  // what a synthetic touch test here showed. But on a real device it
  // doesn't: confirmed live, swiping the cover still doesn't move the
  // carousel, even with touch-action explicitly restated "auto" at every
  // level of the 3D transform stack the cover sits inside (perspective on
  // this article → preserve-3d/rotateY on the flip container → backface-
  // visibility:hidden on this face) — a real-device-only compositor/hit-
  // testing quirk our tooling can't reproduce to debug further. Doing the
  // scroll ourselves, by hand, from raw touch coordinates sidesteps the
  // question entirely: it doesn't depend on native chaining reaching the
  // carousel at all.
  //
  // Same axis-lock shape as MixerBar's own touch handling
  // (handleTouchStart/blockScrollThrough there): accumulate displacement
  // from the gesture's start, decide the axis once a small noise threshold
  // is cleared, hold that decision for the rest of the gesture. Below the
  // threshold, this does nothing at all — no preventDefault, no
  // scrollBy — so a plain tap never gets touched by this and tap-to-flip
  // (the article's own onClick) keeps working exactly as before; a genuine
  // vertical gesture (page scroll) that happens to start on the cover is
  // left alone the same way, once locked "vertical".
  //
  // Once locked "horizontal", forwarding uses the *frame-to-frame* delta
  // (current touch position vs. the previous move's position), not the
  // gesture's cumulative total from start — a drag-to-scroll needs "how far
  // did the finger move since the last frame," the same quantity a native
  // touch-scroll would apply each frame; using the cumulative total instead
  // would try to re-apply the whole gesture's distance on every single
  // move event. Sign is negated (scrollBy({left: -frameDeltaX})): the
  // finger moving left (frameDeltaX negative) should reveal content to the
  // right, i.e. increase scrollLeft — content follows the finger, same
  // direction native touch-scrolling already uses.
  useEffect(() => {
    if (!COVER_TOUCH_FORWARD_ENABLED) return;
    const el = coverRef.current;
    if (!el) return;

    let axis: "horizontal" | "vertical" | null = null;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let snapDisabledOn: HTMLElement | null = null;
    const AXIS_LOCK_NOISE_PX = 3;

    function handleTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      axis = null;
      startX = t.clientX;
      startY = t.clientY;
      lastX = t.clientX;
    }

    function handleTouchMove(e: TouchEvent) {
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (axis === null && (Math.abs(dx) > AXIS_LOCK_NOISE_PX || Math.abs(dy) > AXIS_LOCK_NOISE_PX)) {
        axis = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
      }
      if (axis !== "horizontal") return;

      const horizontalAncestor = el!.closest("[data-scroll-fade-area-horizontal]") as HTMLElement | null;
      const frameDeltaX = t.clientX - lastX;
      lastX = t.clientX;
      if (!horizontalAncestor) return;
      e.preventDefault();
      // Disable scroll-snap-type for the duration of this drag, same
      // reason and same mechanism as the wheel forwarder's identical fix in
      // ScrollFadeArea.tsx (see its own comment) — without it, every
      // forwarded scrollBy lands on a non-snap resting position and gets
      // immediately corrected to the *next full snap point*, regardless of
      // how small the per-frame amount was, which is what actually caused
      // "jumps multiple cards" (not the forwarded amount itself). Touch has
      // a real gesture-end event (touchend/touchcancel below), so this can
      // restore it precisely there instead of needing a debounced timer
      // the way wheel does.
      horizontalAncestor.style.scrollSnapType = "none";
      snapDisabledOn = horizontalAncestor;
      // behavior: "instant", not "auto" — same reason as the wheel
      // forwarder's identical fix in ScrollFadeArea.tsx (see its own
      // comment): the carousel carries scroll-smooth from the snap-release
      // easing fix, so "auto" would defer to that CSS and animate each
      // tiny per-frame forward instead of applying it immediately, which a
      // rapid touchmove stream would turn into stutter/near-no-movement.
      horizontalAncestor.scrollBy({ left: -frameDeltaX, behavior: "instant" });
    }

    function handleTouchEnd() {
      axis = null;
      if (snapDisabledOn) {
        snapDisabledOn.style.scrollSnapType = "";
        snapDisabledOn = null;
      }
    }

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    el.addEventListener("touchcancel", handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, []);

  return (
    <article
      data-title={series.title}
      // data-result-card: lets MixerBar's click-outside-closes-edit-mode
      // listener allowlist this whole card (body, the lock/dice icon
      // buttons, the tag chips — everything rendered inside it) as one
      // zone via a single closest() check, rather than special-casing each
      // control inside it. See MixerBar.tsx's own comment on the allowlist.
      data-result-card
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
      //
      // touch-pan-y (touch-action: pan-y) — TRIAL, unverified: this article
      // is the actual carousel-scroll-participating element (snap-start,
      // a direct child of the horizontal carousel) and is NOT itself
      // 3D-transformed — only its child (the flip-container) is. The
      // earlier touch-action trial restated "auto" on elements *inside*
      // that 3D-transformed subtree (flip-container/FRONT/BACK) but never
      // declared anything here, at the actual boundary between the
      // carousel and the card, which on reflection is the more standard
      // place to say it: pan-y is the textbook token for "this element
      // only handles vertical panning itself; a horizontal gesture isn't
      // mine, defer to my ancestor" — the normal fix for a nested-vertical-
      // scroll-inside-horizontal-carousel, which this structurally is,
      // 3D flip aside. Confirm on a real device whether this (rather than
      // the manual touch-forward handler, gated off below while testing)
      // is enough on its own.
      className="touch-pan-y h-[var(--result-card-height)] [perspective:1100px] cursor-pointer pointer-events-auto max-[1152px]:flex-none max-[1152px]:snap-start min-[993px]:max-[1152px]:w-[22%] min-[741px]:max-[993px]:w-[30%] min-[501px]:max-[741px]:w-[46%] max-[501px]:w-[85%]"
    >
      {/* touch-pan-y here (was touch-auto): confirmed on a real device that
          touch-action: pan-y on the <article> alone fixed native touch-scroll
          chaining for the FRONT face (cover swipes now reach the carousel),
          but the BACK face stayed broken — plausibly because BACK carries
          its OWN [transform:rotateY(180deg)] (see below), nesting a second
          3D transform inside the flip-container's already-3D
          preserve-3d/rotateY, doubly-transformed in a way FRONT (no
          transform of its own, just backface-visibility:hidden) isn't.
          article's own pan-y should already constrain this via touch-action's
          ancestor intersection regardless of what's declared here (auto ∩
          pan-y = pan-y already) — so if intersection alone isn't reaching
          the doubly-transformed BACK correctly, restating pan-y explicitly
          at this level, closer to the actual 3D-transformed elements, is the
          next thing to try. FRONT's own declaration is left alone (still
          "touch-auto" below) since it's already confirmed working and
          doesn't need touching — this only changes the flip-container and
          BACK. Revert to touch-auto here if this doesn't help either. */}
      <div
        className={[
          "touch-pan-y relative w-full h-full [transform-style:preserve-3d] transition-transform duration-500 [transition-timing-function:cubic-bezier(.4,.2,.2,1)]",
          flipped ? "[transform:rotateY(180deg)]" : "[transform:rotateY(0deg)]",
        ].join(" ")}
      >
        <div
          className={[
            "touch-auto absolute inset-0 [backface-visibility:hidden] border-[length:var(--border-base)] border-[var(--ink)] overflow-hidden flex flex-col transition-opacity duration-200 bg-[var(--surface)] shadow-[var(--elev-4)]",
            flipped ? "opacity-0 pointer-events-none z-[var(--z-base)]" : "opacity-100 pointer-events-auto z-[var(--z-raised)]",
          ].join(" ")}
        >
          <div ref={coverRef} className="relative h-[295px] border-b-[length:var(--border-base)] border-b-[var(--ink)] bg-[var(--fill)] overflow-hidden">
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
                {/* Reflection: physically continuous, not a flat blur wash —
                    the tag area shows the cover's OWN art continuing
                    downward, upright, from exactly where the sharp crop
                    above cut off (real hidden lower art, never shown by
                    that crop), and only once THAT reaches the source's own
                    true bottom edge does a mirrored copy begin. Verified
                    against several real covers via a disposable prototype
                    (built, compared, deleted — not part of this codebase)
                    before building this: for ordinary anime cover aspect
                    ratios, the handoff to the mirror reliably lands well
                    within this tag area's own height, with room to spare —
                    real cards show more of the cover than that prototype
                    did (a taller tag area, more headroom before the source
                    runs out), so it lands even more comfortably here.

                    One filmstrip, two flat blur zones — not a gradient
                    ramp: the continuation image (real, revealed art) gets
                    a light 1px blur; the mirror image directly below it
                    (the actual reflection) steps up to 3px. This is a hard
                    step at the seam between the two <img> elements, not a
                    cross-fade — and that seam, by construction (see the
                    filmstrip's own comment), already lands exactly where
                    the reflection begins, for any cover's aspect ratio, so
                    the blur step needs no separate measurement to find
                    that boundary — it's just each image's own filter.
                    Deliberately bare right now — no veil, no opacity fade,
                    no masked layers (all present in earlier versions of
                    this effect, all stripped so this two-blur baseline can
                    be judged on its own first). Plain <img>, not next/image:
                    this needs `width:100%;
                    height:auto` — rendering at exactly the same scale the
                    sharp cover's own object-fit:cover crop used — and
                    next/image's `fill` mode hardcodes `position:absolute;
                    height:100%; width:100%` as inline styles a className
                    can't override. Both images share the same src, so the
                    browser's own HTTP cache means this reflection is still
                    one extra request per card, not two. aria-hidden on
                    both: purely decorative, the real alt text lives on the
                    sharp cover above.

                    top: -COVER_HEIGHT_PX (inline, not a Tailwind class —
                    it's the same shared constant the cover's own h-[295px]
                    is built from, so the two can't drift out of sync the
                    way two separately-hardcoded literals could). Shifts
                    this whole (unclipped) filmstrip up by exactly what the
                    sharp crop already consumed, so the visible window
                    below (this box's own overflow-hidden bounds) picks up
                    precisely where that crop left off — no gap, no
                    repeat. block (not the default inline) on both
                    images: an inline image carries a few px of baseline/
                    line-height gap below it, which would otherwise open a
                    hairline seam between the two stacked copies — confirmed
                    live as a real, if subtle, artifact. */}
                <div className="absolute left-0 w-full" style={{ top: -COVER_HEIGHT_PX }}>
                  {/* relative: sizes itself to exactly the continuation
                      image's own box (a plain div wrapping one block-level
                      img takes on that img's height automatically, whatever
                      it happens to render at for this card's width/cover
                      aspect ratio), giving the scrim below an inset-0
                      target that's scoped to the continuation zone only —
                      never the reflection zone past it. */}
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- see comment above: needs width:100%/height:auto, which next/image's fill mode can't do */}
                    <img
                      src={series.coverImageUrl as string}
                      alt=""
                      aria-hidden="true"
                      className="block w-full h-auto"
                      style={{ filter: `blur(${REFLECTION_BLUR_CONTINUATION_PX}px)` }}
                      onError={() => setReflectionBroken(true)}
                    />
                    {/* The cover's own bottom scrim (h-[100px] bg-gradient-to-t
                        from-[var(--on-secondary)] to-transparent), mirrored
                        and re-scaled: solid --on-secondary right at the seam
                        (matching the cover's own bottom edge exactly, so the
                        darkness is continuous across the two, not a jump),
                        fading to fully transparent by the point the
                        continuation ends and the reflection begins —
                        bg-gradient-to-b (not -to-t).

                        top: COVER_HEIGHT_PX, not inset-0 — this <img> above
                        renders the ENTIRE uncropped source (that's how it
                        reveals hidden art below the crop), so its own box
                        starts at the source's true top, same as the sharp
                        cover, not at the seam. inset-0 was tried first and
                        confirmed live as a real bug: the gradient's "solid,
                        0%" stop landed at the image's own top — hidden
                        behind the cover, never actually visible — so by the
                        time the gradient reached the seam (the only part of
                        this box that's actually shown; the rest is clipped
                        by the wrapper below), it had already faded ~90% of
                        the way to transparent, reading as barely-there
                        instead of matching the cover's own solid edge.
                        top: COVER_HEIGHT_PX + bottom-0 scopes this to just
                        the visible remainder instead — the browser
                        computes the resulting height as "this wrapper's
                        full height (the image's own) minus COVER_HEIGHT_PX"
                        automatically, which is exactly the continuation's
                        own visible span, whatever it happens to be for this
                        cover's aspect ratio, without needing to measure it.

                        z-[var(--z-raised)]: this needs to paint ABOVE the
                        veil (a sibling below, outside this wrapper, at
                        z-[var(--z-base)]) so the dark seam stays at full
                        strength instead of being washed out by the veil's
                        own tint — confirmed live as a real regression when
                        the veil was re-added: as the last sibling in DOM
                        order it painted on top of everything, including
                        this scrim, diluting the seam's darkness down to the
                        veil's own faint level. Z-index, not a DOM move: this
                        scrim has to stay nested in the wrapper above (whose
                        auto-height is what scopes it to exactly the
                        continuation's own span, whatever that is for this
                        cover) — physically relocating it after the veil in
                        the DOM would lose that automatic sizing and need
                        its own separate boundary computation instead.
                        Neither this element's own ancestors (this wrapper,
                        the filmstrip above) set a z-index/transform/opacity
                        of their own, so none of them isolate a stacking
                        context in between — this z-index compares directly
                        against the veil's, wherever in the DOM each one
                        actually sits. --z-base/--z-raised (not arbitrary
                        numbers): the same "local front/back pair" token
                        vocabulary this file's own FRONT/BACK card faces
                        already use, for a relationship exactly like this
                        one — two layers with a real order requirement
                        *within* this one card's own reflection, not
                        competing with anything else in the app. */}
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 z-[var(--z-raised)] bg-gradient-to-b from-[var(--on-secondary)] to-transparent"
                      style={{ top: COVER_HEIGHT_PX }}
                    />
                  </div>
                  {/* marginTop: -3 — a deliberate overlap onto the
                      continuation image above, not a gap-closer for a real
                      layout gap (getBoundingClientRect confirms these two
                      images' boxes already meet with zero space between
                      them). This is a sub-pixel rasterization seam instead:
                      confirmed live by disabling both images' blur
                      entirely (line stayed) and by matching both images to
                      the same 1px blur with no overlap (line stayed,
                      pixel-sampled, not eyeballed) — ruling out both "the
                      blur is starved at the edge" and "the two blur radii
                      don't match" as the cause. Applying `transform` here
                      (to flip it) very likely promotes this image to its
                      own compositing layer, rasterized independently of
                      the plain, untransformed image above it — two
                      independently-snapped layers meeting at a fractional
                      CSS pixel boundary (this filmstrip's own height is
                      never a whole number, since it's a scaled cover
                      image) can each round to a different device pixel,
                      leaving a hairline gap neither layer's content
                      actually covers.

                      -3, not -1: pixel-sampled the boundary row (brightness
                      delta against its own ±3-row neighbors, compared
                      against a same-column control sample well away from
                      any seam, to separate real seam artifact from normal
                      image texture) across several cards at -1 through -8.
                      -1 clearly helped but left a measurable residual
                      spike in every card tested. -2 improved on -1 in every
                      sample. -3 improved further on -2 in most samples
                      (one minor exception). Beyond -3 (at -4 and up).
                      results were mixed — flat in some cards, measurably
                      *worse* in others — so more overlap isn't simply
                      better past this point. -3 is the practical minimum
                      from this data, not a perfect zero-residual fix: a
                      small residual remains in some covers even here,
                      apparently entangled with each image's own real
                      content near the boundary, not purely the rasterization
                      mismatch. This image paints after the one above in DOM
                      order, so the overlap simply shows its own (mirrored,
                      near-identical) content over the seam, regardless of
                      which way either layer's sub-pixel edge happened to
                      round. */}
                  {/* eslint-disable-next-line @next/next/no-img-element -- see comment above */}
                  <img
                    src={series.coverImageUrl as string}
                    alt=""
                    aria-hidden="true"
                    className="block w-full h-auto [transform:scaleY(-1)]"
                    style={{ filter: `blur(${REFLECTION_BLUR_REFLECTED_PX}px)`, marginTop: -3 }}
                  />
                </div>
                {/* Veil: --cover-reflection-veil (globals.css) — a
                    translucent wash of this theme's --slot-empty over the
                    whole reflection (both the continuation and the mirror
                    below it), so the tag area reads as this app's own
                    muted surface with a hint of the cover's mood, on any
                    cover, dark or bright — not the photo itself bleeding
                    through. Re-added at 10% (down from an earlier 35%) now
                    that the reflection itself is the physically-continuous
                    upright+mirror version with its own 1px blurs and seam
                    scrim, which already reads as intentional with a much
                    lighter touch than the old flat-blur version needed.
                    Bump that token's opacity (not this file) if a future
                    cover is ever found to need more. TagScrollArea's own
                    surfaceColor stays "transparent" below (unchanged from
                    before this veil came back) — that fade has no color of
                    its own to mismatch against whatever's behind it, veil
                    or no veil, by design; see that prop's own comment.

                    z-[var(--z-base)]: the "back" half of a local pair with
                    the seam scrim's own z-[var(--z-raised)] above (see that
                    element's own comment) — without this, this veil is the
                    last sibling in DOM order and paints on top of
                    everything by default, including the scrim, which
                    confirmed live as a real regression: the seam's dark
                    edge got washed down to this veil's own faint 10% level
                    instead of staying continuous with the cover's bottom.
                    This still covers the WHOLE reflection (both zones) at
                    its own layer — the scrim only wins the small overlap
                    region where both are present (the continuation zone),
                    since it's the only place a z-[var(--z-raised)] sibling
                    exists to out-rank it; everywhere else (the mirror zone,
                    and the continuation zone once the scrim itself has
                    faded to transparent) this veil is the only tint
                    showing, same as before this reordering. */}
                <div className="absolute inset-0 z-[var(--z-base)] bg-[var(--cover-reflection-veil)]" />
              </>
            )}
            {/* z-[2], not just `relative`: this needs to paint above the
                seam scrim's own z-[var(--z-raised)] (1) — plain DOM order
                ("later siblings paint on top") isn't enough here, since the
                scrim's explicit positive z-index already outranks every
                z-index:auto/0 element in this shared stacking context
                regardless of where it sits in the DOM (confirmed live as a
                real regression: with just `relative` here, the tags came
                out dimmed, sitting under the scrim). z-[2] is a literal
                number, not a token — this codebase's --z-base/--z-raised
                pair (globals.css) is explicitly documented as a two-tier
                *local* vocabulary ("just with each other, locally"), and
                this is a third local tier above both, so there's no
                existing named token for it yet; --z-sticky/--z-overlay are
                reserved for unrelated, app-wide stacking concerns and
                would be misleading to borrow here. surfaceColor="transparent":
                ScrollFadeArea's scroll-edge fade is `linear-gradient(...,
                surfaceColor, transparent)` — TagScrollArea's own default
                (--surface, opaque) was tried first here and confirmed live
                as a real, visible seam: a flat opaque-white gradient over
                the raw reflection reads as a hard edge, not a blend, since
                there's no single flat color behind it anymore for that
                gradient to correctly fade into. Fading transparent→
                transparent instead has no color of its own to mismatch
                with, so it's seamless against the bare reflection now AND
                automatically stays seamless if a veil (any color) comes
                back later — nothing here would need to change again.
                arrowBackgroundColor stays plain --surface (opaque)
                though — ScrollFadeArea's arrowBackgroundColor defaults to
                surfaceColor when not given its own value, and an
                arrow that inherited "transparent" here would disappear
                against the reflection the exact same way the veil-era
                arrow legibility fix was needed for; overriding it
                separately keeps the arrows visible regardless of what
                surfaceColor is doing. */}
            <div className="relative z-[2]">
              <TagScrollArea
                tags={cardTags}
                selectedTags={selectedTags}
                onChipToggle={onChipToggle}
                surfaceColor="transparent"
                arrowBackgroundColor="var(--surface)"
              />
            </div>
          </div>
        </div>

        {/* BACK — the old dot-pattern bg is replaced by the full-bleed
            blurred cover fill below. bg-[var(--fill)] stays as the base
            color — the fallback for hasImage-false/broken cards, and
            whatever shows through before the fill image loads.
            touch-pan-y (was touch-auto) — see the flip-container's own
            comment: this face carries its own rotateY(180deg) on top of the
            flip-container's, a doubly-3D-transformed subtree FRONT isn't,
            and is the specific thing that stayed broken on a real device
            after touch-pan-y on the article alone fixed FRONT. Restating it
            here too is the targeted fix being tried. */}
        <div
          className={[
            "touch-pan-y absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] border-[length:var(--border-base)] border-[var(--ink)] overflow-hidden flex flex-col transition-opacity duration-200 bg-[var(--fill)] shadow-[var(--elev-4)]",
            flipped ? "opacity-100 pointer-events-auto z-[var(--z-raised)]" : "opacity-0 pointer-events-none z-[var(--z-base)]",
          ].join(" ")}
        >
          {/* Full-bleed cover fill — own BACK_FILL_* constants (see their
              own comment). Plain inset-0, no offset/translate: fills the
              WHOLE face. */}
          {hasImage && !reflectionBroken && (
            <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ opacity: BACK_FILL_OPACITY }}>
              <div
                className="absolute inset-0"
                style={{
                  width: `${100 / BACK_FILL_SCALE_DOWN}%`,
                  height: `${100 / BACK_FILL_SCALE_DOWN}%`,
                  transformOrigin: "top left",
                  transform: `scale(${BACK_FILL_SCALE_DOWN})`,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- plain <img>, blurred well past next/image's own optimized sizes mattering, sharing the sharp cover's cached URL */}
                <img
                  src={series.coverImageUrl as string}
                  alt=""
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    filter: `blur(${BACK_FILL_BLUR_PX / BACK_FILL_SCALE_DOWN}px)`,
                  }}
                />
              </div>
            </div>
          )}
          <div className="relative bg-[var(--primary)] text-[var(--secondary)] font-display text-[length:var(--text-lg)] tracking-[var(--tracking-md)] px-[var(--space-lg)] py-[var(--space-md)] border-b-[length:var(--border-base)] border-b-[var(--ink)] uppercase flex gap-[var(--space-md)] items-baseline">
            WATCH ON
            <span className="font-body font-bold text-[length:var(--text-base)] text-[var(--on-primary)]">配信</span>
          </div>
          <div className="relative px-[var(--space-lg)] py-[var(--space-lg)] flex flex-col gap-[var(--space-md)] flex-1 overflow-hidden">
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

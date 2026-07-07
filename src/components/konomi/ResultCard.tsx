import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { scoreSeries, streamsFor } from "@/lib/konomi/scoring";
import { isTagVisibleAtLevel, sortTags } from "@/lib/konomi/tagPool";
import type { LevelKey, ResultEntry, SortKey, TagInfo } from "@/lib/konomi/types";
import { DiceIcon, LockClosedIcon, LockOpenIcon } from "./icons";
import { IconButton } from "./IconButton";
import { RatingBadge } from "./RatingBadge";
import { ERROR_MESSAGE } from "./RecommendButton";
import { TagScrollArea } from "./TagScrollArea";

const DOT_CLASSES = ["bg-[var(--secondary)]", "bg-[var(--primary)]", "bg-[var(--muted)]"];

// True on mouse/trackpad devices, false on touch-only ones — defaults to
// true (desktop's own existing behavior, unchanged) until the one-time
// client-side matchMedia check resolves post-hydration, so SSR output
// always matches the default and there's no hydration mismatch warning.
// Not a persistent listener (no addEventListener for changes mid-session,
// e.g. a 2-in-1 laptop's mouse getting connected/disconnected) — this app
// has no other reactive capability-detection like that, and the lock hint
// re-rendering out from under a held hover isn't worth the extra
// machinery for a case nobody's asked for yet.
function useSupportsHover(): boolean {
  const [supportsHover, setSupportsHover] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupportsHover(window.matchMedia("(hover: hover)").matches);
  }, []);
  return supportsHover;
}

// The cover's rendered height whenever the reflection below it is actually
// visible — NOT the cover's own height in general anymore. Since the
// one-viewport-fit feature (see globals.css's --result-card-height), the
// cover is flex-1 (grows/shrinks with the card's own clamped height), so
// it no longer has one fixed height at all — except inside the reflection
// block itself, which only renders above a height-gated breakpoint
// (`hidden [@media(min-height:731px)]:contents`, below) chosen
// specifically so it's ONLY reachable once the card is pinned at its
// clamp ceiling (445px). At that ceiling, cover's height is exactly
// 445 − 138 (tag-wrapper's own fixed cost: 8+8px padding + 121px tags) −
// 4 (front face's own 2px top + 2px bottom border) = 303 — a real,
// derived value, not the old 295 (a stale leftover from when cover had a
// single fixed height everywhere). This constant is only ever correct
// where the reflection renders, by construction of that gate — it isn't
// meant to describe the cover at smaller sizes, where the reflection
// doesn't render at all.
const COVER_HEIGHT_PX = 303;
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
  // True for exactly the first render of the brand-new instance mounted
  // right after a swap replaced this grid slot's series (see
  // RecommendationsBody's own justSwappedIndex comment for why a new
  // instance mounts at all). Seeds hoveredIcon (below) so the swap hint
  // shows immediately, matching lock's own tap-to-show UX — lock never
  // needs this since toggling it never changes series.title, so the same
  // instance and its state persist across that toggle already.
  startWithSwapHint?: boolean;
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
  startWithSwapHint,
}: ResultCardProps) {
  // Lazy initializer — only runs on this instance's actual first render, so
  // a later re-render with a still-true startWithSwapHint prop (harmless
  // leftover in the parent, see its own comment) can't re-trigger this.
  const [hoveredIcon, setHoveredIcon] = useState<"lock" | "swap" | null>(() => (startWithSwapHint ? "swap" : null));
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
  // aria-label stays action-oriented always ("lock"/"unlock" — what
  // activating the button does), regardless of hover support: a screen
  // reader's accessible name should describe the action, not echo a visual
  // state confirmation only sighted touch users see.
  const lockHint = locked ? "unlock" : "lock";
  const supportsHover = useSupportsHover();
  // The *visual* subtext is a different story on touch: with no hover to
  // preview "what tapping will do" before you do it, the hint only ever
  // appears *after* the tap already changed the state (see hoveredIcon's
  // own comment on the mobile tap-to-reveal pattern) — so showing the same
  // action-oriented "unlock" right after the user just locked the card
  // reads as confusing (reported live: "why does it say unlock, I just
  // locked it"). Hover-capable devices keep the action framing (correct
  // there, since it previews a decision not yet made); touch instead shows
  // a state confirmation — "locked"/"unlocked" — matching what the tap
  // that revealed it already did.
  const lockDisplayHint = supportsHover ? lockHint : locked ? "locked" : "unlocked";
  const activeHint = hoveredIcon === "lock" ? lockDisplayHint : hoveredIcon === "swap" ? swapHint : null;
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
      // [perspective:1100px] moved OFF this element — see the new wrapper
      // div just inside, below. Every earlier attempt to get native
      // scroll-gesture chaining working assumed the 3D flip stack itself
      // (preserve-3d/rotateY/backface-visibility) was the obstruction —
      // this was the one that actually worked, confirmed live: having THIS
      // element — the actual carousel snap-item/gesture-participating box
      // — ALSO be the one establishing the 3D perspective (perspective
      // alone, with no transform of its own, still makes an element
      // establish its own stacking context per spec) is what was confusing
      // native gesture routing, since the carousel's own scroll-snap math
      // operates directly on this same box. Moving perspective one level
      // down makes this element a completely ordinary, non-3D, non-
      // composited flow box as far as the carousel's own snap/gesture
      // handling is concerned — all the 3D complexity is confined to a
      // descendant instead of coinciding with the snap item itself. Same
      // box size/position (w-full h-full on the new wrapper, matching this
      // element exactly), so the perspective's own depth/vanishing-point
      // renders identically to before.
      //
      // This alone got desktop (mouse/trackpad) fully native everywhere —
      // cover, back, tag area, touch and wheel — and got the tag area
      // native on mobile too, but mobile touch scroll starting on the
      // cover or back specifically never worked natively even with this
      // fix (tried: touch-action variants, a full manual JS forwarder with
      // fling, moving tap-to-flip to a dedicated button, making the cover/
      // back genuine scroll containers, and combinations of those — none
      // of it closed the gap). That's an accepted, current limitation, not
      // something still being actively chased — whole-card tap-to-flip
      // works everywhere (all devices), and native scroll works desktop-
      // everywhere + mobile-via-the-tag-area.
      className="h-[var(--result-card-height)] cursor-pointer pointer-events-auto max-[1152px]:flex-none max-[1152px]:snap-start min-[993px]:max-[1152px]:w-[22%] min-[741px]:max-[993px]:w-[30%] min-[501px]:max-[741px]:w-[46%] max-[501px]:w-[85%]"
    >
      {/* New wrapper: carries perspective now (see the article's own
          comment above for why). relative w-full h-full so the flip-
          container below it (unchanged otherwise) still has the same
          positioning root/size it always did — this wrapper is purely an
          extra layer, not a replacement for anything the flip-container
          itself was doing. */}
      <div className="relative w-full h-full [perspective:1100px]">
      <div
        className={[
          "relative w-full h-full [transform-style:preserve-3d] transition-transform duration-500 [transition-timing-function:cubic-bezier(.4,.2,.2,1)]",
          flipped ? "[transform:rotateY(180deg)]" : "[transform:rotateY(0deg)]",
        ].join(" ")}
      >
        <div
          className={[
            "absolute inset-0 [backface-visibility:hidden] border-[length:var(--border-base)] border-[var(--ink)] overflow-hidden flex flex-col transition-opacity duration-200 bg-[var(--surface)] shadow-[var(--elev-4)]",
            flipped ? "opacity-0 pointer-events-none z-[var(--z-base)]" : "opacity-100 pointer-events-auto z-[var(--z-raised)]",
          ].join(" ")}
        >
          {/* flex-1, not a fixed h-[295px] anymore — this box now grows/
              shrinks with the card's own clamped height (see globals.css's
              --result-card-height), so it can shrink at small viewports
              without clipping the tag area below it. The tag-wrapper
              sibling below is shrink-0 (its own fixed content size,
              protected) specifically so *this* box is the one that
              absorbs the card's total height changing, never the tags. */}
          <div className="relative flex-1 border-b-[length:var(--border-base)] border-b-[var(--ink)] bg-[var(--fill)] overflow-hidden">
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
                  // e.currentTarget.focus(): mobile Safari/Chrome don't
                  // reliably focus a plain, already-mounted <button> from a
                  // tap the way a mouse click does natively — confirmed live
                  // as a real bug, not a hypothetical: tapping swap (which
                  // gets real focus via autoFocus on its post-swap remount,
                  // see that prop's own comment below) then tapping lock
                  // right after correctly blurred swap but never actually
                  // focused lock, so hoveredIcon landed on null instead of
                  // "lock" — the swap hint vanished but lock's never took
                  // its place. Forcing focus explicitly here, the same way
                  // autoFocus forces it for swap's remount case, makes tap
                  // always establish genuine DOM focus regardless of
                  // whether the browser's own default tap behavior would
                  // have bothered — which is what makes onBlur below fire
                  // correctly for the *next* tap, on whichever icon it
                  // lands on, every time.
                  e.currentTarget.focus();
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
                // autoFocus, tied to startWithSwapHint (only ever true on
                // this exact instance's first render — see hoveredIcon's
                // own comment): a swap replaces this whole card (new key,
                // new mount), so there's no click event on *this* instance
                // to hook a focus() call into — the tap that triggered the
                // swap happened on the old, now-destroyed instance. autoFocus
                // is what gives this brand-new node real focus on mount, so
                // the onBlur below can later fire for it like any other
                // focused element.
                autoFocus={startWithSwapHint}
                onClick={(e) => {
                  e.stopPropagation();
                  // e.currentTarget.focus() — same reasoning as lock's own
                  // onClick above: an ordinary tap on this already-mounted
                  // button (not the post-swap remount autoFocus covers)
                  // can't be trusted to focus it natively on mobile, so
                  // force it explicitly every time, disabled or not.
                  e.currentTarget.focus();
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
                {/* pr-[85px]: reserves horizontal clearance for RatingBadge
                    (bottom-right of the cover, below), so a long title's
                    own wrapped last line can't run underneath/behind it —
                    confirmed live as a real bug without this: a 2-line
                    title's second line visually collided with the badge at
                    375px width (this h3 has no width constraint of its own
                    otherwise, so it wraps at the cover's full width,
                    unaware the badge occupies part of that space in the
                    corner). 85px is the badge's own worst-case width
                    (~50px, a 2-ghost GOOD-tier "10.0" plate) plus its
                    24px right-inset plus a small gap — reserved on every
                    line, not just the last, since which line ends up
                    nearest the badge depends on the title's own length. */}
                <h3 className="font-body font-black text-[length:var(--text-md)] leading-[var(--leading-tight)] text-[var(--on-primary)] m-0 pr-[85px]">
                  {series.title}
                </h3>
                <div className="font-mono text-[length:var(--text-xs)] text-[var(--on-primary)] opacity-80 mt-[var(--space-xs)]">{meta}</div>
              </div>
            </div>
            {/* AniList rating badge — bottom-right of the cover, above the
                tag section below it (a sibling, not part of this box).
                right-[24px]/bottom-[22px]: NOT flush against the corner —
                reserves clearance for RatingBadge's own ghost echoes, which
                extend up to (16,14)px further toward the bottom-right of
                the plate itself (GOOD tier, its own farthest ghost). Confirmed
                live at every required breakpoint (375px, the 640-992px
                carousel tier, and >=1024px) that the farthest ghost's own
                clearance to this box's edge lands at a consistent, positive
                8px (right) / 10px (bottom) at this inset — comfortably
                inside the clip boundary at every width tested, not a
                near-miss. Last child of this box (not the scrim/icon-row/
                title's own DOM position) so it reliably paints on top of
                all of them via plain DOM order — nothing here has an
                explicit z-index, so order is what decides it (see
                DESIGN_SYSTEM.md's Z-index scale section). */}
            <div className="absolute right-[24px] bottom-[22px]">
              <RatingBadge averageScore={series.averageScore} />
            </div>
          </div>
          {/* relative + overflow-hidden: the reflection/veil below are
              absolutely positioned against THIS box, and the reflection's
              own overscan (see its own comment) needs to be clipped
              exactly at this box's edges, not bleed into the cover image
              above or past the card's own border.

              shrink-0, not flex-1 — inverted from the original version of
              this box (see git history): back then, cover had a fixed
              height and THIS box absorbed whatever of FRONT's own fixed
              --result-card-height was left over. Now that
              --result-card-height is itself a clamp() that shrinks at
              small viewports (one-viewport-fit feature, globals.css), the
              box that stretches/shrinks with the card's total height must
              be the one that's safe to compress — the cover (now flex-1,
              above) — not this one, which holds the actual tags and must
              never be crushed below its own real content. shrink-0 locks
              this box at exactly its natural size (padding + TagScrollArea's
              121px) regardless of how much or little room FRONT's own
              flex-col has left after the cover claims its share.

              pt/pb space-md (8px), not space-lg (12px) — px stays lg,
              unchanged, since only the *vertical* budget matters for the
              clamp; trimmed 4px off each of pt/pb specifically to help
              reclaim height at the small end (see globals.css's own
              comment on the breakdown); applied at every size, not
              conditionally, to
              avoid a second breakpoint ladder just for padding. */}
          <div className="relative overflow-hidden shrink-0 px-[var(--space-lg)] pt-[var(--space-md)] pb-[var(--space-md)]">
            {hasImage && !reflectionBroken && (
              // hidden [@media(min-height:731px)]:contents — the
              // reflection now only renders above a real viewport-height
              // threshold, not at every size: one-viewport-fit (see
              // globals.css) shrinks the card at small viewports, and
              // splitting that already-tight space between cover and
              // reflection would cramp both, so below this gate the tag
              // area just shows the full cover crop + its own scrim with
              // no reflection at all — cleaner than a squeezed one.
              // 731px is derived, not guessed: the card's own clamp()
              // reaches its 445px ceiling (cover locked at exactly 303px,
              // the value COVER_HEIGHT_PX now uses — see that constant's
              // own comment) once 100dvh ≥ 445 + header-row + 48 (both
              // gaps) + mixer-bar; at this row's own baseline tier
              // (64.86px header, 172.5px mixer) that's 730.36px, rounded
              // up to 731 so the gate never fires a single pixel before
              // cover is genuinely at 303 — no partial/misaligned band.
              // Scoped to width ≥375px (this feature's own stated
              // baseline): at the row-mode header tier (≥417px width)
              // the true crossover is lower (~702px), so this single
              // gate is conservative there (a short window where cover
              // is already at 303 but the reflection hasn't revealed
              // yet) rather than unsafe — deliberately one simple gate
              // instead of a second one keyed to card-width tiers.
              // display:contents (not e.g. flex/block) once shown: keeps
              // every child a direct participant in the tag-wrapper's
              // own layout/stacking, exactly as if this wrapper weren't
              // here at all — same technique ResultsHeader.tsx's own
              // data-clear-results span already uses.
              <div className="hidden [@media(min-height:731px)]:contents">
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
              </div>
            )}
            {/* Small-card blurred-cover fill — below the 731px reflection
                gate above, there's no physically-continuous reflection to
                show through the veil, so without this the tag area's only
                background was a flat --fill color under a 10% tint: just a
                muted swatch, no actual cover mood coming through. Reuses
                BACK's own full-bleed blurred-cover technique verbatim (same
                BACK_FILL_* constants — this is that same treatment, not a
                new one) so small cards read as "cover continuing through,
                with the scrim on top" the same way large cards do via the
                real reflection, just a blurred stand-in instead of the
                genuine continuation. Complementary breakpoint to the
                reflection block above (hidden ABOVE 731px instead of below
                it) — once the real reflection is showing there's nothing
                for this to add, and it's never wanted layered underneath
                it either. No z-index of its own — paints behind the veil's
                explicit z-[var(--z-base)] by the same static-vs-positioned
                stacking rule documented in MixerBar.tsx, not by DOM order,
                so it doesn't need to out-rank anything explicitly. */}
            {hasImage && !reflectionBroken && (
              <div
                aria-hidden="true"
                className="absolute inset-0 pointer-events-none [@media(min-height:731px)]:hidden"
                style={{ opacity: BACK_FILL_OPACITY }}
              >
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
            {/* Veil: --cover-reflection-veil (globals.css) — a translucent
                wash of this theme's --slot-empty over the tag area, so it
                reads as this app's own muted surface with a hint of the
                cover's mood, on any cover, dark or bright — not the photo
                itself bleeding through. Deliberately OUTSIDE the height
                gate above (unlike the continuation/mirror images) — this
                is a real, previously-shipped bug fix, not a stylistic
                choice: the veil's own positioning (absolute inset-0,
                sized against this tag-wrapper) has zero dependency on
                COVER_HEIGHT_PX or the reflection's pixel alignment, unlike
                the continuation images, so there was never a correctness
                reason to hide it at small viewports too. Bundling it into
                the same gate as the height-dependent images left the tag
                area with no background at all below the threshold ("full
                cover + reverse scrim at all sizes, only the mirrored
                reflection tail is gated" was the actual spec — this veil
                *is* that reverse scrim). Still gated on hasImage &&
                !reflectionBroken (no image, no mood to tint from), just
                not on viewport height. Re-added at 10% (down from an
                earlier 35%) now that the reflection itself (where it
                shows) is the physically-continuous upright+mirror version
                with its own 1px blurs and seam scrim, which already reads
                as intentional with a much lighter touch than the old
                flat-blur version needed. Bump that token's opacity (not
                this file) if a future cover is ever found to need more.
                TagScrollArea's own surfaceColor stays "transparent" below
                (unchanged from before this veil came back) — that fade
                has no color of its own to mismatch against whatever's
                behind it, veil or no veil, reflection or no reflection,
                by design; see that prop's own comment.

                z-[var(--z-base)]: the "back" half of a local pair with the
                seam scrim's own z-[var(--z-raised)] (inside the gated
                block above) — without this, this veil is the last sibling
                in DOM order and paints on top of everything by default,
                including the scrim, which confirmed live as a real
                regression: the seam's dark edge got washed down to this
                veil's own faint 10% level instead of staying continuous
                with the cover's bottom. Where the reflection is gated off
                (small viewports), there's no scrim to out-rank at all —
                this veil is simply the only tint showing, alone, exactly
                as intended for that size. */}
            {hasImage && !reflectionBroken && <div className="absolute inset-0 z-[var(--z-base)] bg-[var(--cover-reflection-veil)]" />}
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
            pointer-events-auto unconditionally (not toggled with
            opacity/z-index like FRONT's own pair) — fix for a real bug
            found earlier: unlike FRONT (interactive from the very first
            render), BACK started non-hit-testable (pointer-events-none)
            and only became a valid touch target later, dynamically, via
            this same class toggle — a known category of mobile WebKit
            touch-dispatch bugs where an element that starts outside the
            hit-test tree doesn't correctly "wake up" for touch when it
            becomes interactive later, even though computed styles read
            correctly at that point. Kept even though the manual touch-
            forward handler that originally motivated it is now gone (see
            git history) — this is a separate, still-real fix, and FRONT
            sitting above it in z-index whenever not flipped means it's
            harmless to leave permanently interactive either way. */}
        <div
          className={[
            "absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] border-[length:var(--border-base)] border-[var(--ink)] overflow-hidden flex flex-col transition-opacity duration-200 bg-[var(--fill)] shadow-[var(--elev-4)] pointer-events-auto",
            flipped ? "opacity-100 z-[var(--z-raised)]" : "opacity-0 z-[var(--z-base)]",
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
      </div>
    </article>
  );
}

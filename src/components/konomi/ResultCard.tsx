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
  // that it actually decoded. Set by the shared cover filmstrip's own
  // onError (see that block's own comment) — the one place the cover
  // image loads from now, so a failure there correctly falls back
  // everywhere at once: cover-box shows its title-letter fallback instead
  // of an empty clipping window, and the tag area's continuation/mirror
  // and veil all stay hidden, exactly as if hasImage had been false from
  // the start.
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
  // "add tags" specifically at filledCount === 0 (not ERROR_MESSAGE
  // ["impossible-min"], "lower MIN TAG MATCH") — that copy assumes a mix
  // already exists and just needs a smaller threshold, which doesn't hold
  // with zero tags selected at all: there's no mix yet to lower a match
  // count against, and the actually-actionable step is adding tags in the
  // first place.
  const swapHint = locked
    ? null
    : filledCount === 0
      ? "add tags"
      : filledCount < minNum
        ? ERROR_MESSAGE["impossible-min"]
        : !canSwap
          ? "no swaps available for this mix"
          : "swap";
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
        // No rotateY(0deg) at rest — same trap as the perspective move onto
        // the wrapper above (this element's own comment): a non-none
        // transform on an ancestor sitting on the scroll-participating path
        // (this div is between the carousel's snap-item and TagScrollArea's
        // own scroll viewport) establishes its own containing block/
        // compositing boundary on real iOS, which can interfere with
        // gesture-chaining through it, even though rotateY(0deg) is visually
        // the identity transform. Omitting the class entirely when !flipped
        // is a safe no-op: `none` and `rotateY(0deg)` render identically,
        // transition-transform still animates smoothly between `none` and a
        // real transform value in both directions (spec-supported, all
        // major engines), and FRONT/BACK's own `absolute inset-0` resolve
        // identically either way — the wrapper above is also `position:
        // relative` at this element's own exact size, so it's an equally
        // valid absolute-positioning containing block whether or not this
        // element currently has its own. The transform still applies while
        // actually flipped/flipping — that's required for the visual effect
        // and isn't the path a horizontal carousel swipe needs at that
        // moment anyway.
        className={[
          "relative w-full h-full [transform-style:preserve-3d] transition-transform duration-500 [transition-timing-function:cubic-bezier(.4,.2,.2,1)]",
          flipped ? "[transform:rotateY(180deg)]" : "",
        ].join(" ")}
      >
        <div
          className={[
            "absolute inset-0 [backface-visibility:hidden] border-[length:var(--border-base)] border-[var(--ink)] overflow-hidden flex flex-col transition-opacity duration-200 bg-[var(--surface)] shadow-[var(--elev-4)]",
            flipped ? "opacity-0 pointer-events-none z-[var(--z-base)]" : "opacity-100 pointer-events-auto z-[var(--z-raised)]",
          ].join(" ")}
        >
          {/* Shared cover filmstrip — the ONE mechanism now, at every card
              size, for "the cover continues into the tag area, and
              eventually reflects once the real image runs out." Two plain
              <img>s (not next/image — see below), stacked in normal block
              flow: a continuation copy first (real, revealed art), then a
              mirrored copy directly below it (flipped, blurred). Neither
              uses object-fit: cover — each renders the ENTIRE image at its
              own natural scale (width:100%; height:auto), so the seam
              between real content and the mirror is automatically, exactly
              wherever the first image's own natural rendering ends — not
              something that needs measuring or a hardcoded offset, since
              nothing here is cropped independently of anything else.

              Positioned absolute against FRONT itself (this element's own
              parent — cover-box and tag-wrapper, both below, are its
              siblings, not its ancestors), top-0/left-0/w-full, auto
              height (the filmstrip's own natural stacked height — two
              portrait covers' worth, comfortably taller than this card's
              own max ~445px clamp ceiling, so there's always slack; FRONT's
              own overflow-hidden clips whatever's left over regardless).
              Each of cover-box's and tag-wrapper's own overflow-hidden
              windows reveals whichever slice of this ONE filmstrip falls
              inside it — cover-box's own window (the sharp top crop) shows
              the very top of the continuation image, at its own natural
              width-scale; tag-wrapper's window picks up exactly where that
              leaves off, and shows real, revealed content for as long as
              the source hasn't run out yet — becoming the mirror
              automatically the moment it has, since that's simply further
              down the same stacked filmstrip. No breakpoint, no per-card-
              height gate, no COVER_HEIGHT_PX-style constant (removed
              entirely, see git history): this one filmstrip is correct at
              every card height continuously, because the transition point
              is a property of the filmstrip's own layout, not something
              computed against the viewport.

              Cover art is portrait relative to this card's own width in
              every real case this app ships — confirmed directly against
              the actual source this time, not just inferred: AniList's own
              "medium" cover tier, 230px wide, ~320-345px tall, aspect
              ~0.67-0.72, consistently taller than wide. That's what makes
              each image's own natural-scale rendering land at the same
              effective zoom cover-box's own object-fit:cover crop used to
              get (width-driven scaling is independent of height) — nothing
              here is a re-crop or a different zoom, just more of the same,
              already-correctly-scaled image.

              Plain <img>, not next/image, for both: this needs width:100%;
              height:auto (natural scale), and next/image's fill mode
              hardcodes position:absolute; height:100%; width:100% as
              inline styles a className can't override — the same reason
              the old reflection block never used next/image for its own
              two images either. This is now the ONLY place the cover image
              loads from at all (cover-box's own former next/image instance
              is gone — see that box's own comment) — one request per card,
              shared via the browser's own HTTP cache between this image
              and its own mirrored copy below, not the three separate
              requests three independent Image/img instances would've
              made. Checked the trade against next/image's own
              optimization before building: the actual source files are
              already small (20-105KB, AniList's own pre-sized "medium"
              tier), so there's no large-original-image cost being newly
              introduced by dropping it here.

              contrast(1.05)/saturate(0.85) on both — the same filter
              cover-box's own crop always used — kept on the mirror too
              (the old, since-removed reflection block never applied it to
              either of its own images) for one consistent look across all
              three tiers now that they're one filmstrip, rather than
              reverting the continuation tier back to unfiltered: this
              matches what was already built and confirmed live for the
              continuation tier specifically, just extended to the mirror
              for internal consistency.

              Placed first, before both cover-box and tag-wrapper, with an
              explicit z-[var(--z-base)] (below) rather than relying on
              plain z-index:auto + later-DOM-order-wins stacking to keep it
              behind them — see this file's own history for why explicit
              beats incidental here. bg-[var(--fill)] on this wrapper (not
              cover-box anymore — see that box's own comment) is the
              loading-placeholder color shown before the image paints, same
              role --fill always played here, just relocated to where the
              image itself now lives. block (not the default inline) on
              both images: an inline image carries a few px of baseline/
              line-height gap below it, which would otherwise open a
              hairline seam between the two stacked copies — confirmed
              live as a real, if subtle, artifact.

              No pointer-events-none/touch-none here — a first version of
              this fix added both, reported live as NOT fixing a real
              regression (below) and reverted. This app already has a
              directly on-point, previously-confirmed precedent for exactly
              this situation (RecommendationsBody's own carousel viewport,
              see that file's own comment): pointer-events-none on/near a
              scroll container can disqualify it from native touch-scroll-
              gesture-*chaining* entirely on real mobile WebKit, not just
              from click hit-testing — confirmed there for the scroll
              container's own wrapper directly; the fix was resolving the
              overlap via explicit z-index (paint order) instead of via a
              disqualifying property, so the scroll container's own
              pointer-events stay at the default auto. This wrapper never
              needed pointer-events-none for correctness in the first
              place — cover-box's own opaque bg-[var(--fill)] and its own
              later-DOM-order Image already hide it there regardless of its
              own pointer-events, and tag-wrapper (below) hides it the same
              way once given its own explicit z-index instead of relying on
              DOM order alone (see that box's own comment) — so there's no
              upside left to weigh against the downside risk pointer-
              events-none/touch-action:none carry on real iOS.

              This layer's own mirrored image (below) carries
              transform:scaleY(-1) — a transform that typically promotes an
              element onto its own GPU compositing layer — and unlike the
              old, since-removed reflection this replaced (only ever
              mounted above a 731px viewport-height gate), this one is now
              mounted at every card size, unconditionally. Reported live as
              a regression, real-iOS-only (Safari and Chrome-iOS both —
              same underlying WebKit; doesn't reproduce in headless/
              emulated Chromium, where a plain elementFromPoint() check at
              the tag-scroll touch point already resolves correctly to the
              scroll viewport regardless of any of this): the tag area's
              own vertical scroll stopped responding to a real touch drag
              on cards where this filmstrip — mirror included — is now
              always present. Explicit z-index, not a disqualifying
              property, is the fix this app already has direct, confirmed
              precedent for; still can't be verified outside a real device,
              so treat this as the leading hypothesis until confirmed
              on-device, same as the touch-action attempt it replaces. */}
          {hasImage && !reflectionBroken && (
            <div className="absolute left-0 top-0 w-full z-[var(--z-base)] bg-[var(--fill)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- needs width:100%/height:auto (natural scale), which next/image's fill mode can't do — see this whole block's own comment above */}
              <img
                src={series.coverImageUrl as string}
                alt=""
                aria-hidden="true"
                className="block w-full h-auto [filter:contrast(1.05)_saturate(0.85)]"
                onError={() => setReflectionBroken(true)}
              />
              {/* marginTop: -3 — a deliberate overlap onto the continuation
                  image above, not a gap-closer for a real layout gap (this
                  is the identical sub-pixel rasterization seam the old
                  reflection block's own equivalent comment pixel-sampled
                  and tuned — see git history for the full -1-through-8
                  comparison behind choosing -3 specifically; same two
                  images, same cause, unchanged here). */}
              {/* eslint-disable-next-line @next/next/no-img-element -- see comment above */}
              <img
                src={series.coverImageUrl as string}
                alt=""
                aria-hidden="true"
                className="block w-full h-auto [filter:contrast(1.05)_saturate(0.85)_blur(1px)] [transform:scaleY(-1)]"
                style={{ marginTop: -3 }}
              />
            </div>
          )}
          {/* flex-1, not a fixed h-[295px] anymore — this box now grows/
              shrinks with the card's own clamped height (see globals.css's
              --result-card-height), so it can shrink at small viewports
              without clipping the tag area below it. The tag-wrapper
              sibling below is shrink-0 (its own fixed content size,
              protected) specifically so *this* box is the one that
              absorbs the card's total height changing, never the tags.

              bg-[var(--fill)] only in the no-image/broken-image case now
              (was unconditional) — the shared filmstrip above (a sibling,
              painting behind this box) is what shows through whenever
              there IS a real image; an unconditional opaque background
              here would hide it completely, defeating the entire point.
              No <Image> of its own anymore either — the filmstrip owns
              every pixel of the actual cover art now, this box is purely a
              clipping window into it (plus its own overlays below: the
              bottom scrim, the icon row) — see the filmstrip's own comment
              above for why this box's own crop is still visually identical
              to what its previous independent <Image> rendered. */}
          <div
            className={[
              "relative flex-1 border-b-[length:var(--border-base)] border-b-[var(--ink)] overflow-hidden",
              hasImage && !reflectionBroken ? "" : "bg-[var(--fill)]",
            ].join(" ")}
          >
            {(!hasImage || reflectionBroken) && (
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
              avoid a second breakpoint ladder just for padding.

              Plain `relative`, no explicit z-index — a z-[var(--z-raised)]
              was tried here (see git history), reasoned as "explicit beats
              incidental, especially on real iOS," matching the
              RecommendationsBody carousel viewport / Clear ✕ precedent.
              That precedent doesn't actually apply the same way, though:
              those cases had a real, confirmed hit-test overlap that
              z-index was resolving. Here, this box already correctly won
              hit-testing via plain DOM order alone (it's the later
              sibling) — the z-index was never fixing a hit-test gap, only
              speculatively added to give this box its own stacking
              context, isolating it from whatever compositing the
              filmstrip's mirror image (transform:scaleY(-1)) needs.
              Confirmed live as a real regression instead: once this box
              had its own explicit z-index/stacking context, a horizontal
              carousel swipe starting over this card's tag area stopped
              reaching the carousel specifically once the tag area had
              real vertical overflow (few-tag cards, no overflow, were
              unaffected) — i.e. the new stacking context itself, not
              pointer-events or touch-action (both already axis-correct;
              see TagScrollArea/ScrollFadeArea), was what broke gesture
              chaining to the carousel. Removed; DOM order alone still
              correctly wins hit-testing against the filmstrip sibling, no
              regression there. */}
          <div className="relative overflow-hidden shrink-0 px-[var(--space-lg)] pt-[var(--space-md)] pb-[var(--space-md)]">
            {/* Continuation scrim — the shared filmstrip (a sibling of
                cover-box, above/outside this whole tag-wrapper — see its
                own comment) shows through here at every card size now;
                this scrim is the one piece specific to *this* box: solid
                right at the top edge (the seam with cover-box, continuous
                with that box's own bottom scrim, which fades the same
                direction in reverse) fading to fully transparent going
                down — the same from-[var(--on-secondary)] to-transparent
                gradient and h-[100px] span the old reflection block's own
                continuation scrim used for the identical purpose (see git
                history), just anchored to this box's own top directly
                instead of a filmstrip-relative COVER_HEIGHT_PX offset
                (this box's "top" already *is* the seam — no offset math
                needed here at all, and no per-card-height gate either: the
                seam always exists, at every size, so this scrim is now
                unconditional, the same way the veil below already was).

                z-[var(--z-raised)]: same local front/back pair as the
                veil's own z-[var(--z-base)] below — without it this would
                be a z-index:auto sibling, and the veil (also explicit-z,
                but a later DOM sibling) would otherwise paint over it,
                washing the seam's darkness down to the veil's own faint
                level. */}
            {hasImage && !reflectionBroken && (
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[100px] z-[var(--z-raised)] bg-gradient-to-b from-[var(--on-secondary)] to-transparent" />
            )}
            {/* Veil: --cover-reflection-veil (globals.css) — a translucent
                wash of this theme's --slot-empty over the tag area, so it
                reads as this app's own muted surface with a hint of the
                cover's mood, on any cover, dark or bright — not the photo
                itself bleeding through. Unconditional on card size, same as
                the continuation scrim above now — there's no height gate
                left anywhere in this file for it to have ever needed to
                match. Still gated on hasImage && !reflectionBroken (no
                image, no mood to tint from). At 10% opacity — light enough
                that the filmstrip's own physically-continuous content
                (unblurred continuation, 1px-blurred mirror) still reads as
                the real subject, not washed out by the tint on top of it.
                Bump that token's opacity (not this file) if a future cover
                is ever found to need more. TagScrollArea's own
                surfaceColor stays "transparent" below — that fade has no
                color of its own to mismatch against whatever's behind it,
                veil or no veil, by design; see that prop's own comment.

                z-[var(--z-base)]: the "back" half of a local pair with the
                continuation scrim's own z-[var(--z-raised)] above —
                without this, this veil is the last sibling in DOM order
                and paints on top of everything by default, including the
                scrim, which confirmed live as a real regression: the
                seam's dark edge got washed down to this veil's own faint
                10% level instead of staying continuous with the cover's
                bottom. */}
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

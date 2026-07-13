import { AnimatePresence } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { LevelKey, ResultEntry, TagInfo } from "@/lib/konomi/types";
import { useAnimationDebugValues } from "./animationDebugStore";
import { getAnimatingPaceCount, getEffectiveStaggerMs, getVisibleCardTierCount } from "./cardAnimTuning";
import { FilterControls } from "./FilterControls";
import { IsBatchClearActiveContext, ResultCard } from "./ResultCard";
import { ScrollFadeArea } from "./ScrollFadeArea";
import { useLevel, useSort } from "./tagPoolPrefs";

// How many cards are visibly "in frame" at the current viewport width, per
// the same breakpoint tiers ResultCard.tsx's own card-width classes already
// use (getVisibleCardTierCount, cardAnimTuning.ts) — drives the stagger
// pace (getAnimatingPaceCount below), requested directly: the stagger is
// perceived relative to how many cards visibly sweep together at once, not
// the total result count, which can be scrolled-past and not simultaneously
// visible at narrower tiers. Defaults to 5 (the grid tier) for SSR/the
// client's own first hydration render — same reasoning as ResultCard.tsx's
// own useSupportsHover: an optimistic desktop default until the client-only
// width check resolves post-hydration, avoiding a hydration mismatch.
// Unlike useSupportsHover, this DOES need to stay live across the session
// (a browser window's width changes far more often at runtime than its
// hover capability does), hence the resize listener.
function useVisibleCardTierCount(): number {
  const [count, setCount] = useState(5);
  useEffect(() => {
    function sync() {
      setCount(getVisibleCardTierCount(window.innerWidth));
    }
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);
  return count;
}

// Empty-state ("zero state") headline/payoff pairs — one is picked at
// random per genuine entry into the empty state (see hasResults' own
// effect below, in the component), never the same one twice in a row.
// Named, exported-shape array specifically so this is easy to edit/extend
// later — add or remove an entry here, nothing else needs to change.
interface EmptyStateCopy {
  headline: string;
  payoff: string;
}
const EMPTY_STATE_COPY: EmptyStateCopy[] = [
  { headline: "GET COOKING", payoff: "a recipe for your soul" },
  { headline: "NEEDLE TO THE WAX", payoff: "tuned to your wavelength" },
  { headline: "ASPIRATE THE SUPERNATANT", payoff: "your essence distilled" },
  { headline: "LAW OF EQUIVALENT EXCHANGE", payoff: "give to gain" },
  { headline: "SKIM THE CREAM", payoff: "crème de la crème" },
  { headline: "ENTROPY", payoff: "gems in the chaos" },
  { headline: "CRANK THE CRANKSHAFT", payoff: "instant ignition" },
  { headline: "WATER THE SAPLINGS", payoff: "grown from your roots" },
  { headline: "PRIME THE CANVAS", payoff: "a symphony in color" },
  { headline: "DECRYPT THE MATRIX", payoff: "there is no spoon" },
  { headline: "THREAD THE NEEDLE", payoff: "precision perfected" },
];
// Fixed across every set, unlike headline/payoff above — the one line that
// always tells the user what to actually do, regardless of which flavor
// text is currently showing. Reuses the same "→" arrow Masthead.tsx's own
// (now-removed) tagline used, for visual continuity with that phrasing.
const EMPTY_STATE_INSTRUCTION = "add tags → recommend → remix";

// Shuffle-bag randomizer, not plain rejection-sampled random: every one of
// EMPTY_STATE_COPY's entries is guaranteed to show exactly once before any
// repeats, drawn in a freshly-shuffled order each cycle — plain "random,
// but not the same as last time" has no memory beyond the immediately
// prior pick, so a handful of entries could show far more often than
// others over many draws even though no two consecutive picks ever match.
// Fisher-Yates, standard and unbiased.
function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// A fresh bag is every index [0..length), shuffled. lastShownIndex (null
// for the very first bag ever, which has no "just shown" item to avoid)
// guards the seam between bags: without this, the tail of one shuffle and
// the head of the next are independent, so the same entry can land both
// last-in-old-bag and first-in-new-bag — a real, visible back-to-back
// repeat exactly at the reshuffle boundary. Swapping the new bag's first
// slot with another one of its own (not the excluded value, and not
// itself) fixes the one colliding case in O(1) — cheaper and just as
// correct as reshuffling the whole bag again and hoping.
function buildEmptyStateBag(lastShownIndex: number | null): number[] {
  const bag = shuffled(EMPTY_STATE_COPY.map((_, i) => i));
  if (bag.length > 1 && bag[0] === lastShownIndex) {
    const swapWith = 1 + Math.floor(Math.random() * (bag.length - 1));
    [bag[0], bag[swapWith]] = [bag[swapWith], bag[0]];
  }
  return bag;
}

// Module-level, in-memory only — see the extended note below on why this
// (not a useState lazy initializer) is what makes the whole bag
// hydration-safe. emptyStateBagQueue holds this cycle's remaining,
// not-yet-shown indices; emptyStateCurrentIndex is whatever's on screen
// right now. Both null/empty until the client's first real draw.
let emptyStateBagQueue: number[] = [];
let emptyStateCurrentIndex: number | null = null;
const emptyStateIndexListeners = new Set<() => void>();

// The one place either module variable above is ever written. Refills the
// queue (with the seam guard) only once it's actually empty, then always
// draws from the front — this single function is what both the very
// first pick (called from getEmptyStateIndexSnapshot below, queue starts
// empty) and every later re-roll (called from rerollEmptyStateIndex) go
// through, so there's exactly one place the shuffle-bag/seam logic lives.
function drawNextEmptyStateIndex(): number {
  if (emptyStateBagQueue.length === 0) {
    emptyStateBagQueue = buildEmptyStateBag(emptyStateCurrentIndex);
  }
  emptyStateCurrentIndex = emptyStateBagQueue.shift()!;
  return emptyStateCurrentIndex;
}

// A plain useState(() => drawNextEmptyStateIndex()) lazy initializer looks
// right but isn't hydration-safe: it would run Math.random() (inside the
// shuffle) during BOTH the server's render pass and the client's separate
// hydration render pass, and since Math.random() isn't seeded, they'd
// disagree — confirmed live as a real hydration-mismatch error before
// this was fixed (server picked one headline, client picked a different
// one, forcing React to discard and re-render the whole tree). Same root
// cause, and same fix, this codebase's own tagPoolPrefs.ts already
// established for usePoolPanelHeight/useDefaultPoolPanelHeight: a
// useSyncExternalStore-backed value, not useState+useEffect (rejected by
// this project's own react-hooks/set-state-in-effect lint rule for the
// extra cascading render it causes on every mount — see DESIGN_SYSTEM.md's
// own writeup of that exact tradeoff). getServerSnapshot below returns a
// fixed 0 — identical on every SSR pass and the client's own first
// (hydration) render, so there's nothing left to mismatch, and no bag
// shuffle/draw happens server-side at all — and React automatically
// re-renders once more immediately after hydration once getSnapshot's
// real (bag-drawn) value differs from it, no subscription event needed to
// trigger that. The bag itself is a pure extension of this same mechanism,
// not a parallel one: still exactly one hydration-sensitive read (the
// first draw, guarded below by the emptyStateCurrentIndex === null check),
// and every subsequent draw (reroll included) happens well after mount,
// with no hydration concern of its own.
//
// Plain in-memory module state, not localStorage/tagPoolPrefs.ts — this
// value is deliberately NOT persisted across page loads (component state
// only, by design); the store shape (subscribe/getSnapshot/
// getServerSnapshot) is reused here purely for its hydration-safety
// guarantee, not for cross-session persistence. subscribeEmptyStateIndex's
// callback set has exactly one real subscriber in practice
// (RecommendationsBody itself, always mounted), but is written generally
// in case that ever changes.
function getEmptyStateIndexSnapshot(): number {
  if (emptyStateCurrentIndex === null) {
    return drawNextEmptyStateIndex();
  }
  return emptyStateCurrentIndex;
}

function getEmptyStateIndexServerSnapshot(): number {
  return 0;
}

function subscribeEmptyStateIndex(callback: () => void): () => void {
  emptyStateIndexListeners.add(callback);
  return () => emptyStateIndexListeners.delete(callback);
}

// The only mutator — draws the next bag item (reshuffling first, with the
// seam guard, if the current bag just ran out) and notifies the one
// subscriber to re-render.
function rerollEmptyStateIndex(): void {
  drawNextEmptyStateIndex();
  emptyStateIndexListeners.forEach((listener) => listener());
}

interface RecommendationsBodyProps {
  results: ResultEntry[];
  hasResults: boolean;
  selectedTags: string[];
  filledCount: number;
  minNum: number;
  recommendGen: number;
  // Index of the first genuinely new card in `results` after the last
  // successful RECOMMEND — see useKonomi.ts's own comment on this field.
  // 0 whenever nothing's locked (every card is new), so this is a strict
  // generalization of "always scroll back to the first card," not a
  // separate behavior.
  firstNewIndex: number;
  // Titles freshly picked in the most recent RECOMMEND — see this field's
  // own comment on KonomiState (useKonomi.ts). Gates the enter animation;
  // deliberately not derived from `locked`, so a lock/unlock toggle never
  // replays a card's entrance.
  newTitles: string[];
  // Bumped once per Clear ✕ — see this field's own comment on KonomiState.
  // Drives the exit-animation orchestration below.
  clearGen: number;
  locked: Record<string, boolean>;
  flipped: Record<string, boolean>;
  canSwap: boolean;
  onFlip: (title: string) => void;
  onToggleLock: (title: string) => void;
  onReplace: (title: string) => void;
  onChipToggle: (tag: string) => void;
  tagInfoByName: Map<string, TagInfo>;
  totalSeriesCount: number;
  // Powers the Tag Density/Sort filters embedded in the empty-state box (see
  // FilterControls) — the same handler ResultsHeader threads into the results-
  // state Filter popover, so both surfaces drive the identical level cascade.
  onLevelChange: (level: LevelKey) => void;
}

// Body-only — the section-level chrome (border/shadow/padding) and the
// title/resultsHint/Clear✕ header all moved out to
// TagPoolRecommendationsPanel and PanelToggleHeader respectively, once
// Recommendations became a tab sharing one card with Tag Pool instead of
// its own independent, unbordered section.
export function RecommendationsBody({
  results,
  hasResults,
  selectedTags,
  filledCount,
  minNum,
  recommendGen,
  firstNewIndex,
  newTitles,
  clearGen,
  locked,
  flipped,
  canSwap,
  onFlip,
  onToggleLock,
  onReplace,
  onChipToggle,
  tagInfoByName,
  totalSeriesCount,
  onLevelChange,
}: RecommendationsBodyProps) {
  const level = useLevel();
  const sort = useSort();
  // Live-tweakable via AnimationDebugPanel.tsx — read at the top level (not
  // inside the IIFE below) since hooks can't be called from a nested
  // function, even one invoked synchronously during this same render.
  const { cardStaggerMs } = useAnimationDebugValues();
  // Hydration-safe: 0 on every server render and the client's own first
  // (hydration) render, then automatically resolves to the real random
  // pick right after — see getEmptyStateIndexServerSnapshot's own comment
  // above for why this can't just be a useState lazy initializer. Only
  // this one read is hydration-sensitive; re-rolling below (rerollEmptyStateIndex)
  // runs well after mount, on a genuine hasResults transition, so it has
  // no hydration concern of its own.
  const emptyStateIndex = useSyncExternalStore(
    subscribeEmptyStateIndex,
    getEmptyStateIndexSnapshot,
    getEmptyStateIndexServerSnapshot,
  );
  // Holds hasResults' own value as of the *last time this effect ran*, not
  // a plain every-render mirror (contrast MixerBar.tsx's own ref-mirror
  // pattern, which does update every render via a separate, no-dependency
  // effect) — updated at the end of the same effect below, right after
  // being read, so by construction it only ever reflects the prior
  // distinct value the one time hasResults actually changes again.
  const prevHasResults = useRef(hasResults);
  useEffect(() => {
    // Re-rolled only on a genuine hasResults true->false transition — never
    // on every render, and never while the user is just removing tags from
    // slots one at a time (that never touches hasResults at all; confirmed
    // against every reducer branch in useKonomi.ts — only clearRecs(), and
    // only when no cards are locked, ever flips it back to false).
    if (prevHasResults.current && !hasResults) {
      rerollEmptyStateIndex();
    }
    prevHasResults.current = hasResults;
  }, [hasResults]);
  // Which grid position just had its card swapped, so the brand-new
  // ResultCard instance that mounts there can seed its own hoveredIcon
  // state to "swap" (see ResultCard's own startWithSwapHint comment) —
  // confirmed live as a real bug otherwise: ResultCard keys each card by
  // series.title (see the map below), and swap replaces that title, so
  // React tears down the old instance and mounts a brand new one for the
  // new series — resetting ResultCard's own local hoveredIcon state along
  // with it, unlike lock (which never changes the title, so the same
  // instance and its state persist across a toggle). Indexed by grid
  // position, not title — the whole point is surviving a title change at
  // the same slot, which a title-keyed tracker couldn't do by definition.
  const [justSwappedIndex, setJustSwappedIndex] = useState<number | null>(null);
  // Resets justSwappedIndex back to null the instant a genuine new
  // RECOMMEND lands (render-phase conditional setState, comparing against
  // state rather than a ref — the same pattern this session's MixerBar.tsx
  // work established to satisfy react-hooks/set-state-in-effect and
  // react-hooks/refs simultaneously). Confirmed live as a real bug
  // otherwise: swap a card, then hit RECOMMEND — the fresh card that
  // mounts at that same grid position also satisfies
  // `justSwappedIndex === index` (still stale from the earlier swap), so
  // startWithSwapHint seeded its hoveredIcon to "swap" even though nothing
  // was actually swapped this time, showing the tooltip immediately and
  // (on touch, with no hover to naturally dismiss it) leaving it stuck
  // until the user tapped elsewhere.
  const [lastRecommendGenForSwapHint, setLastRecommendGenForSwapHint] = useState(recommendGen);
  if (recommendGen !== lastRecommendGenForSwapHint) {
    setLastRecommendGenForSwapHint(recommendGen);
    setJustSwappedIndex(null);
  }
  const visibleCardTierCount = useVisibleCardTierCount();
  // True from the moment a Clear ✕ dispatches until every card it removed
  // has actually finished exit-animating out (AnimatePresence's own
  // onExitComplete, below) — replaces the old displayedResults-lagging-
  // state + exitingTitles + setTimeout mechanism entirely (see
  // DESIGN_SYSTEM.md for the migration writeup). `results` itself already
  // updates the instant clearRecs() dispatches (useKonomi.ts is
  // deliberately DOM/animation-free) — AnimatePresence, not a manually
  // lagged copy of `results`, is what keeps a removed card mounted long
  // enough to play its own exit animation now, so this component no
  // longer needs to own that deferral itself.
  //
  // Serves two purposes, both requiring it to stay true for the whole
  // exit window, not just the one render Clear ✕ dispatched on: (1) fed to
  // AnimatePresence's own `custom` prop below, which is what lets a
  // departing card distinguish "I'm leaving because of a Clear ✕" (real
  // sink+fade-out, see ResultCard.tsx's own cardVariants) from "I'm
  // leaving because RECOMMEND/swap replaced me" (instant removal, this
  // app's existing, deliberate asymmetry — only Clear ✕ has ever
  // exit-animated a departing card); (2) folded into showResultsGrid
  // below, so the empty-state placeholder doesn't swap in until a
  // full clear (nothing locked) has actually finished animating out.
  const [isBatchClearActive, setIsBatchClearActive] = useState(false);
  // Last clearGen this render logic has already reacted to — the
  // render-phase conditional-setState pattern (compare against state, not
  // a ref) this session's MixerBar.tsx work established to satisfy
  // react-hooks/set-state-in-effect and react-hooks/refs simultaneously.
  const [lastClearGen, setLastClearGen] = useState(clearGen);
  if (clearGen !== lastClearGen) {
    setLastClearGen(clearGen);
    setIsBatchClearActive(true);
  }
  // ScrollFadeArea (horizontal orientation) now owns the scroll/fade/arrow
  // mechanics here — the same primitive the Tag Pool's section tab strip
  // uses (SectionTabStrip.tsx) — via getScrollStep/scrollResetKey/arrow*
  // props rather than a bespoke rowRef + scroll-edge-state implementation.
  // rowRef still exists, but now points only at this component's own
  // grid/carousel row (ScrollFadeArea's *children*, not its scroll
  // viewport), purely so getScrollStep below can measure a live card width
  // off it — ScrollFadeArea deliberately doesn't expose its own internal
  // scroll element to callers.
  const rowRef = useRef<HTMLDivElement>(null);
  // One card's current rendered width plus the row's own gap-xl — not a
  // fixed number, since card width steps down through 4 responsive tiers
  // (see ResultCard.tsx). Doesn't need to be pixel-exact: snap-mandatory
  // corrects any scrollBy amount to the nearest real snap point, so this
  // just needs to land closer to the next card than the current one, which
  // it reliably does at every tier.
  const getScrollStep = () => {
    const card = rowRef.current?.querySelector("article");
    const cardWidth = card?.getBoundingClientRect().width ?? 208;
    return cardWidth + 16; // mirrors --space-xl, the row's own gap-xl
  };
  // hasResults alone would flip false the instant Clear ✕ dispatches (see
  // useKonomi.ts), showing the empty-state placeholder *before* the
  // exiting cards below have finished their own animation. Staying "true"
  // for the extra beat while isBatchClearActive is still set keeps the
  // grid (and AnimatePresence's own still-mounted, animating-out cards) on
  // screen for that whole window instead. A no-op for a partial clear
  // (some cards locked): hasResults is already true there regardless,
  // since the locked cards themselves keep `results` non-empty.
  const showResultsGrid = hasResults || isBatchClearActive;

  return (
    // flow-root (a new block formatting context), not a plain fragment —
    // the carousel row below cancels its own shadow-clipping padding with a
    // negative margin (see that div's comment). Negative margins collapse
    // through any number of unbroken parent/child edges, so without a BFC
    // boundary right here, that -5px silently ate into this section's own
    // external mb-3xl in the parent instead of staying contained to the
    // padding it was meant to cancel. flow-root stops it at this component's
    // own edge, exactly where the compensation should end.
    //
    // flex-1 min-h-0 (app-shell rewrite): this component's own root now
    // takes exactly whatever height is left in the results section after
    // ResultsHeader's own natural height, the same flex-item pattern
    // KonomiApp.tsx's shell already uses one level up — see that file's
    // own top comment for why min-h-0 specifically is required, not
    // optional.
    //
    // [container-type:size]: establishes this element as a CSS container
    // query context for BOTH axes, so --result-card-height (globals.css)
    // can read this element's own resolved height back in as 100cqh from
    // deep inside ResultCard.tsx/the empty-state placeholder below,
    // regardless of how many plain (non-flex, auto-height) wrapper divs
    // sit in between — ScrollFadeArea's own horizontal-orientation
    // viewport, its shadow-clipping wrapper below, etc. A plain percentage
    // height (height:100%) can't cross those, since every element in a
    // percentage chain needs its own definite height for the next one to
    // resolve against, and ScrollFadeArea's horizontal viewport is
    // deliberately content-sized (auto), by design, for every one of its
    // other callers (the carousel is the only one that ever needed a
    // container-supplied height at all) — a container query resolves
    // directly against the nearest [container-type] ancestor instead,
    // sidestepping that chain entirely without needing to touch
    // ScrollFadeArea.tsx's own shared, multi-caller internals. Not
    // circular: this element's own size comes from flex-1 above (external
    // to its own content), not from anything that would need to query it
    // first to know its size.
    <div className="flow-root flex-1 min-h-0 [container-type:size]">
      {!showResultsGrid && (
        // !showResultsGrid (hasResults, extended through any in-flight exit
        // animation — see its own comment above), not `empty` (!generated)
        // — a RECOMMEND that fails
        // with an error (impossible-min/no-match) still sets `generated:
        // true` (see recommend() in useKonomi.ts), but leaves `results`
        // untouched. On a first-ever attempt (or right after Clear ✕),
        // `results` is already `[]`, so `empty` goes false the moment the
        // error is set while `hasResults` stays false too — with the
        // condition as `empty`, NEITHER this placeholder nor the results
        // grid below would render, collapsing the whole section down to
        // just its header. `!hasResults` covers both "never generated" and
        // "generated but errored with nothing to show," so the placeholder
        // (and the height it reserves) stays put until an actual result
        // set replaces it — no jarring collapse-then-jump when the user
        // fixes the error and hits RECOMMEND again.
        //
        // min-h-[var(--result-card-height)] (the same token ResultCard's
        // own height reads from, and the same one TagPoolBody's scroll area
        // now targets too — see that file) instead of a measured literal:
        // the empty state and the results grid must always be the exact
        // same height, or the page visibly jumps the instant results
        // replace this placeholder. flex/items-center/justify-center
        // centers the content within that now-taller box (previously this
        // relied on py-huge padding to both establish height and center
        // content at once — min-height needs a real centering mechanism
        // instead, since padding alone doesn't grow to fill leftover
        // min-height space).
        // border-dashed clips its left/right edges on iOS WebKit (all iOS
        // browsers) — cosmetic, empty-state only. Accepted. Do not "fix"
        // by swapping to outline-dashed (also clips) or SVG stroke
        // (corners slide on resize). See DESIGN_SYSTEM.md.
        // bg-[var(--slot-empty)], not --surface — matches TagSlot's own
        // empty-state background exactly, so both of the app's "zero
        // state" surfaces (an empty mixer slot, no results yet) read as
        // one consistent color rather than two similar-but-different
        // near-whites. (--slot-empty and --disabled-bg are already the
        // same value in every theme by design — see tokens.ts/themes.ts —
        // so this also already matches RECOMMEND's own disabled-state
        // background for free.)
        <div className="border-[length:var(--border-base)] border-dashed border-[var(--muted)] bg-[var(--slot-empty)] min-h-[var(--result-card-height)] flex flex-col items-center justify-center gap-[var(--space-md)] px-[var(--space-2xl)] py-[var(--space-2xl)] text-center">
          <div className="font-display text-[length:var(--text-2xl)] text-[var(--muted)] uppercase">
            {EMPTY_STATE_COPY[emptyStateIndex].headline}
          </div>
          {/* Deliberately NOT styled like the payoff below — the payoff is
              flavor text (rotates, reads as voice/mood), this is the one
              functional "what do I actually do" line, fixed across every
              set. Adapted from TagPoolBody.tsx's own subsection-label
              treatment (font-mono tracking-xl text-subtext) — muted,
              categorical — rather than inventing a new visual tier, so it
              reads as a caption between headline and payoff instead of a
              second line of the same voice. text-base (that label
              precedent's own text-2xs read too small once this became a
              standalone line rather than a small in-flow label) and
              lowercase, not uppercase like that precedent — lowercase
              matches the arrow-phrase's own casing (the removed Masthead
              tagline was lowercase too) rather than shouting a functional
              instruction. */}
          {/* -mt-[var(--space-xs)]: the container's own gap-md (below)
              applies uniformly to every child, but headline->instruction
              wanted to be tighter than instruction->payoff (left as
              gap-md, unchanged) — pulling just this line up by space-xs
              nets a smaller gap above it without touching the one below,
              rather than restructuring the container into two separately-
              gapped groups for a single-value tweak. */}
          <p className="font-mono text-[length:var(--text-base)] tracking-[var(--tracking-xl)] text-[var(--subtext)] m-0 -mt-[var(--space-xs)]">
            {EMPTY_STATE_INSTRUCTION}
          </p>
          {/* mt-[var(--space-xs)]: same technique as the instruction's own
              -mt above, opposite direction — widens just this gap (on top
              of the container's shared gap-md) without touching
              headline->instruction. */}
          <p className="font-mono text-[length:var(--text-base)] text-[var(--primary)] m-0 mt-[var(--space-xs)]">
            {EMPTY_STATE_COPY[emptyStateIndex].payoff}
          </p>
          {/* The Tag Density + Sort filters, embedded directly in the empty
              state (not behind the results-header Filter popover, which isn't
              shown here) so a first-time user meets the two things they can
              adjust up front. Same FilterControls the popover uses — one
              source, so they stay identical. A hairline rule + extra top gap
              set them apart from the flavor copy above as their own "what you
              can tune" zone. w-[min(340px,100%)] + mx-auto: a definite,
              centred width — required because FilterControls is a @container
              whose children query it (see FilterControls.tsx), and it also
              sizes the divider so the rule spans exactly the filter block's own
              width rather than the whole box. */}
          <div className="w-[min(340px,100%)] mx-auto mt-[var(--space-lg)] pt-[var(--space-xl)] border-t-[length:var(--border-hair)] border-[var(--muted)]">
            <FilterControls onLevelChange={onLevelChange} className="w-full" />
          </div>
        </div>
      )}

      {showResultsGrid && (
        // Grid above 1152px (unchanged); below it, a single-row snap
        // carousel instead of the grid wrapping into multiple rows.
        // 1152px = 5×208px (DEFAULT_RESULT_COUNT × the grid's min column
        // width) + 4×16px (gap-xl between them) + 48px (the page's own
        // px-2xl margins) — the width where all 5 result cards stop
        // fitting in a single grid row. Confirmed live via 1px-step
        // bisection: 5 cards render on one row at exactly 1152px, wrap to
        // 2 rows at 1151px.
        //
        // An earlier version used 480px (the grid's own natural 1-column
        // breakpoint) instead — confirmed live to be wrong: the grid
        // already wraps to 2-3 rows well above 480px (only 2 of 5 cards
        // fit per row once width drops below ~1152px), so a carousel that
        // only kicked in below 480px left most of the resize range still
        // wrapping into multiple rows, defeating the actual goal (stay a
        // single row, keep the mixer co-visible without scrolling past a
        // tall stack). Tradeoff of the fix: this breakpoint is now coupled
        // to DEFAULT_RESULT_COUNT (config.ts) — re-derive it if that count
        // ever changes.
        //
        // ScrollFadeArea (orientation="horizontal") supplies the actual
        // overflow-x-auto viewport, snap, peek, wheel/press-hold, and
        // arrows now — see this component's own top-of-file comment. What
        // stays here, on the row itself (ScrollFadeArea's children): the
        // grid↔flex-nowrap breakpoint switch (ScrollFadeArea has no concept
        // of "static grid above N px," so that decision has to live in the
        // caller's own markup), and each ResultCard's own snap-start
        // (max-[1152px]:snap-start, in ResultCard.tsx) — snap points come
        // from the children, same as TagScrollArea's chips.
        // max-[1152px]:-ml-[22px] / -mr-[22px] below: a measured constant,
        // not an arbitrary round number — 22 = the trailing/leading
        // spacer's own w-[6px] (both further down, near their
        // results.map) + this row's gap-[var(--space-xl)] (16px), which
        // also applies before/after each spacer the same as between every
        // card. If gap-xl's value changes, or either spacer's own width
        // changes, these two margins must be re-derived to match (6+16
        // again, with whatever the new numbers are) or the corresponding
        // edge card will drift off the content column's edge again — same
        // "retune by hand if this changes" coupling as MIXER_BAR_SPACER/
        // EDIT_MODE_FIXED_ROWS_HEIGHT elsewhere in this app, and for the
        // same reason those stayed comments instead of a shared JS
        // constant: Tailwind's arbitrary-value classes need to be static
        // source text for its scanner to generate CSS for them at all — a
        // computed `-ml-[${n}px]` string would silently produce no rule,
        // not a wrong one, which is a worse failure mode than a comment
        // someone has to remember to update.
        <div className="-mt-[40px] -mr-[5px] -mb-[40px] max-[1152px]:-ml-[22px] max-[1152px]:-mr-[22px]">
          {/* ScrollFadeArea's scroll viewport is unconditionally
              overflow-x-auto/overflow-y-hidden now (not gated to
              max-[1152px] the way the old bespoke implementation was), so
              the elev-4 shadow-clipping risk the pr/pb + -mr/-mb pair below
              fixes is no longer confined to the carousel breakpoint — a
              card flush against the grid's own right/bottom edge above
              1152px is just as exposed.

              pt/pb are 40px, not the original 5px: a flip in progress
              (ResultCard's rotateY, [transform:rotateY]) needs far more
              room than the static shadow does. Confirmed live via
              Animation.setPlaybackRate(0.02)/Animation.seekAnimations +
              getBoundingClientRect on the rotating faces mid-flip: the
              rotation's real bulge is mostly *vertical* (top/bottom) — up
              to ~33.5px above and ~28.5px below the card's own resting box
              at the widest measured tier (the 85%-width mobile carousel
              card; desktop's 22%-width grid cards bulge a bit less,
              ~27/22px). 40px covers both measured maxes with a small
              buffer, and — since 40 > 5 — also covers the original shadow
              bleed on its own, so pb doesn't need to account for both
              separately.

              Padding this side of ScrollFadeArea's own real overflow-hidden
              clip (scrollRef, inside ScrollFadeArea.tsx) reserves 40px of
              *clipped-but-unclipped-relative-to-content* space above/below
              the grid for the flip to bleed into. The matching -mt/-mb on
              this wrapper — outside ScrollFadeArea's clip boundary
              entirely — cancels that padding back out at rest: it pulls
              this whole wrapper (clip boundary included) up/in by the same
              40px the grid's own padding pushed its content down/in by, so
              the *visible* card position and height are unchanged. Same
              net-zero trick the original 5px pair already used, just
              extended to the axis (vertical) the flip actually needs.
              Confirmed live: first-card top, last-card bottom, and the
              gaps to the header above and the "+ Tag Pool" affordance
              below are byte-identical before and after this change, at
              both a desktop grid width and the mobile carousel's tightest
              tier — the padding is genuinely inert at rest, not merely
              small. flow-root on this component's own root div (above)
              is what makes -mt safe here the same way it already made -mb
              safe: without that BFC boundary, a negative *top* margin
              collapses through parent/child edges just as readily as a
              negative bottom one, and would have eaten into
              ResultsHeader's own spacing above this row instead of
              staying contained to the padding it's meant to cancel.

              Below 1152px, both the first and last card get a small real
              spacer *inside* the row instead of more padding on this same
              grid — see those two divs' own comments for why padding can't
              do this job on the horizontal axis the way pt/pb does
              vertically. Both need a matching margin on THIS wrapper
              (max-[1152px]:-ml-[22px] / -mr-[22px]) for the same net-zero
              reason as -mt/-mb above, just aimed at a different problem: a
              plain visible gap after the *visual* card (before the true
              scroll edge) reads as an unintentional dead zone once you
              scroll all the way over — confirmed live, an earlier version
              without this margin left the last card sitting 22px short of
              the content column's own right edge, an obvious "indent" that
              didn't match the grid tier's flush alignment. Pulling this
              wrapper (and so ScrollFadeArea's own scroll container) 22px
              wider on BOTH sides pushes each spacer's real, reachable
              buffer out past the content column's own edges — into the
              page's own gutter, where it's invisible margin either way —
              while the actual first/last *card* renders exactly flush with
              that edge, matching the grid tier's look. Confirmed live at
              multiple carousel-tier widths: card width, left edge, and
              right edge all landed within a fraction of a px of the
              content column's own edges, both at rest and scrolled to the
              true end. (An even earlier version added only -mr, sized to
              the spacer's raw width with no thought for the row's own
              gap-xl also contributing — that one really was wrong, and
              genuinely widened the visible row itself rather than just
              relocating the spacer into the gutter; the difference is
              accounting for the *total* footprint, gap included, not just
              the spacer's own declared width.) */}
          <ScrollFadeArea
            orientation="horizontal"
            snap
            scrollPaddingStart="6%"
            scrollResetKey={recommendGen}
            scrollResetIndex={firstNewIndex}
            getScrollStep={getScrollStep}
            fadeSize={0}
            arrowWidth={36}
            arrowHeight={36}
            arrowShadow
            arrowInset="var(--space-md)"
          >
            {/* This grid keeps its own pointer-events-none (still real,
                still needed — the pt/pb-[40px] pair below is genuine, empty
                layout space, not just a visual illusion, and this grid still
                geometrically occupies that 40px above/below the cards).
                ScrollFadeArea's own three structural wrappers
                (root/scrollRef/contentRef) do NOT get pointer-events-none
                here anymore, though — disableWrapperPointerEvents was
                removed from the prop above. It fixed a real bug (Clear ✕
                getting its lower ~24px silently swallowed by this same
                invisible padding, confirmed live via elementFromPoint) but
                did so by making scrollRef itself pointer-events-none — and
                scrollRef is this carousel's actual overflow-x-auto viewport,
                the one native touch-scroll-gesture-chaining needs to find.
                Confirmed live (mobile, real device): with that in place, a
                horizontal swipe starting anywhere on a card's tag area
                failed to reach the carousel whenever the tag area itself
                wasn't an active/overflowing scroll container — pointer-
                events-none disqualified scrollRef from gesture-chaining
                candidacy entirely, not just from click hit-testing.
                Re-scoped instead of reverted outright: Clear ✕ now wins its
                own hit-test via paint order (relative z-[var(--z-raised)],
                see ResultsHeader.tsx) rather than via scrollRef being
                excluded from hit-testing altogether — so scrollRef (and
                root/contentRef) are back to the default pointer-events:auto,
                and the carousel can receive the gesture regardless of
                whether a card's tag area happens to be active. This grid's
                own pointer-events-none is untouched by that change (it's a
                separate, still-valid concern — its own invisible padding
                could still swallow clicks meant for content behind/below
                the carousel elsewhere, e.g. below the last row); each
                card's own pointer-events-auto (ResultCard.tsx) and every
                IconButton's own unconditional pointer-events-auto
                (IconButton.tsx, covers the arrow buttons here) still opt the
                real interactive content back in regardless. */}
            <div
              ref={rowRef}
              // relative: gives ResultCard.tsx's own "pop a departing
              // RECOMMEND/swap card out of flow" fix (see that file's
              // useLayoutEffect) an actual containing block to compute its
              // absolute top/left against — without this, position:absolute
              // on a card's <article> would resolve against whatever
              // ancestor further up the tree happens to be positioned
              // instead, landing in the wrong place. z-index:auto stays
              // unset here (no z-index alongside relative), so this
              // deliberately does NOT create a new stacking context —
              // doesn't touch this app's existing z-index layering.
              className="relative grid grid-cols-[repeat(auto-fill,minmax(208px,1fr))] gap-[var(--space-xl)] pt-[40px] pr-[5px] pb-[40px] max-[1152px]:flex max-[1152px]:flex-nowrap pointer-events-none"
            >
              {/* Leading spacer, carousel tier only (hidden above 1152px,
                  same reasoning as the trailing one below: display:none
                  removes it from the grid entirely, so it's never a 6th
                  grid cell). Guards the first card's left edge specifically
                  during the *reverse* flip (back face rotating to show the
                  front again) — confirmed live this is the one direction
                  that clips: a forward flip (front→back) never showed any
                  left excess at any width, but the reverse animation's
                  second half peaked at ~2.4px of real excess past the
                  scroll container's true left edge (measured via
                  Animation.seekAnimations at 450px width, a single-card
                  carousel tier).

                  w-[6px] (space-sm), plus this row's own gap-xl (16px)
                  before it — 22px total, comfortably past the ~2.4px
                  measured bulge. This 6+16=22 pairs with the outer
                  wrapper's own max-[1152px]:-ml-[22px] (this row's
                  top-of-block comment) — change this width or the row's
                  gap-xl and that margin needs to move to match, or this
                  spacer's buffer stops landing invisibly in the page's own
                  gutter and starts showing as a real indent again. Not w-0:
                  a first pass used w-0 here (relying on the gap alone) and,
                  symmetrically with the trailing
                  spacer (see its own comment), a *separate* first pass tried
                  netting an even smaller total via a negative margin eating
                  into that gap. Both were reverted for the same reason
                  documented there: a zero-width flex item at the overflowing
                  edge of a flex-nowrap row doesn't reliably get its
                  preceding/following gap counted toward scrollWidth, and
                  negative margins compound that further — confirmed live via
                  the trailing spacer's case (this one doesn't depend on
                  scrollWidth math the same way, since it's about the
                  *resting*, not reachable-via-scroll, position, but kept the
                  same real-width fix for consistency once the trailing
                  side's fix was known-good).

                  This wrapper's own max-[1152px]:-ml-[22px] (below) cancels
                  that 22px back out at rest, relocating it into the page's
                  own left gutter instead of a visible gap before card 1 —
                  see this row's top-of-block comment for why the trailing
                  spacer needs the equivalent -mr treatment too, even though
                  it's only ever visible once scrolled to the end.

                  [scroll-snap-align:start] on this spacer (not just
                  flex-none) is load-bearing, not decoration: a first
                  attempt gave the spacer real width with no snap-align of
                  its own, and that alone made scroll-snap treat resting
                  scrollLeft 0 as "unaligned" — confirmed live the browser
                  force-corrected scrollLeft to 17 on load and kept
                  snapping straight back to 17 even after an explicit reset
                  to 0, because shifting the first *card's* own offset away
                  from 0 meant 0 no longer matched any card's snap-start
                  math. Making the spacer itself a valid snap-start target
                  means scrollLeft 0 (spacer visible, card 1 right behind
                  it) is a legitimate resting position again — confirmed
                  live this keeps scrollLeft at 0 at rest. */}
              <div aria-hidden className="hidden max-[1152px]:block max-[1152px]:w-[6px] flex-none [scroll-snap-align:start]" />
              {/* AnimatePresence (motion/react), wrapping `results.map()`
                  directly — no lagging displayedResults copy anymore. This
                  is what actually keeps a departing card mounted long
                  enough to play its own exit animation (or not, see
                  isBatchClearActive below): AnimatePresence detects a key
                  (series.title) missing from this render's children versus
                  the last, and holds that child's last-rendered element in
                  place (still occupying its grid slot, same as
                  displayedResults used to) until its own exit finishes.
                  custom={isBatchClearActive} feeds ResultCard's own dynamic
                  exit variant (see that file's cardVariants) — Motion
                  re-supplies whatever `custom` this AnimatePresence
                  currently holds to an already-exiting child at the moment
                  it evaluates that child's exit variant, which is what
                  lets a single ResultCard distinguish a Clear ✕ removal
                  (real sink+fade-out) from a RECOMMEND/swap replacement
                  (instant, matching this app's existing asymmetry — only
                  Clear ✕ has ever exit-animated a departing card).
                  onExitComplete fires once every currently-exiting child
                  has finished — resets isBatchClearActive back to false,
                  which is what lets showResultsGrid above finally fall
                  through to the empty-state placeholder for a full clear
                  (nothing locked); a no-op for a partial clear, where
                  hasResults was already true throughout. */}
              {/* IsBatchClearActiveContext.Provider — mirrors the same
                  isBatchClearActive value already fed to AnimatePresence's
                  own `custom` prop above, but via Context: a card mid-exit
                  is no longer part of this render's results.map() output,
                  so it can't receive a fresh isBatchClearActive PROP the
                  normal way (there's no new element for it in the array to
                  supply one), but it's still a genuinely mounted descendant
                  of this Provider (AnimatePresence keeps it mounted, not
                  frozen), so it still re-renders and receives updates via
                  Context regardless. See ResultCard.tsx's own comment on
                  what this specifically drives (popping a RECOMMEND/swap
                  departure out of flow, but not a Clear ✕ one). */}
              <IsBatchClearActiveContext.Provider value={isBatchClearActive}>
              <AnimatePresence custom={isBatchClearActive} onExitComplete={() => setIsBatchClearActive(false)}>
                {(() => {
                  // Pace count = how many cards are actually sweeping in/out
                  // within the currently-visible breakpoint tier (5/4/3/2/1,
                  // matching ResultCard.tsx's own card-width tiers), minus
                  // whichever of those are locked — requested directly: the
                  // stagger reads relative to how many cards visibly move
                  // together right now, not the total result count (which
                  // can include cards scrolled out of view at narrower
                  // tiers). staggerMs is itself defined at 5 cards (see
                  // getEffectiveStaggerMs's own comment); paceCount is what
                  // scales it down for smaller tiers/more locks. Computed
                  // once here, outside the per-card map below, since it's the
                  // same for every card this render.
                  const paceCount = getAnimatingPaceCount(
                    results.map((r) => r.series.title),
                    locked,
                    visibleCardTierCount,
                  );
                  const effectiveStaggerMs = getEffectiveStaggerMs(cardStaggerMs, paceCount);
                  return results.map((entry, index) => {
                    // Gated on newTitles (useKonomi.ts), not `!locked` —
                    // deliberately decoupled from live lock state so
                    // locking/unlocking a card never replays its entrance;
                    // see newTitles' own comment on KonomiState for why.
                    //
                    // A single-card dice swap also counts as entering now,
                    // via justSwappedIndex (the same signal that already
                    // seeds startWithSwapHint below) — requested directly:
                    // the freshly-swapped card should rise+fade in exactly
                    // like a RECOMMEND entrance, reusing the same duration/
                    // easing/distance, just as the one and only card
                    // entering right now rather than part of a batch.
                    const isEnteringFromSwap = justSwappedIndex === index;
                    const isEntering = newTitles.includes(entry.series.title) || isEnteringFromSwap;
                    // Enter: L->R, index * stagger (0 for a swap-driven
                    // entrance — see isEnteringFromSwap above; otherwise a
                    // swap on, say, card #4 would wait through 3 stagger
                    // steps for no reason, the same "single card, no one
                    // else to sweep with" pacing getAnimatingPaceCount
                    // already applies for a RECOMMEND that leaves only one
                    // card entering). Only actually takes effect at this
                    // instance's genuine first mount — see
                    // ResultCard.tsx's own enterDelayMs comment.
                    const enterDelayMs = isEnteringFromSwap ? 0 : index * effectiveStaggerMs;
                    // Exit: R->L, (count-1-index) * stagger, computed
                    // fresh every render (not just while this card happens
                    // to be about to be removed) using this card's own
                    // index/count in the full, still-current `results`
                    // array — a locked card that stays put doesn't shift
                    // the timing of the ones sweeping around it, it just
                    // sits still while the sweep passes its slot. See
                    // ResultCard.tsx's own exitDelayMs comment for why
                    // computing this unconditionally is what makes
                    // AnimatePresence's "freeze last render's props"
                    // behavior land on the correct pre-removal value with
                    // no separate lagging snapshot list required.
                    const exitDelayMs = (results.length - 1 - index) * effectiveStaggerMs;
                    return (
                      <ResultCard
                        key={entry.series.title}
                        entry={entry}
                        selectedTags={selectedTags}
                        filledCount={filledCount}
                        minNum={minNum}
                        locked={Boolean(locked[entry.series.title])}
                        flipped={Boolean(flipped[entry.series.title])}
                        canSwap={canSwap}
                        onFlip={onFlip}
                        onToggleLock={onToggleLock}
                        // Notes which grid position initiated the swap (see
                        // justSwappedIndex's own comment above) before
                        // actually performing it, so the brand-new instance
                        // that mounts here already knows to seed its hint on
                        // its very first render.
                        onReplace={(title) => {
                          setJustSwappedIndex(index);
                          onReplace(title);
                        }}
                        startWithSwapHint={justSwappedIndex === index}
                        onChipToggle={onChipToggle}
                        tagInfoByName={tagInfoByName}
                        totalSeriesCount={totalSeriesCount}
                        level={level}
                        sort={sort}
                        isEntering={isEntering}
                        enterDelayMs={enterDelayMs}
                        exitDelayMs={exitDelayMs}
                      />
                    );
                  });
                })()}
              </AnimatePresence>
              </IsBatchClearActiveContext.Provider>
              {/* Trailing spacer, carousel tier only (hidden — display:none
                  removes it from the grid entirely above 1152px, so it
                  never becomes a 6th grid cell or perturbs that tier's
                  1152px-tuned column math). Guards the last card's right
                  edge — its elev-4 shadow (5px) and any right-side flip
                  bulge. A real DOM child, not padding on the row above,
                  because a flex-nowrap row whose children overflow their
                  own container renders the *container's own box* at its
                  available (viewport) width, not its overflowing children's
                  true combined width — confirmed live (getBoundingClientRect
                  on the grid itself reported exactly clientWidth, not the
                  wider content extent), so pr *padding on that box* sits at
                  the edge of a box narrower than the real scrollable
                  content, nowhere near the actual last card. Also confirmed
                  live that scroll-padding-right doesn't help either: it only
                  adjusts where a *snap-end/center*-aligned target settles,
                  and every card here is snap-*start* (ResultCard.tsx), so
                  padding on the trailing edge never enters that alignment
                  calculation at all — the row kept settling with ~0 buffer
                  at the true scroll-max regardless. A real flex child, by
                  contrast, IS part of the overflowing content, so it
                  reliably sits directly next to the last card, and — unlike
                  the leading spacer above — doesn't shift any existing
                  card's own offset, so it doesn't need scroll-snap-align:
                  resting at the true scroll-max is always a valid mandatory-
                  snap position with nothing further to snap to, confirmed
                  live scrollLeft settles there cleanly.

                  w-[6px] (space-sm), not w-0 or a negative margin — both
                  tried first, both reverted. This 6+16(gap)=22 pairs with
                  the outer wrapper's own max-[1152px]:-mr-[22px] (this
                  row's top-of-block comment) — change this width or the
                  row's gap-xl and that margin needs to move to match, same
                  coupling as the leading spacer's own note above. This
                  row's own gap-xl (16px) applies before this spacer too, so
                  the temptation is to
                  let the gap alone be the buffer (w-0) or shrink it further
                  with a negative margin eating into that gap for something
                  closer to the exact 5px the shadow needs. Confirmed live
                  that *either* one breaks scrollWidth accounting for a
                  zero-width trailing flex item in an overflowing
                  flex-nowrap row: getBoundingClientRect on the spacer showed
                  it rendering past the scroll container's own right edge
                  even at scrollLeft set to the true max (scrollWidth −
                  clientWidth) — the browser silently doesn't count a
                  zero-width last item's own preceding gap toward
                  scrollWidth, so the "reachable" buffer this spacer exists
                  to create was never actually reachable. A real, non-zero
                  width (6px here) is what makes the browser count it
                  correctly — confirmed live, scrollWidth then matches the
                  spacer's true rendered extent and the last card's shadow
                  renders fully unclipped once scrolled to the end. Total
                  reachable trailing space is 16 (gap) + 6 = 22px — see the
                  outer wrapper's own max-[1152px]:-mr-[22px] (this row's
                  top-of-block comment) for why that 22px lands in the
                  page's own gutter rather than as a visible gap after this
                  spacer's own card. */}
              <div aria-hidden className="hidden max-[1152px]:block max-[1152px]:w-[6px] flex-none" />
            </div>
          </ScrollFadeArea>
        </div>
      )}
    </div>
  );
}

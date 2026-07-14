import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { LevelKey, ResultEntry, TagInfo } from "@/lib/konomi/types";
import { ActionButton } from "./ActionButton";
import { useAnimationDebugValues } from "./animationDebugStore";
import {
  CARD_ANIM_DURATION_MS,
  CARD_ANIM_STAGGER_MS,
  getAnimatingPaceCount,
  getEffectiveStaggerMs,
  getVisibleCardTierCount,
} from "./cardAnimTuning";
import { FilterControls } from "./FilterControls";
import { CheckIcon, DiceIcon, TagPoolIcon } from "./icons";
import { IconButton } from "./IconButton";
import { ResultCard } from "./ResultCard";
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
  // Open / close the Tag Pool (edit mode) and shuffle Random tags — the SAME
  // handlers + toggle behaviour MixerBar's own Tag Pool / Random buttons use.
  // Surfaced in the empty-state box only at the narrow widths where MixerBar's
  // control row has dropped those buttons entirely (see the surfaced row below),
  // so a narrow-viewport user still has one-tap access to both from here.
  // editMode drives the Tag Pool button's open↔"Done" toggle, exactly like the
  // bar's; onCloseEditMode is its close half.
  editMode: boolean;
  onOpenEditMode: () => void;
  onCloseEditMode: () => void;
  onRandomTags: () => void;
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
  editMode,
  onOpenEditMode,
  onCloseEditMode,
  onRandomTags,
}: RecommendationsBodyProps) {
  const level = useLevel();
  const sort = useSort();
  // Live-tweakable via AnimationDebugPanel.tsx — read at the top level (not
  // inside the IIFE below) since hooks can't be called from a nested
  // function, even one invoked synchronously during this same render.
  // cardStaggerMs paces the card sweep below; cardDurationMs/cardDistancePx are
  // also handed to the empty-state box's own enter/exit (see the box lifecycle
  // block + its inline style further down) so the box moves on the SAME timing
  // and travel as the cards it sweeps with — one debug slider would tune both.
  const { cardStaggerMs, cardDurationMs, cardDistancePx } = useAnimationDebugValues();
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
  // Card enter/exit is plain CSS keyframes now (ResultCard / globals.css), not
  // Motion/AnimatePresence — so this component owns keeping a Clear-✕'d card
  // mounted through its exit itself, via a lagging displayedResults copy (the
  // pre-Motion mechanism, restored). On a Clear ✕ (clearGen bump) any removed
  // titles go into exitingTitles and keep rendering out of displayedResults —
  // playing animate-card-exit — until the settle timer below drops them; any
  // OTHER results change (a fresh RECOMMEND, a single-card swap) syncs
  // displayedResults immediately with no exit choreography (this app's
  // deliberate asymmetry — only Clear ✕ animates a departure). Render-phase
  // conditional setState (compare against state, not a ref), the pattern this
  // codebase uses to satisfy the react-hooks rules.
  const [displayedResults, setDisplayedResults] = useState(results);
  const [lastClearGen, setLastClearGen] = useState(clearGen);
  const [exitingTitles, setExitingTitles] = useState<ReadonlySet<string>>(new Set());
  if (clearGen !== lastClearGen) {
    setLastClearGen(clearGen);
    const stillThere = new Set(results.map((r) => r.series.title));
    const removed = displayedResults.filter((r) => !stillThere.has(r.series.title));
    if (removed.length > 0) {
      // displayedResults left as the full pre-clear set, so the removed cards
      // keep rendering (and animating out) until the settle effect finalizes.
      setExitingTitles(new Set(removed.map((r) => r.series.title)));
    } else {
      setDisplayedResults(results);
    }
  } else if (results !== displayedResults && exitingTitles.size === 0) {
    setDisplayedResults(results);
  }
  // Finalizes a Clear ✕ once its exit animation has actually finished — a plain
  // timer matching the declared duration, NOT animationend/transitionend (this
  // app treats animation-completion events as unreliable on real devices; see
  // MixerBar/RollingLabel history). Only re-fires on a genuine empty->non-empty
  // exitingTitles transition, not every render.
  useEffect(() => {
    if (exitingTitles.size === 0) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const paceCount = getAnimatingPaceCount(
      displayedResults.map((r) => r.series.title),
      locked,
      visibleCardTierCount,
    );
    const effectiveStaggerMs = getEffectiveStaggerMs(CARD_ANIM_STAGGER_MS, paceCount);
    // Last card to finish is the one with the largest delay = the last index
    // (L->R stagger), so total = duration + (count-1)*stagger.
    const lastIndex = Math.max(0, displayedResults.length - 1);
    const totalMs = reduced ? 0 : CARD_ANIM_DURATION_MS + lastIndex * effectiveStaggerMs;
    const t = setTimeout(() => {
      setDisplayedResults(results);
      setExitingTitles(new Set());
    }, totalMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fires on exitingTitles itself changing, see comment above
  }, [exitingTitles]);
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
  // useKonomi.ts), showing the empty-state placeholder *before* the exiting
  // cards below have finished their own animation. Staying "true" for the extra
  // beat while exitingTitles is non-empty keeps the grid (and displayedResults'
  // still-mounted, animating-out cards) on screen for that whole window. A
  // no-op for a partial clear (some cards locked): hasResults is already true
  // there regardless, since the locked cards keep `results` non-empty.
  const showResultsGrid = hasResults || exitingTitles.size > 0;

  // Empty-state box enter/exit — Path A (CSS keyframes, mirroring the cards'
  // own displayedResults/exitingTitles mount-through-exit mechanism above, NOT
  // AnimatePresence; see globals.css empty-state-enter/exit). The box animates
  // as one more object in the SAME upward sweep as the cards:
  //   • RECOMMEND (empty -> results): the box is knocked up and out. hasResults
  //     flips true, so the grid mounts and its cards enter immediately; we keep
  //     the box mounted as an absolute overlay playing its EXIT for one
  //     card-duration (boxExiting), then drop it.
  //   • CLEAR (results -> empty): the box bumps up into place. hasResults flips
  //     false the instant Clear ✕ dispatches — BEFORE the cards finish their own
  //     exit — so the box mounts right away as an absolute overlay and plays its
  //     ENTER (boxEntering) concurrently with the departing cards, then settles
  //     in-flow once the grid unmounts. (This is the one spot that intentionally
  //     keys the box off hasResults, not showResultsGrid: the whole point is to
  //     overlap the box's entrance WITH the still-animating card exit, which
  //     showResultsGrid deliberately suppresses.)
  // Edges detected render-phase (compare against state, not a ref — the same
  // pattern the swap-hint / clearGen blocks above use to satisfy the react-hooks
  // rules), off hasResults' own true<->false transitions.
  const [boxExiting, setBoxExiting] = useState(false);
  const [boxEntering, setBoxEntering] = useState(false);
  const [lastHasResultsForBox, setLastHasResultsForBox] = useState(hasResults);
  if (hasResults !== lastHasResultsForBox) {
    setLastHasResultsForBox(hasResults);
    if (hasResults) {
      setBoxExiting(true);
      setBoxEntering(false);
    } else {
      setBoxEntering(true);
      setBoxExiting(false);
    }
  }
  // Settle timers: drop each flag once its keyframe has run — a plain timer
  // matching the card duration, the same "timers, not animationend, are the
  // reliable signal on-device" choice the card settle effect above makes.
  // Reduced-motion collapses to 0 (the keyframes themselves are near-instant
  // under the prefers-reduced-motion rule). Each only re-fires on its own
  // flag's false->true edge.
  useEffect(() => {
    if (!boxExiting) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setBoxExiting(false), reduced ? 0 : cardDurationMs);
    return () => clearTimeout(t);
  }, [boxExiting, cardDurationMs]);
  useEffect(() => {
    if (!boxEntering) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setBoxEntering(false), reduced ? 0 : cardDurationMs);
    return () => clearTimeout(t);
  }, [boxEntering, cardDurationMs]);
  // The box stays in the DOM whenever there are no results (resting/entering) OR
  // while it's still playing its exit over the freshly-mounted grid. While the
  // grid co-renders (recommend exit, or the clear-overlap window before the
  // cards settle) the box floats as an absolute overlay so it doesn't add its
  // own height to the container — it paints above the grid (positioned element
  // over the in-flow grid) which is correct for both directions (the departing
  // box fades off the top on recommend; the arriving box covers the departing
  // cards on clear). At rest it's a normal in-flow block again.
  const showEmptyBox = !hasResults || boxExiting;
  const emptyBoxOverlay = showResultsGrid;
  const emptyBoxAnimClass = boxExiting ? "animate-empty-exit" : boxEntering ? "animate-empty-enter" : "";
  const emptyBoxAnimStyle =
    boxExiting || boxEntering
      ? {
          ["--empty-anim-distance" as string]: `${cardDistancePx}px`,
          animationDuration: `${cardDurationMs}ms`,
          animationTimingFunction: "cubic-bezier(0, 0, 0.2, 1)",
        }
      : undefined;

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
    // relative: the containing block for the empty-state box while it floats as
    // an absolute overlay through its enter/exit (see showEmptyBox/emptyBoxOverlay
    // above). position:relative alone adds no z-index and creates no stacking
    // context, so it doesn't perturb the card layering or the inner rowRef's own
    // relative (which stays the nearer containing block for a card's pop-out).
    <div className="relative flow-root flex-1 min-h-0 [container-type:size]">
      {showEmptyBox && (
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
        // The empty box occupies the SAME total vertical space the results
        // block does — ResultsHeader's row + the cards — as ONE seamless box
        // with NO visible gap, so clearing results doesn't change the footprint.
        // The header row's height is inlined here as (30px + var(--space-lg)) —
        // ResultsHeader's own min-h-[30px] + its mb-[space-lg]. It is NOT a
        // shared --results-header-h custom property: a new :root var added for
        // this was silently NOT emitted by this project's Turbopack/Lightning
        // CSS dev pipeline (confirmed live — its neighbors emitted, it did not),
        // while these Tailwind arbitrary utilities DO emit, so the value lives
        // in the class. The 30px couples to ResultsHeader's min-h — keep in sync.
        //   min-h = --result-card-height + 30px + space-lg: the card-row height
        //     (shared token the cards use, so it tracks automatically across
        //     widths/heights via 100cqh — no per-breakpoint math) PLUS the
        //     header row's height.
        //   -mt (30px + space-lg): pulls the box UP by the header's height so it
        //     spans over the (always-rendered) ResultsHeader row and its top
        //     sits at the results block's top — the box visually covers that row
        //     (no blank strip), while the row staying in layout keeps 100cqh
        //     honest (== the cards' own container height, so the card portion is
        //     the exact real card height — no drift, no overflow into the mixer).
        //     ResultsHeader shows Filter/Clear only when there are results, so
        //     under the empty box that row is just empty space the box paints over.
        // Deliberately NOT flex-1/h-full/100cqh: the box must match the (capped)
        // results block and stop, NOT swallow the leftover space above MixerBar
        // (that gap is present in both states on a tall viewport, by design).
        // flex/items-center/justify-center centers the content in that box.
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
        // @container: this box is the query context for the surfaced Tag Pool/
        // Random row below — its content width equals MixerBar cardRef's own
        // @container width by construction (both are the shared max-w column
        // minus one px-2xl each side minus a border-base), so the 561/481
        // breakpoints mirror MixerBar's rungs to within a pixel. inline-size
        // only, so the box's own min-height/vertical centering is unaffected;
        // FilterControls carries its own nested @container, so it still queries
        // itself, not this box.
        // emptyBoxOverlay -> absolute inset-x-0 top-0: while the results grid
        // co-renders (recommend exit, or the clear overlap window), the box floats
        // above it without adding its own height. The existing -mt (pulls the box
        // up over the header row) still applies from `top: 0`, so the overlaid
        // position matches the in-flow resting position exactly — the switch back
        // to in-flow once the grid unmounts is seamless (the box's min-h and the
        // results block are designed to the same footprint). emptyBoxAnimClass /
        // emptyBoxAnimStyle play the rise+fade keyframe (globals.css) on the same
        // timing/travel as the cards.
        <div
          className={`@container border-[length:var(--border-base)] border-dashed border-[var(--muted)] bg-[var(--slot-empty)] mt-[calc((30px_+_var(--space-lg))_*_-1)] min-h-[calc(var(--result-card-height)_+_30px_+_var(--space-lg))] grid grid-rows-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] px-[var(--space-2xl)] py-[var(--space-2xl)] text-center ${emptyBoxOverlay ? "absolute inset-x-0 top-0" : ""} ${emptyBoxAnimClass}`}
          style={emptyBoxAnimStyle}
        >
          {/* THREE ALWAYS-EQUAL sections (no divider lines), each centered
              horizontally + vertically in its own band (requested): TOP = hero
              headline + instruction; MIDDLE = filters (+ surfaced buttons);
              BOTTOM = the rotating payoff line.
              minmax(0,1fr) per row, NOT a bare 1fr: a bare grid `1fr` is
              `minmax(auto,1fr)`, so a content-heavier row (the MIDDLE, with the
              filters + surfaced buttons) grows past its share the moment the box
              gets short enough that a third < that content — leaving the three
              rows UNEQUAL (reported live while morphing the masthead compact<->
              expanded, which resizes this box via 100cqh). The `0` minimum forces
              the fr algorithm to keep all three rows exactly equal at every box
              height; content that can't fit a third overflows (centered) rather
              than stealing height from the others. */}
          {/* TOP: hero + instruction. */}
          <div className="flex flex-col items-center justify-center gap-[var(--space-md)]">
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
          {/* -mt-[var(--space-xs)]: tightens the headline->instruction gap a
              touch below the container's shared gap-md (the payoff that used to
              follow moved to its own BOTTOM section). */}
          <p className="font-mono text-[length:var(--text-base)] tracking-[var(--tracking-xl)] text-[var(--subtext)] m-0 -mt-[var(--space-xs)]">
            {EMPTY_STATE_INSTRUCTION}
          </p>
          </div>
          {/* MIDDLE: filters (+ the surfaced Tag Pool/Random row), centered
              horizontally + vertically in the middle 1fr band. */}
          <div className="flex flex-col items-center justify-center gap-[var(--space-2xl)]">
          {/* The Tag Density + Sort filters, embedded directly in the empty
              state (not behind the results-header Filter popover, which isn't
              shown here) so a first-time user meets the two things they can
              adjust up front. Same FilterControls the popover uses — one
              source — but layout="inline": both fields sit side by side on one
              line, centred below the divider, progressively reducing (drop
              labels → single-segment → wrap) exactly like MixerBar's controls
              rather than stacking. A hairline rule + extra top gap set them
              apart from the flavor copy above as their own "what you can tune"
              zone. w-[min(560px,100%)] + mx-auto: a definite, centred width —
              required because FilterControls is a @container whose children
              query it (see FilterControls.tsx), wide enough to hold the full
              inline row (~510px) at desktop; it also sizes the divider.

              data-empty-controls: same allowlist opt-out as the surfaced buttons
              below — adjusting Tag Density / Sort here while the Tag Pool / edit
              panel is open (visible above it on larger phones) must NOT be treated
              as an outside click that dismisses the panel, exactly as the results-
              state Filter popover (data-results-filter) already behaves. See
              MixerBar's click-outside listener. */}
          <div data-empty-controls className="w-[min(560px,100%)] mx-auto">
            <FilterControls onLevelChange={onLevelChange} layout="inline" className="w-full" />
          </div>
          {/* Surfaced controls: Tag Pool + Random, shown ONLY at the narrow
              widths where MixerBar's control row has dropped them entirely, so a
              phone user keeps one-tap access to both from the empty state. The
              show/hide widths mirror MixerBar Row 2's own rungs EXACTLY — Tag
              Pool @max-[561px], Random @max-[481px] — querying this box (the
              @container, set on its className above), whose content width equals
              MixerBar cardRef's own @container width by construction, so the same
              numbers line up within a pixel.

              ⚠️ SHARED BREAKPOINTS — keep in sync with MixerBar.tsx Row 2:
                561 = Tag Pool dropped from the bar (MixerBar RUNG 4)
                481 = Random dropped from the bar   (MixerBar RUNG 6)
              These are DUPLICATED literals, not a shared constant, on purpose: a
              Tailwind arbitrary-value / container-query class must be static
              source text (the scanner can't read a JS constant, and a container
              query can't read a CSS var), so both sites carry the same number
              with cross-reference comments instead — this app's own precedent for
              coupled magic numbers (see MixerBar's spacer/-ml-[22px] note). If
              either rung is re-bisected in MixerBar, update it here too.

              Layout: Tag Pool is always in this row (the row itself only exists
              @max-[561px], exactly when Tag Pool surfaces); Random joins it
              @max-[481px]. The row is content-width and the box centres it
              (items-center), so one button showing sits centred and both sit
              next to each other with a standard gap — Tag Pool left, Random right
              (DOM order), enough for the association without pinning them to the
              box edges. Each button reduces label+icon → icon-only before it would
              overflow (@max-[250px]: the two labelled buttons measure ~230px
              combined incl. gap, so labels hold down to a ~250px container and
              drop to icons just above where they'd spill — live-measured, wants an
              on-device confirm like every width in this app) — the same idiom
              FilterControls above and MixerBar's own icon/text split use. */}
          {/* data-empty-controls: allowlisted by MixerBar's own click-outside-
              closes-edit-mode listener (the same closest() check that exempts the
              Clear ✕ / Filter popover / theme swatches — see MixerBar). Without
              it, tapping either of these buttons while the Tag Pool / edit panel
              is open (visible above the panel on larger phones) would be treated
              as an outside click and dismiss the panel: for Random that's exactly
              wrong (it should shuffle WITHOUT closing, matching the bar's own
              Random), and for Tag Pool the button owns its own open↔close toggle
              below, so the listener must not double-act on it either. */}
          {/* gap-xl (16px) between Tag Pool + Random — matched to the gap
              between the two filters above (FilterControls' inline root
              gap-x-[var(--space-xl)]), bumped up from the earlier space-lg. */}
          <div data-empty-controls className="hidden @max-[561px]:flex items-center gap-[var(--space-xl)]">
            {/* Tag Pool — always present when this row shows. Mirrors MixerBar's
                own Tag Pool button exactly, toggle included: opens the pool when
                closed, and becomes a "Done ✓" / CheckIcon button that closes it
                when edit mode is already open (reachable above the expanded panel
                on larger phones). Outline variant + TagPoolIcon otherwise. */}
            <div className="flex-none">
              <div className="@max-[250px]:hidden">
                <ActionButton variant="outline" onClick={editMode ? onCloseEditMode : onOpenEditMode}>
                  {editMode ? (
                    "Done ✓"
                  ) : (
                    <span className="inline-flex items-center gap-[var(--space-sm)]">
                      Tag Pool
                      <TagPoolIcon className="text-[var(--ink)]" />
                    </span>
                  )}
                </ActionButton>
              </div>
              <div className="hidden @max-[250px]:block">
                <IconButton
                  size="md"
                  border="base"
                  shadow="elev-2"
                  backgroundColor="transparent"
                  title={editMode ? "Done" : "Tag Pool"}
                  aria-label={editMode ? "Done" : "Tag Pool"}
                  onClick={editMode ? onCloseEditMode : onOpenEditMode}
                >
                  {editMode ? <CheckIcon className="text-[var(--ink)]" /> : <TagPoolIcon className="text-[var(--ink)]" />}
                </IconButton>
              </div>
            </div>
            {/* Random — joins @max-[481px]. Filled variant + DiceIcon, matching
                MixerBar's own Random button; shuffles via onRandomTags and never
                closes an open edit panel (the row's data-empty-controls above is
                what exempts it from the click-outside close, same as the bar). */}
            <div className="hidden @max-[481px]:block flex-none">
              <div className="@max-[250px]:hidden">
                <ActionButton variant="filled" onClick={onRandomTags}>
                  <span className="inline-flex items-center gap-[var(--space-sm)]">
                    Random
                    <DiceIcon className="text-[var(--ink)]" />
                  </span>
                </ActionButton>
              </div>
              <div className="hidden @max-[250px]:block">
                <IconButton
                  size="md"
                  border="base"
                  shadow="elev-2"
                  backgroundColor="var(--fill)"
                  title="Random"
                  aria-label="Random"
                  onClick={onRandomTags}
                >
                  <DiceIcon className="text-[var(--ink)]" />
                </IconButton>
              </div>
            </div>
          </div>
          </div>
          {/* BOTTOM: the rotating payoff line, centered horizontally +
              vertically in the bottom 1fr band (moved out of the top section
              so hero+instruction, filters, and payoff each own an equal third). */}
          <div className="flex flex-col items-center justify-center">
            <p className="font-mono text-[length:var(--text-base)] text-[var(--primary)] m-0">
              {EMPTY_STATE_COPY[emptyStateIndex].payoff}
            </p>
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
              // grid-cols-[repeat(5,minmax(0,230px))] + justify-center: the
              // desktop 5-across grid caps every card at 230px (the cover
              // art's native raster width, so covers never upscale — max
              // sharpness) and keeps a CONSTANT gap between cards (gap-xl, 16px),
              // putting the leftover row space on the OUTER EDGES instead — the
              // 5-card group centers, so the standard gap never changes and only
              // the two outer margins flex (measured: 0 at widths where the row
              // fills, growing to ~9px each side at the 1280 container cap).
              // minmax(0,230): tracks grow to 230 and STOP, but still shrink
              // below 230 when 5×230 + gaps won't fit the row (~1153-1262px), so
              // they stay one row and downscale (still sharp) instead of
              // wrapping. Nothing fractional ever lands in a rendered card — the
              // cards are 230 (or a clean downscale) and the gap is a flat 16.
              // Replaced repeat(auto-fill,minmax(208px,1fr)): 1fr ate all
              // leftover into the CELLS, so a 230-capped card left ~2-3px slack
              // on its right at wide widths; a definite-max minmax(208,230)
              // miscounts columns and wraps the 5th card mid-range — repeat(5) +
              // minmax(0,230) is the only form that holds 5-across AND caps AND
              // stays clean (all CDP-verified). The literal 5 couples to
              // DEFAULT_RESULT_COUNT, same as the 1152px carousel breakpoint
              // above — re-derive both if it changes. ALTERNATIVE considered:
              // justify-BETWEEN instead of center distributes the leftover into
              // the gaps (first card flush-left, last flush-right, gaps 16→20.5)
              // — a one-word swap if edge-flush is ever preferred over a
              // constant gap. justify-center is desktop-only:
              // max-[1152px]:justify-start restores the flex carousel's own
              // left-packed row. 230 also caps the carousel tiers via
              // ResultCard's max-w-[230px].
              className="relative grid grid-cols-[repeat(5,minmax(0,230px))] justify-center gap-[var(--space-xl)] pt-[40px] pr-[5px] pb-[40px] max-[1152px]:flex max-[1152px]:flex-nowrap max-[1152px]:justify-start pointer-events-none"
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
              {/* Card enter/exit is plain CSS keyframes now (ResultCard /
                  globals.css), not AnimatePresence. Departing cards stay mounted
                  through their exit via the lagging displayedResults/exitingTitles
                  above: a Clear ✕ leaves them in this map tagged isExiting until
                  the settle timer drops them; a RECOMMEND/swap replacement isn't
                  in exitingTitles, so it's simply no longer rendered (instant
                  removal — this app's deliberate asymmetry, only Clear ✕ animates
                  a departure). Iterating displayedResults (NOT results) is what
                  keeps the exiting cards in the DOM through their animation. */}
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
                    displayedResults.map((r) => r.series.title),
                    locked,
                    visibleCardTierCount,
                  );
                  const effectiveStaggerMs = getEffectiveStaggerMs(cardStaggerMs, paceCount);
                  return displayedResults.map((entry, index) => {
                    // Exiting wins: a card removed by a Clear ✕ (in exitingTitles)
                    // plays the exit keyframe, not the enter, even if its title
                    // still happens to be in newTitles.
                    const isExiting = exitingTitles.has(entry.series.title);
                    // Enter gating unchanged: newTitles (useKonomi.ts), or a dice
                    // swap (justSwappedIndex, the same signal that seeds
                    // startWithSwapHint below). Decoupled from live lock state so
                    // locking/unlocking never replays an entrance. Crucially, a
                    // CSS keyframe only plays on mount and never replays on a
                    // later re-render/reorder — so a settled or locked card never
                    // re-animates while its title lingers in newTitles between
                    // RECOMMENDs. That immunity is the whole reason the card
                    // enter/exit is CSS and not AnimatePresence (which replayed a
                    // present card's cached entrance on sibling shifts — the
                    // locked-card bug; see globals.css / CLAUDE.md).
                    const isEnteringFromSwap = justSwappedIndex === index;
                    const isEntering = !isExiting && (newTitles.includes(entry.series.title) || isEnteringFromSwap);
                    // Stagger delay for whichever keyframe is active — both enter
                    // and exit sweep L->R (index * stagger); a swap entrance has
                    // no stagger (single card). Unused when neither is active.
                    const animationDelayMs = isExiting
                      ? index * effectiveStaggerMs
                      : isEnteringFromSwap
                        ? 0
                        : index * effectiveStaggerMs;
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
                        isExiting={isExiting}
                        animationDelayMs={animationDelayMs}
                        // FLIP-slide a surviving card to its new slot when the
                        // row reorders (locks compacting to the front). Enabled
                        // on ALL tiers, carousel included, for consistency: the
                        // carousel often shows several cards at once (and shows
                        // up on mid-range resizes/breakpoints), so the slide is
                        // frequently visible there too — and it's CDP-verified
                        // smooth on the scroll-snap row (scrollLeft stays put,
                        // no snap fight) in both directions. The one spot it's
                        // effectively unseen is a RECOMMEND at the narrowest
                        // widths, where the scroll-reset-to-first-new-card slides
                        // the locked block off-screen left — harmless (still no
                        // jank), and a candidate for a future per-breakpoint gate
                        // via this same prop (kept as the seam) or a different
                        // header cue for that case. Clear ✕ has no scroll reset,
                        // so its slide is visible on the carousel and worth it.
                        // The prop still routes through ResultCard's reduced-motion
                        // gate. layoutDependency is the displayedResults reference
                        // so Motion only re-measures on a genuine reorder, never
                        // on a resize render.
                        layoutSlide
                        layoutDependency={displayedResults}
                      />
                    );
                  });
                })()}
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

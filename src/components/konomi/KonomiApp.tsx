"use client";

import { animate, useMotionValue, type AnimationPlaybackControls } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { visiblePoolTagNames } from "@/lib/konomi/tagPool";
import { isThemeKey, THEME_STORAGE_KEY } from "@/lib/konomi/themes";
import { THEME_TRANSITION } from "@/lib/konomi/themeTransitionTuning";
import type { LevelKey, Series, TagInfo } from "@/lib/konomi/types";
import { useKonomi } from "@/lib/konomi/useKonomi";
import { Masthead } from "./Masthead";
import { MixerBar } from "./MixerBar";
import { RecommendationsBody } from "./RecommendationsBody";
import { ResultsHeader } from "./ResultsHeader";
import { setLevelPref, useLevel } from "./tagPoolPrefs";

interface KonomiAppProps {
  initialSeries: Series[];
  initialTags: TagInfo[];
}

// Read live (not cached) so a change to the OS setting mid-session is honored,
// and so it's cheap to call from the settle path. Gates only the AUTOMATIC,
// spring-driven parts of the masthead morph (the release settle and the
// RECOMMEND-triggered collapse) — the scrub itself is direct manipulation (the
// user is moving it), which isn't the kind of motion this setting is about, so
// it stays live either way. When reduced motion is on, those endpoints are set
// instantly instead of sprung.
function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Masthead scroll-morph settle + gesture tuning (feat/masthead-scroll-morph),
// settled live via the animation debug panel and then inlined here as plain
// constants — the panel's own documented end state (see animationDebugStore.ts).
// BOUNCE: the release spring's overshoot (0.2 = the KONOMI wordmark springs a
// hair past its target size before settling back). DURATION_S: perceptual settle
// time — 0.7, deliberately slower than the old 0.4 CSS default, chosen on-device
// for a more languid settle. SCRUB_DISTANCE_PX: finger/wheel travel mapped to
// the whole 0->1 morph. FLICK_PROJECTION_MS: velocity look-ahead so a fast flick
// completes past the midpoint (momentum-based release, not raw position).
const MASTHEAD_SETTLE_BOUNCE = 0.2;
const MASTHEAD_SETTLE_DURATION_S = 0.7;
const MASTHEAD_SCRUB_DISTANCE_PX = 120;
const MASTHEAD_FLICK_PROJECTION_MS = 120;

export function KonomiApp({ initialSeries, initialTags }: KonomiAppProps) {
  const k = useKonomi(initialSeries, initialTags);
  const level = useLevel();
  // Owned here, not inside MixerBar — hitting RECOMMEND (in MixerBar, a
  // sibling of the results surface) needs to force this closed even when
  // edit mode is currently open, so the user lands on the new results
  // instead of staying behind a sheet that just silently updated behind
  // them. Same cross-component-reach reason the retired `activeTab` used
  // to live here.
  const [editMode, setEditMode] = useState(false);
  // Masthead landing/compact state — deliberately NOT derived from
  // k.hasResults (that was tried first: `active={k.hasResults}`). A live
  // derivation re-expands the masthead the instant results are cleared,
  // reported directly as jarring — the user only ever wants the shrink to
  // happen once, on the first real RECOMMEND, and never automatically
  // reverse itself afterward. Set true in handleRecommend below on
  // success (never reset by clearRecs or anything else), and toggled
  // either direction by the scroll/pull gesture effect below — the only
  // way back to expanded (the in-banner toggle button was removed once
  // that gesture covered both directions).
  const [mastheadCollapsed, setMastheadCollapsed] = useState(false);
  // Wraps Masthead + the results section specifically, NOT MixerBar (see
  // the JSX below) — this is the actual scroll container now (moved off
  // the outer shell root), and the two effects right after this both key
  // off it. Scoping the wrapper itself to exclude MixerBar, rather than
  // adding a runtime "is this event's target inside MixerBar" check to
  // the gesture effect below, means a gesture that starts on MixerBar
  // structurally never reaches either listener at all (it isn't a
  // descendant of this ref), with no need to touch MixerBar.tsx (kept
  // fully out of scope this phase) to make that guarantee hold.
  const scrollableRef = useRef<HTMLDivElement>(null);
  // Live masthead morph position, 0 (expanded) -> 1 (collapsed). A Motion
  // useMotionValue (hybrid C), NOT a plain ref: the scrub sets it directly and
  // Motion times successive sets to derive VELOCITY, which the release uses to
  // (a) launch the settle spring carrying the gesture's momentum and (b) decide
  // the endpoint from the projected rest position — so a fast flick completes
  // past the midpoint. It never triggers a React re-render (it drives one CSS
  // custom property via the subscription effect below), so the whole morph is
  // still pure CSS calc off one inherited variable — the exact A layer, just
  // with a physics-aware driver. mastheadCollapsed stays the settled boolean
  // truth (RECOMMEND, ThemeSwitcher placement); this is the continuous value
  // between its two endpoints. settleAnimRef holds the in-flight settle so a new
  // grab (or a RECOMMEND) can stop() it and take over from the current value
  // and velocity — a continuous hand-off, not a snap.
  const progress = useMotionValue(0);
  const settleAnimRef = useRef<AnimationPlaybackControls | null>(null);

  // Mirror the motion value onto --masthead-progress on the scroll wrapper every
  // frame Motion ticks it (scrub sets, or the settle spring animates) — Masthead
  // and the wrapper's own paddingTop read it via calc, so writing this one
  // inherited property drives the entire morph. React never manages this
  // property (it's never in the element's style prop), so this coexists with the
  // React-controlled paddingTop untouched. @property (globals.css) gives it an
  // initial 0 for the pre-hydration first paint, so the masthead renders
  // expanded before this ever runs.
  useEffect(() => {
    const write = (v: number) => scrollableRef.current?.style.setProperty("--masthead-progress", String(v));
    write(progress.get());
    return progress.on("change", write);
  }, [progress]);
  // Scrubs the masthead morph off the wheel/touch delta: a downward gesture
  // while expanded grows progress toward 1 (collapsed), a pull-down at the top
  // shrinks it back toward 0 (expanded), in real time — "the scroll reflects how
  // far along the masthead is." On release a Motion spring settles it to the
  // nearer endpoint (hybrid C), carrying the gesture's velocity and deciding the
  // endpoint from the PROJECTED rest position so a fast flick completes past the
  // midpoint. Replaced the old threshold boolean flip: same two-direction
  // collapsing-header interaction, now a momentum-aware scrub. Listeners bind
  // once — the effect reads no React state (direction from delta sign, gate from
  // scrollTop, spring/scrub tuning read live from the debug store per event), so
  // it never needs to re-bind.
  //
  // A real, live-caught bug shaped this into a gesture-delta listener instead of
  // a `scroll`-event/scrollTop approach: this app's content fits exactly by
  // construction, so there is usually NO overflow to scroll into — a `scroll`
  // listener has nothing to fire from (confirmed live at 1280×900: scrollHeight
  // == clientHeight, so scrollTop can't move). Reading the gesture directly
  // works whether or not anything actually scrolls.
  //
  // scrub distance = the finger/wheel travel mapped to the full 0->1 morph (live
  // from the debug store, default 120px). AT_TOP_PX gates the EXPAND direction
  // only: pulling to re-expand only makes sense once genuinely back at the top
  // (requested directly), matching pull-to-refresh's "past the boundary" gate;
  // collapsing has no such requirement.
  //
  // scrollFadeOrientationAt mirrors MixerBar.tsx's helper of the same shape
  // (duplicated, not shared — small and self-contained). Matching-axis only,
  // not "exempt from any ScrollFadeArea": the results carousel's own horizontal
  // ScrollFadeArea wraps the ENTIRE card row, so a blanket check treated nearly
  // the whole results area (incl. card covers) as exempt — a real, live-caught
  // regression. Only a VERTICAL ScrollFadeArea ancestor (a card's tag-scroll
  // area, TagPoolBody's chips) actually conflicts with this vertical gesture.
  useEffect(() => {
    const scrollable = scrollableRef.current;
    if (!scrollable) return;
    const AT_TOP_PX = 2; // sub-pixel tolerance, not a strict === 0

    function scrollFadeOrientationAt(target: EventTarget | null): "horizontal" | "vertical" | null {
      const el = target instanceof Element ? target : null;
      const value = el?.closest("[data-scroll-fade-orientation]")?.getAttribute("data-scroll-fade-orientation");
      return value === "horizontal" || value === "vertical" ? value : null;
    }

    // Kill any in-flight settle so a fresh grab takes over from the current
    // value AND velocity (Motion keeps tracking velocity through the stop) — a
    // continuous hand-off rather than a snap.
    function stopSettle() {
      settleAnimRef.current?.stop();
      settleAnimRef.current = null;
    }

    // Live scrub write: set the motion value directly (clamped). Motion times
    // successive sets to derive the velocity the release reads.
    function scrub(value: number) {
      progress.set(Math.min(1, Math.max(0, value)));
    }

    // Release: choose the endpoint from the PROJECTED rest (current + velocity *
    // look-ahead), not raw position — a fast flick completes past the midpoint,
    // a slow drag falls back to whichever side it's actually on. Then spring
    // there carrying that velocity, with the live-tunable bounce/duration.
    // Reduced motion: jump to the endpoint instantly, no spring. Reconciles the
    // settled boolean so ThemeSwitcher placement / a later RECOMMEND agree;
    // Effect B no-ops on that change since progress is already at the target.
    function settle() {
      const velocity = progress.getVelocity(); // progress-units per second
      const projected = progress.get() + velocity * (MASTHEAD_FLICK_PROJECTION_MS / 1000);
      const target = projected >= 0.5 ? 1 : 0;
      stopSettle();
      if (prefersReducedMotion()) {
        progress.set(target);
      } else {
        settleAnimRef.current = animate(progress, target, {
          type: "spring",
          bounce: MASTHEAD_SETTLE_BOUNCE,
          duration: MASTHEAD_SETTLE_DURATION_S,
          velocity,
        });
      }
      setMastheadCollapsed(target === 1);
      if (target === 1) scrollable!.scrollTop = 0;
    }

    let wheelResetTimer: number | null = null;
    let wheelAxis: "horizontal" | "vertical" | null = null;
    function handleWheel(e: WheelEvent) {
      if (scrollFadeOrientationAt(e.target) === "vertical") return;

      // Lock the gesture's axis on its first meaningful event and hold it until
      // a ~150ms pause ends the gesture — the wheel counterpart of the touch
      // axis lock below. A horizontally-dominant wheel (panning the results
      // carousel) is left ENTIRELY to the browser: it never scrubs and never
      // preventDefaults, so the carousel scrolls freely. The old threshold
      // accumulator absorbed a horizontal swipe's incidental deltaY implicitly
      // (it rarely reached 20px before the reset); the continuous scrub has no
      // such deadzone, so the axis has to be explicit now, or that incidental
      // deltaY nudges the masthead — the exact regression this fixes. Ties bias
      // to horizontal (>=) so ambiguous diagonals favor the carousel, not a
      // masthead takeover. Sub-1px events don't lock — they're noise between
      // real ticks. Vertical wheels still scrub ANYWHERE, including over the
      // carousel: a vertical intent collapses the masthead by design.
      if (wheelAxis === null) {
        if (Math.abs(e.deltaX) < 1 && Math.abs(e.deltaY) < 1) return;
        wheelAxis = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? "horizontal" : "vertical";
      }
      // Re-arm the gesture-end timer every event. No native wheel-gesture-end
      // event exists, so a short pause stands in for "released": settle a
      // vertical gesture, then clear the axis so the next gesture re-locks
      // fresh. (Wheel velocity has usually decayed by settle time, so wheel
      // settles ~position-based; the flick projection is really a touch
      // affordance, where touchend fires live.)
      if (wheelResetTimer !== null) window.clearTimeout(wheelResetTimer);
      wheelResetTimer = window.setTimeout(() => {
        if (wheelAxis === "vertical") settle();
        wheelAxis = null;
        wheelResetTimer = null;
      }, 150);
      if (wheelAxis === "horizontal") return;

      const p = progress.get();
      const expanding = e.deltaY < 0;
      // Expand only from the top; and don't fight past either end (let a normal
      // over-scroll through at 0/1 rather than swallowing it).
      if (expanding && scrollable!.scrollTop > AT_TOP_PX) return;
      if ((e.deltaY > 0 && p >= 1) || (expanding && p <= 0)) return;
      e.preventDefault();
      stopSettle();
      scrub(p + e.deltaY / MASTHEAD_SCRUB_DISTANCE_PX);
    }

    let touchStartX: number | null = null;
    let touchStartY: number | null = null;
    let touchExempt = false;
    let touchAxis: "horizontal" | "vertical" | null = null;
    // Captured at touchstart so the whole drag maps ABSOLUTELY (start + total
    // dy / distance), not incrementally — an overshoot-then-reverse tracks the
    // finger back down for free, no per-fire reset needed.
    let progressAtStart = 0;
    function handleTouchStart(e: TouchEvent) {
      touchExempt = scrollFadeOrientationAt(e.target) === "vertical";
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchAxis = null;
      // A new touch interrupts a running settle; capture the frozen position as
      // this drag's origin.
      stopSettle();
      progressAtStart = progress.get();
    }
    function handleTouchMove(e: TouchEvent) {
      if (touchExempt || touchStartX === null || touchStartY === null) return;
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      // Lock the axis on the FIRST touchmove and never re-decide — and it must
      // be the first move, not after a threshold: the browser commits a touch
      // gesture's scrollability on that first touchmove (confirmed live —
      // preventing even one sub-threshold move commits the WHOLE gesture away
      // from native scroll, and it can't be handed back). So a horizontal
      // gesture must go un-prevented from move one or the carousel can't pan.
      if (touchAxis === null) {
        touchAxis = Math.abs(x - touchStartX) > Math.abs(y - touchStartY) ? "horizontal" : "vertical";
      }
      if (touchAxis === "horizontal") return;
      // Vertical gesture: claim it (preventDefault from move one, scoped to
      // this axis) and scrub the morph off the absolute finger travel.
      e.preventDefault();
      const dy = touchStartY - y; // positive = finger moved up = collapse direction
      let next = progressAtStart + dy / MASTHEAD_SCRUB_DISTANCE_PX;
      // Gate the expand direction (going below where the gesture started) on
      // being at the top, same rule as wheel.
      if (next < progressAtStart && scrollable!.scrollTop > AT_TOP_PX) next = progressAtStart;
      scrub(next);
    }
    function handleTouchEnd() {
      if (touchAxis === "vertical") settle();
      touchStartX = null;
      touchStartY = null;
      touchAxis = null;
    }

    scrollable.addEventListener("wheel", handleWheel, { passive: false });
    scrollable.addEventListener("touchstart", handleTouchStart, { passive: true });
    scrollable.addEventListener("touchmove", handleTouchMove, { passive: false });
    scrollable.addEventListener("touchend", handleTouchEnd, { passive: true });
    scrollable.addEventListener("touchcancel", handleTouchEnd, { passive: true });
    return () => {
      scrollable.removeEventListener("wheel", handleWheel);
      scrollable.removeEventListener("touchstart", handleTouchStart);
      scrollable.removeEventListener("touchmove", handleTouchMove);
      scrollable.removeEventListener("touchend", handleTouchEnd);
      scrollable.removeEventListener("touchcancel", handleTouchEnd);
      if (wheelResetTimer !== null) window.clearTimeout(wheelResetTimer);
    };
  }, [progress]);

  // Effect B: settle the morph when mastheadCollapsed changes for a reason
  // OTHER than the scrub — i.e. a successful RECOMMEND (handleRecommend sets it
  // true). Springs the progress value to match the new settled boolean (or jumps
  // instantly under reduced motion). No-ops when the gesture's own settle set the
  // boolean (progress is already at the target), so the two never double-drive.
  useEffect(() => {
    const target = mastheadCollapsed ? 1 : 0;
    if (progress.get() === target) return;
    settleAnimRef.current?.stop();
    if (prefersReducedMotion()) {
      progress.set(target);
      return;
    }
    settleAnimRef.current = animate(progress, target, {
      type: "spring",
      bounce: MASTHEAD_SETTLE_BOUNCE,
      duration: MASTHEAD_SETTLE_DURATION_S,
    });
  }, [mastheadCollapsed, progress]);

  // Restores the persisted theme into React state on mount, then keeps
  // <html> and localStorage in sync with k.theme on every subsequent
  // change (user picks a new theme via ThemeSwitcher). The mount-only
  // restore has to happen *before* this effect's own "mirror k.theme onto
  // html" write, not after: layout.tsx's THEME_INIT_SCRIPT already set
  // <html>'s data-theme correctly before paint (a persisted "dark", say),
  // but k.theme's own React state still starts at the reducer's fixed
  // "default" (required to match SSR — see layout.tsx's own comment). If
  // the mirror write ran unconditionally first, it would clobber that
  // already-correct "dark" back to "default" for one visible frame before
  // the restore's corrective re-render put it back — the exact flash this
  // feature exists to prevent. Guarding with a ref and returning early on
  // the one tick a restore actually happens avoids that: this effect only
  // ever mirrors/persists a k.theme value it knows is either already
  // correct or has nothing to restore over.
  const didRestoreTheme = useRef(false);
  const lastAppliedTheme = useRef<string | null>(null);
  const { theme, setTheme } = k;
  useEffect(() => {
    if (!didRestoreTheme.current) {
      didRestoreTheme.current = true;
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (isThemeKey(stored) && stored !== theme) {
        setTheme(stored);
        return;
      }
    }
    // Theme-switch cross-fade — GRADUATED from sandbox A v5 (tag
    // sandbox:theme-transition/A-v5; tuning in themeTransitionTuning.ts, register
    // + drift log in SANDBOX_GRADUATIONS.md). Animate only on a real USER switch —
    // a previous applied theme exists and differs (mount/StrictMode-safe via
    // lastAppliedTheme) — and not under reduced motion.
    //
    // Mechanism: the View Transitions API. Wrapping the data-theme change in
    // startViewTransition() lets WebKit snapshot the page and cross-fade old→new
    // on the compositor (GPU) — one composited dissolve, no per-element colour
    // transition. The earlier CSS-class approach painted the whole tree every
    // frame and stalled at the tail on mobile WebKit; this doesn't. Engines
    // without the API fall back to an instant swap.
    const prevTheme = lastAppliedTheme.current;
    lastAppliedTheme.current = theme;
    const animateThemeSwitch =
      prevTheme !== null && prevTheme !== theme && !prefersReducedMotion();

    const applyTheme = () => {
      document.documentElement.setAttribute("data-theme", theme);
    };

    const doc = document as Document & {
      startViewTransition?: (callback: () => void) => unknown;
    };
    if (animateThemeSwitch && typeof doc.startViewTransition === "function") {
      const root = document.documentElement;
      root.style.setProperty("--theme-switch-dur", `${THEME_TRANSITION.durMs}ms`);
      root.style.setProperty("--theme-switch-ease", THEME_TRANSITION.ease);
      doc.startViewTransition(applyTheme);
    } else {
      applyTheme();
    }

    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Storage unavailable (private-browsing quota, disabled storage) —
      // <html>'s data-theme is still set above, theme switching still
      // works for the session, it just won't survive a refresh.
    }
  }, [theme, setTheme]);

  // The only place level-change needs to touch both the preference store
  // and the mixer: persist the new level, then prune any selected tag the
  // new level no longer shows (see pruneTags' doc comment in useKonomi.ts).
  // visiblePoolTagNames (not a raw isTagVisibleAtLevel filter) is what
  // correctly excludes Technical/Sexual Content too — see its doc comment.
  function handleLevelChange(next: LevelKey) {
    setLevelPref(next);
    k.pruneTags(new Set(visiblePoolTagNames(k.allTags, next, k.totalSeriesCount)));
  }

  // Random ×3 must only ever pick from what the pool actually shows at the
  // current level — same canonical visible-name list as the prune cascade.
  function handleRandomTags() {
    k.randomTags(visiblePoolTagNames(k.allTags, level, k.totalSeriesCount));
  }

  // Closes edit mode only on a successful RECOMMEND. An error (e.g.
  // "impossible-min") leaves the user exactly where they need to be to fix
  // it — still in edit mode, tags and section tab untouched — rather than
  // collapsing back to browse mode and hiding the fix behind a still-open
  // affordance they'd have to reopen. k.recommend() returns the resulting
  // MixerError synchronously (or null on success) specifically so this
  // decision doesn't need to wait for a re-render — see its own doc
  // comment in useKonomi.ts.
  function handleRecommend() {
    const error = k.recommend();
    if (!error) {
      setEditMode(false);
      setMastheadCollapsed(true);
    }
  }

  return (
    // App-shell rewrite: this root is now a fixed 100svh flex column, not
    // a normally-scrolling page. html/body (globals.css) stop being the
    // real scroll root — nothing above or below this div needs to scroll
    // at all anymore. See DESIGN_SYSTEM.md for the full reasoning (traced
    // the MixerBar animation machinery back to "the page itself scrolls"
    // being the root condition forcing it, and removed that condition
    // instead of patching further on top of it).
    //
    // Unconditional overflow-hidden now, not the mastheadCollapsed-keyed
    // toggle an earlier pass had here — the actual scroll container moved
    // one level in, to the new wrapper around Masthead + results
    // specifically (below), once "scroll a bit collapses the masthead"/
    // "pull down while collapsed re-expands it" needed a scrollable
    // region that explicitly excludes MixerBar. This root is now just a
    // fixed-size flex shell holding that wrapper and MixerBar as two
    // siblings — MixerBar is no longer inside anything that scrolls at
    // all, in either masthead state, so its own position:sticky is a
    // permanent no-op now rather than only a collapsed-mode one.
    <div
      // No data-theme here (removed) — this div used to carry its own
      // synced copy, but it's React-rendered and re-renders in lockstep
      // with k.theme, including on the one extra render the theme-persist
      // effect above triggers right after mount to restore a saved theme.
      // That correction happens in a useEffect, which by design runs
      // *after* the browser's first paint — so for one real, visible
      // frame, this div (and everything under it, since [data-theme="X"]
      // rules are just custom-property declarations descendants inherit
      // through) would have painted the reducer's fixed initial "default"
      // theme, then flashed to the restored one. <html>'s own data-theme
      // doesn't have this problem (layout.tsx's THEME_INIT_SCRIPT sets it
      // synchronously before paint, outside React entirely) — so this div
      // now just inherits --bg/--ink/etc. from html like every other
      // descendant, rather than redeclaring a value that can't help but
      // lag behind on first load.
      //
      // No background, no scrollbar-gutter, no relative here — all three
      // live on html (globals.css); unaffected by this rewrite, since
      // html was always the real place a full-viewport background needed
      // to live regardless of whether it also happened to be the scroll
      // root.
      className="h-[100svh] flex flex-col overflow-hidden overflow-x-clip px-[var(--space-2xl)] pb-[var(--space-2xl)] font-body text-[var(--ink)]"
    >
      {/* AnimationDebugPanel removed for now, not deleted — see
          AnimationDebugPanel.tsx/animationDebugStore.ts, both left intact.
          Re-add `<AnimationDebugPanel />` here if it's needed again. */}

      {/* flex-1 min-h-0: this column, not the root div above, is what
          fills 100svh minus this root's own pt/pb padding — a single flex
          child of a flex-col parent naturally takes 100% of the remaining
          main-axis space once given flex-1, no separate height calc
          needed. min-h-0 overrides this flex item's own default
          min-height:auto, which would otherwise refuse to shrink below
          its content's intrinsic height — exactly the thing that would
          silently break "results only ever takes what's left" the moment
          results' own content ever wanted to be taller than that. w-full:
          a flex item's own width doesn't automatically stretch to fill a
          flex-col parent's cross axis the way max-w-[1280px] mx-auto
          alone would have on a plain block div — needed to keep mx-auto's
          own centering working the same as before. */}
      {/* max-w-[1214px]: the shared content column for masthead, results, AND
          MixerBar (see MixerBar's own comment below on why it rides this same
          column). 1214 = the natural width of 5 result cards at their 230px cap
          + 4 × 16px gaps (5×230 + 4×16) — so the desktop 5-across grid fills
          this column edge-to-edge with a constant gap and everything (wordmark,
          Filter/Clear, cards, empty box, mixer controls) shares one set of
          edges. Was 1280 before the 230px card cap landed; capping the column
          to the card row's own width is what keeps them aligned rather than
          leaving the cards inset within a wider column. If the card cap (230,
          ResultCard) or the count (5, DEFAULT_RESULT_COUNT) changes, re-derive. */}
      <div className="relative z-[var(--z-raised)] flex flex-col flex-1 min-h-0 max-w-[1214px] mx-auto w-full">
        {/* Wraps Masthead + results only — MixerBar (below, outside this
            div) is deliberately not part of it. scrollableRef is what the
            wheel/touch gesture effect above listens on (a real `scroll`
            event has nothing to fire from in the common case — see that
            effect's own comment for why it doesn't rely on one; the effect
            reads deltas, never scrollTop-driven scroll events, so this div
            does NOT need to be a real overflow scroller for collapse/expand
            to work).

            overflow is deliberately VISIBLE here (no overflow-y-auto),
            reverted from a Phase-1 app-shell overflow-y-auto that was
            confirmed live to clip the results row's own bleed on BOTH axes
            and reported as three separate regressions: the card flip
            clipping vertically AND horizontally, the furthest-right card's
            right shadow cut off, and the carousel scroll arrows cut off.
            The horizontal half is the exact CSS gotcha this app already
            documents on the root (see the root div's own overflow-x-clip
            comment): overflow-y:auto with an otherwise-visible x axis makes
            overflow-x compute to auto too, so a y-scroller silently clips x
            as well. The results row intentionally bleeds past its own box —
            the flip's ±40px vertical bulge (RecommendationsBody's pt/pb-40 +
            -mt/-mb-40 net-zero pair), the elev-4 right/bottom card shadow,
            and ScrollFadeArea's edge arrows — none of which can survive a
            clipping ancestor. A y-scroller can't coexist with a visible x
            axis, so the scroller had to go, not just its x clip.

            The only thing overflow-y-auto bought was a couple-px scroll on
            an extreme-short viewport (expanded masthead + very short
            screen); that case is rare and already recoverable by collapsing
            the masthead, a strictly better trade than clipping the results
            bleed on every flip/scroll. min-h-0 + flex-1 still size this div
            (and RecommendationsBody's 100cqh card height through it)
            exactly as before — overflow doesn't affect that. The results
            carousel keeps its OWN overflow-x-auto (ScrollFadeArea), and the
            root's overflow-x-clip is the backstop against any real
            horizontal page scroll, so visible here can't leak one.
            paddingTop morphs with the masthead: it is the 24px breathing room
            ABOVE the banner, so it has to close in lockstep with the masthead's
            own collapse or the gap above would snap independently. Driven off
            the same inherited --masthead-progress via calc (24px at 0 ->
            0 at 1) — it rides the gesture live and the settle spring for free,
            since the var is what transitions and this is just derived from it.
            This element is scrollableRef, so the gesture effect's imperative
            --masthead-progress / transition writes land here; React only owns
            this paddingTop, so the two don't collide. */}
        <div
          ref={scrollableRef}
          className="flex flex-col flex-1 min-h-0"
          style={{ paddingTop: "calc(var(--space-2xl) * (1 - var(--masthead-progress)))" }}
        >
          <Masthead theme={k.theme} onThemeChange={k.setTheme} collapsed={mastheadCollapsed} />

          {/* Results is the one flexible region of the shell — flex-1
              min-h-0 (same reasoning as the column above) makes this section
              exactly as tall as whatever's left after Masthead's and
              MixerBar's own natural heights, automatically, every time the
              viewport changes. No vertical scroll here by design (see
              RecommendationsBody.tsx's own top comment): results are always
              a single row at every breakpoint (DEFAULT_RESULT_COUNT is a
              hard 5, and the grid/carousel breakpoint is calibrated to be
              exactly where 5 cards stop fitting one row), so there was never
              a second row this section would need to scroll past.

              mb-[var(--space-2xl)]: still the card→mixer gap, unchanged in
              value or reasoning — the uniform-frame group (header→cards,
              cards→mixer, page top/bottom) all still read as the same 24px,
              adjacent block margins between this section and MixerBar's own
              root div would otherwise collapse to whichever is larger, not
              add, so this is still the one that has to carry it. flex
              flex-col: this section's own two children (ResultsHeader,
              RecommendationsBody) need the same "fixed row, then the
              remainder" split this outer column already uses for Masthead/
              results/MixerBar — RecommendationsBody's own root carries the
              matching flex-1 min-h-0 (see that file's own top comment). */}
          <section className="mb-[var(--space-2xl)] flex-1 min-h-0 flex flex-col">
            <ResultsHeader
              hasResults={k.hasResults}
              // Partition the current results into locked / new / existing (they
              // sum to results.length). A result is LOCKED if held; else EXISTING
              // if its title was in the previous batch (prevResultTitles), else
              // NEW. Locked wins over existing so a carried-over lock is counted
              // once, as locked (see ResultsHeader's own comment).
              lockedCount={k.results.filter((r) => k.locked[r.series.title]).length}
              newCount={
                k.results.filter(
                  (r) => !k.locked[r.series.title] && !k.prevResultTitles.includes(r.series.title),
                ).length
              }
              existingCount={
                k.results.filter(
                  (r) => !k.locked[r.series.title] && k.prevResultTitles.includes(r.series.title),
                ).length
              }
              onUnlockAll={k.unlockAll}
              onClearRecs={k.clearRecs}
              onLevelChange={handleLevelChange}
            />

            <RecommendationsBody
              results={k.results}
              hasResults={k.hasResults}
              selectedTags={k.selectedTags}
              filledCount={k.filledCount}
              minNum={k.minNum}
              recommendGen={k.recommendGen}
              firstNewIndex={k.firstNewIndex}
              newTitles={k.newTitles}
              clearGen={k.clearGen}
              locked={k.locked}
              flipped={k.flipped}
              canSwap={k.canSwap}
              onFlip={k.toggleFlip}
              onToggleLock={k.toggleLock}
              onReplace={k.replaceCard}
              onChipToggle={k.toggleTag}
              tagInfoByName={k.tagInfoByName}
              totalSeriesCount={k.totalSeriesCount}
              onLevelChange={handleLevelChange}
              editMode={editMode}
              onOpenEditMode={() => setEditMode(true)}
              onCloseEditMode={() => setEditMode(false)}
              onRandomTags={handleRandomTags}
            />
          </section>
        </div>

        {/* Nested inside the same max-w-[1214px] z-raised column as
            Masthead/the results section above (a sibling of the new
            scrollable wrapper, not inside it — see that wrapper's own
            comment for why), not a page-level sibling either — now that
            MixerBar is normal flow, not position:fixed, it needs the same
            shared content column (left/right framing) the header and
            cards already use, or its edges would drift from theirs the
            moment the page's own centered max-w box stops filling the
            viewport (see MixerBar.tsx's own top comment for how this was
            confirmed not to shift any of its internal @container
            breakpoints). Last child — bottom of the group, in document
            order matching its visual position. Unchanged by the app-shell
            rewrite — still exactly the same component, still sticky/
            marginTop/pin+clip-path internally; it just now sits in a flex
            column instead of plain block flow, and its own sticky
            positioning has nothing to stick to anymore since it's no
            longer inside anything that scrolls, in either masthead state
            (a no-op, not a bug — see DESIGN_SYSTEM.md). */}
        <MixerBar
          slots={k.slots}
          dragOverIndex={k.dragOverIndex}
          minMatch={k.minMatch}
          filledCount={k.filledCount}
          onSlotDragOver={k.setDragOver}
          onSlotDragLeave={k.clearDragOver}
          onSlotDrop={k.placeInSlot}
          onSlotClick={k.clearSlot}
          onSetMatch={k.setMinMatch}
          onRandomTags={handleRandomTags}
          onClearSlots={k.clearSlots}
          onRecommend={handleRecommend}
          error={k.mixerError}
          editMode={editMode}
          onOpenEditMode={() => setEditMode(true)}
          onCloseEditMode={() => setEditMode(false)}
          allTags={k.allTags}
          selectedTags={k.selectedTags}
          totalSeriesCount={k.totalSeriesCount}
          onChipToggle={k.toggleTag}
        />
      </div>
    </div>
  );
}

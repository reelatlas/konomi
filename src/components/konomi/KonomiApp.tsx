"use client";

import { useEffect, useRef, useState } from "react";
import { visiblePoolTagNames } from "@/lib/konomi/tagPool";
import { isThemeKey, THEME_STORAGE_KEY } from "@/lib/konomi/themes";
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
  // Drives both masthead transitions: a downward gesture while expanded
  // collapses it ("I'm done with the banner, show me more"), an upward-
  // finger/pull-down gesture while collapsed and at the top re-expands it
  // — a traditional collapsing-header pattern, triggered rather than
  // continuously scroll-linked (this app's shell only has two discrete
  // masthead sizes, not a smooth scroll-scrubbed range between them).
  //
  // A real, live-caught bug shaped this into a gesture-delta listener
  // instead of the `scroll`-event/scrollTop-position approach an earlier
  // pass used: this app's whole point is that content fits exactly, by
  // construction, in ordinary use — meaning there is usually NO overflow
  // to genuinely scroll into at all, at a normal viewport height. A
  // `scroll`-event listener has nothing to ever fire from in that case —
  // confirmed live, at a perfectly ordinary 1280×900 viewport, landing
  // content's own scrollHeight exactly equals clientHeight, so a wheel
  // scroll simply can't move scrollTop even a single px, and the collapse
  // never triggers. Reading the gesture directly (wheel deltaY, touch
  // move distance) instead of its scroll *result* works regardless of
  // whether there's anything to actually scroll — the same reason the
  // collapsed→expanded direction already had to work this way from the
  // start (that direction never has overflow to react to positionally,
  // even in principle, since collapsed content is designed to always fit).
  //
  // COLLAPSE_THRESHOLD_PX/EXPAND_THRESHOLD_PX: 20 each — down from 60,
  // which read as too reluctant to trigger in practice; still enough to
  // clear real gesture noise (sub-pixel jitter, a light accidental brush)
  // without needing much deliberate intent.
  //
  // AT_TOP_PX gates the expand direction only, not collapse: pulling to
  // re-expand only makes sense once genuinely back at the top (requested
  // directly — "make sure it scrolls all the way to the top to open"),
  // matching a native pull-to-refresh's own "past the boundary" gate.
  // Collapsing has no equivalent requirement — the intent ("show me more
  // content") is the same whether the gesture starts at the top of
  // whatever's currently scrolled or partway through it.
  //
  // scrollFadeOrientationAt mirrors MixerBar.tsx's own helper of the same
  // name/shape (see that file's blockScrollThrough for the original) —
  // duplicated rather than imported, since this is a small, self-
  // contained check and the two call sites have no other reason to share
  // a module. Matching-axis only, not "exempt from any ScrollFadeArea
  // whatsoever" — an earlier version of this effect used the blunter
  // check and broke on a second real, live-caught bug: the results
  // carousel's own ScrollFadeArea (horizontal) wraps the ENTIRE card row
  // as its scroll viewport, so a blanket "inside any ScrollFadeArea"
  // check treated nearly every point in the whole results area as
  // exempt, including a card's own cover image, which has nothing to do
  // with any scrolling. Only a *vertical* ScrollFadeArea ancestor (a
  // card's own tag-scroll area, TagPoolBody's chip area) actually
  // conflicts with this vertical gesture — a horizontal one (the
  // carousel, SectionTabStrip) doesn't care about vertical movement and
  // shouldn't block it.
  useEffect(() => {
    const scrollable = scrollableRef.current;
    if (!scrollable) return;
    const COLLAPSE_THRESHOLD_PX = 20;
    const EXPAND_THRESHOLD_PX = 20;
    const AT_TOP_PX = 2; // sub-pixel tolerance, not a strict === 0

    function scrollFadeOrientationAt(target: EventTarget | null): "horizontal" | "vertical" | null {
      const el = target instanceof Element ? target : null;
      const value = el?.closest("[data-scroll-fade-orientation]")?.getAttribute("data-scroll-fade-orientation");
      return value === "horizontal" || value === "vertical" ? value : null;
    }

    // Accumulated, not read off a single event's own deltaY — a real
    // trackpad sends many small wheel events per gesture (low single/
    // double digits each), not one big one the way a notched mouse wheel
    // can; checking each event independently against a 20px threshold
    // meant no single trackpad tick ever crossed it, so a real, deliberate
    // scroll gesture composed of many small ticks could never trigger at
    // all (confirmed live: two dispatched 10px/15px events, clearly
    // totaling past threshold, individually did nothing). wheelResetTimer
    // approximates "the gesture ended" the same way this class of problem
    // usually has to on the web (no native wheel-gesture-end event) — a
    // short pause with no further wheel events resets the accumulator, so
    // a later, unrelated scroll doesn't inherit stale leftover delta from
    // a much earlier one.
    let wheelAccum = 0;
    let wheelResetTimer: number | null = null;
    function handleWheel(e: WheelEvent) {
      if (scrollFadeOrientationAt(e.target) === "vertical") return;
      wheelAccum += e.deltaY;
      if (wheelResetTimer !== null) window.clearTimeout(wheelResetTimer);
      wheelResetTimer = window.setTimeout(() => {
        wheelAccum = 0;
        wheelResetTimer = null;
      }, 150);
      if (!mastheadCollapsed && wheelAccum > COLLAPSE_THRESHOLD_PX) {
        e.preventDefault();
        setMastheadCollapsed(true);
        if (scrollable) scrollable.scrollTop = 0;
        wheelAccum = 0;
      } else if (mastheadCollapsed && scrollable && scrollable.scrollTop <= AT_TOP_PX && wheelAccum < -EXPAND_THRESHOLD_PX) {
        e.preventDefault();
        setMastheadCollapsed(false);
        wheelAccum = 0;
      }
    }

    // touchStartY resets to the CURRENT finger position (not null) once a
    // transition fires, rather than requiring a fresh touchstart — lets one
    // continuous drag stay responsive if the user keeps moving (e.g.
    // overshoots and reverses) instead of needing to lift and re-touch.
    let touchStartX: number | null = null;
    let touchStartY: number | null = null;
    let touchExempt = false;
    let touchAxis: "horizontal" | "vertical" | null = null;
    function handleTouchStart(e: TouchEvent) {
      touchExempt = scrollFadeOrientationAt(e.target) === "vertical";
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchAxis = null;
    }
    function handleTouchMove(e: TouchEvent) {
      if (touchExempt || touchStartX === null || touchStartY === null) return;
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      // Lock the gesture's axis on its FIRST touchmove and never re-decide
      // (a diagonal start would otherwise flip mid-swipe). This must happen
      // on the very first move, not after a pixel threshold: a touch
      // gesture's scrollability is decided by the browser on that first
      // touchmove — confirmed live (Chrome's own console) that preventing
      // even one sub-threshold move commits the WHOLE gesture away from
      // native scroll (it can't be handed back mid-gesture; further
      // preventDefault() calls, or the lack of them, are silently ignored
      // once "scrolling is in progress"). So a horizontal gesture has to go
      // un-prevented from move one or the results carousel can't pan at all.
      if (touchAxis === null) {
        touchAxis = Math.abs(x - touchStartX) > Math.abs(y - touchStartY) ? "horizontal" : "vertical";
      }
      // Horizontal gesture: leave it entirely to the browser so the results
      // carousel (a horizontal ScrollFadeArea) scrolls natively. This is the
      // fix for a horizontal swipe over a card's COVER (or any non-vertical-
      // scroll-fade area) doing nothing — the old unconditional preventDefault
      // below blocked the carousel's own native pan. Over a card's TAG area
      // this already worked: that's a vertical ScrollFadeArea, so touchExempt
      // bailed out above before ever reaching preventDefault.
      if (touchAxis === "horizontal") return;
      // Vertical gesture: the masthead collapse/expand direction — claim it
      // (preventDefault, same "prevent from move one" reasoning as the axis
      // lock above, now scoped to the vertical axis only) and drive the
      // transition off dy. Wheel doesn't need any of this — confirmed working
      // with a late, conditional preventDefault — because wheel scrolling has
      // no equivalent "commit on first event" handoff to the compositor.
      e.preventDefault();
      const dy = touchStartY - y; // positive = finger moved up = collapse direction
      if (!mastheadCollapsed && dy > COLLAPSE_THRESHOLD_PX) {
        setMastheadCollapsed(true);
        if (scrollable) scrollable.scrollTop = 0;
        touchStartY = y;
      } else if (mastheadCollapsed && scrollable && scrollable.scrollTop <= AT_TOP_PX && -dy > EXPAND_THRESHOLD_PX) {
        setMastheadCollapsed(false);
        touchStartY = y;
      }
    }

    scrollable.addEventListener("wheel", handleWheel, { passive: false });
    scrollable.addEventListener("touchstart", handleTouchStart, { passive: true });
    scrollable.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => {
      scrollable.removeEventListener("wheel", handleWheel);
      scrollable.removeEventListener("touchstart", handleTouchStart);
      scrollable.removeEventListener("touchmove", handleTouchMove);
      if (wheelResetTimer !== null) window.clearTimeout(wheelResetTimer);
    };
  }, [mastheadCollapsed]);

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
    document.documentElement.setAttribute("data-theme", theme);
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
      <div className="relative z-[var(--z-raised)] flex flex-col flex-1 min-h-0 max-w-[1280px] mx-auto w-full">
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
            pt-[space-2xl] stays conditional on mastheadCollapsed: the
            expanded masthead keeps its 24px breathing room, the collapsed
            one sits flush at the true top edge. */}
        <div
          ref={scrollableRef}
          className={`flex flex-col flex-1 min-h-0 ${mastheadCollapsed ? "" : "pt-[var(--space-2xl)]"}`}
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
            <ResultsHeader hasResults={k.hasResults} onClearRecs={k.clearRecs} onLevelChange={handleLevelChange} />

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
            />
          </section>
        </div>

        {/* Nested inside the same max-w-[1280px] z-raised column as
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

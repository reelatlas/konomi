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
  // reverse itself afterward. One-way, not a toggle-by-effect: set true in
  // handleRecommend below on success, never reset by clearRecs or anything
  // else — the only way back to expanded is the manual toggle (Masthead's
  // own onToggleCollapse, below).
  const [mastheadCollapsed, setMastheadCollapsed] = useState(false);
  // The shell root itself (below) — only needed so the effect right after
  // this can listen for scroll directly on it; nothing else reads this ref.
  const shellRef = useRef<HTMLDivElement>(null);
  // Requested directly: while expanded, a small scroll should collapse the
  // masthead instead of actually scrolling — "scroll a little" reads as
  // "I'm done with the banner, show me more," the same intent a
  // traditional collapsing-header pattern captures, just triggered instead
  // of continuously scroll-linked (this app's shell only has two discrete
  // masthead sizes, not a smooth scroll-scrubbed range between them).
  // Gated on !mastheadCollapsed so this never attaches at all once
  // collapsed — nothing to listen for anyway, since collapsed mode's own
  // overflow-hidden (KonomiApp's own root className, below) means the
  // shell can't scroll in the first place there.
  //
  // A plain reactive `scroll` listener (passive), not wheel/touchmove
  // interception the way MixerBar's own blockScrollThrough works — that
  // pattern exists there specifically to stop a gesture from ever reaching
  // the page at all, which matters when something else is listening for
  // that leak; here, the "cost" of letting a couple px of real scroll
  // happen before reacting is just a same-frame snap back to 0, masked by
  // the collapse transition itself (280ms, Masthead.tsx's own `layout`
  // animation) starting immediately after. Simpler and lower-risk than
  // hooking wheel/touch directly, given this file's own history of real
  // bugs in exactly that territory — only worth reaching for that if this
  // ever visibly flashes on a real device, not preemptively.
  //
  // THRESHOLD_PX (4): a small dead-zone, not scrollTop > 0 — absorbs
  // sub-pixel/rubber-band scroll noise (iOS's own overscroll bounce can
  // report a few px of scrollTop with no real user scroll intent behind
  // it) without meaningfully delaying a genuine scroll's own reaction.
  useEffect(() => {
    if (mastheadCollapsed) return;
    const shell = shellRef.current;
    if (!shell) return;
    const THRESHOLD_PX = 4;
    function handleScroll() {
      if (shell && shell.scrollTop > THRESHOLD_PX) {
        setMastheadCollapsed(true);
        shell.scrollTop = 0;
      }
    }
    shell.addEventListener("scroll", handleScroll, { passive: true });
    return () => shell.removeEventListener("scroll", handleScroll);
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
    // at all anymore, only the results section's own carousel (inside it,
    // horizontally) does. See DESIGN_SYSTEM.md for the full reasoning
    // (traced the MixerBar animation machinery back to "the page itself
    // scrolls" being the root condition forcing it, and removed that
    // condition instead of patching further on top of it).
    //
    // pb-[space-2xl] here is still the same uniform-frame gap this app has
    // always used below the mixer — unchanged in value, just now padding
    // on a flex container instead of a plain block div, which flexbox
    // already accounts for automatically when handing out the remaining
    // 100svh to this row's children.
    //
    // pt is conditional on mastheadCollapsed, not the same flat pt-2xl in
    // both states: the expanded masthead keeps its 24px breathing room
    // (reads as a proper banner), but the collapsed masthead sits flush
    // against the true top edge with zero gap — matching the old
    // scroll-triggered condensed bar's own top-0 flush positioning (see
    // Masthead.tsx's own top comment), not the expanded state's framing.
    //
    // overflow is ALSO conditional on mastheadCollapsed now, not always
    // hidden — see this div's own style comment below for why: expanding
    // the masthead back open (the manual toggle) while results are still
    // present shrinks the results section's own flex-1 share, and once
    // ResultCard's own clamp() floor (322px) is reached, it can't shrink
    // any further — something has to give, and here that's letting this
    // shell scroll instead of forcing cards below their legible floor.
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
      // overflow-hidden while collapsed: this div is exactly h-[100svh],
      // and collapsed-mode content (slim masthead + results + mixbar) must
      // never exceed that, by construction (results is the one flexible
      // region, flex-1 min-h-0 below) — a hard backstop against ever
      // silently overflowing into a second, accidental scroll root, not
      // something expected to actually clip real content in normal use.
      // Only relaxed to overflow-y-auto while expanded (see this element's
      // own top comment) — h-[100svh] stays fixed either way (not
      // min-h-[100svh]); auto just lets genuine excess content scroll
      // *within* that fixed box instead of forcing something else to
      // shrink past its own floor. Deliberately NOT unconditional
      // overflow-y-auto: collapsed is the default, most-common state, and
      // MixerBar's own touch-handling was verified against a hard
      // overflow:hidden here — keeping that exact guarantee for the common
      // case rather than leaving even a should-be-inert auto-with-nothing-
      // to-scroll in place for it.
      //
      // No background, no scrollbar-gutter, no relative here — all three
      // live on html (globals.css); unaffected by this rewrite, since
      // html was always the real place a full-viewport background needed
      // to live regardless of whether it also happened to be the scroll
      // root.
      className={`h-[100svh] flex flex-col overflow-x-clip px-[var(--space-2xl)] pb-[var(--space-2xl)] font-body text-[var(--ink)] ${mastheadCollapsed ? "overflow-hidden" : "overflow-y-auto pt-[var(--space-2xl)]"}`}
      ref={shellRef}
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
        <Masthead
          theme={k.theme}
          onThemeChange={k.setTheme}
          collapsed={mastheadCollapsed}
          onToggleCollapsed={() => setMastheadCollapsed((c) => !c)}
        />

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

        {/* Nested inside the same max-w-[1280px] z-raised column as
            Masthead/the results section above, not a page-level sibling —
            now that MixerBar is normal flow, not position:fixed, it needs
            the same shared content column (left/right framing) the header
            and cards already use, or its edges would drift from theirs the
            moment the page's own centered max-w box stops filling the
            viewport (see MixerBar.tsx's own top comment for how this was
            confirmed not to shift any of its internal @container
            breakpoints). Last child — bottom of the group, in document
            order matching its visual position. Unchanged by the app-shell
            rewrite (Phase 1 of it) — still exactly the same component,
            still sticky/marginTop/pin+clip-path internally; it just now
            sits in a flex column instead of plain block flow, and its own
            sticky positioning has nothing to stick to anymore since this
            whole shell never scrolls (a no-op, not a bug — see
            DESIGN_SYSTEM.md). */}
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

"use client";

import { useEffect, useRef, useState } from "react";
import { visiblePoolTagNames } from "@/lib/konomi/tagPool";
import { isThemeKey, THEME_STORAGE_KEY } from "@/lib/konomi/themes";
import type { LevelKey, Series, TagInfo } from "@/lib/konomi/types";
import { useKonomi } from "@/lib/konomi/useKonomi";
import { AnimationDebugPanel } from "./AnimationDebugPanel";
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
    }
  }

  return (
    // pt-[space-2xl] above the masthead and pb-[space-2xl] below the mixer
    // are the same token deliberately — the uniform outer-frame principle
    // for the header+card+mixer group (see globals.css's
    // --result-card-height comment): whatever gap the mixer used to keep
    // from the viewport bottom on its own (back when it was position:fixed
    // with its own px/pb-[space-2xl]) is now this root's job instead, once
    // MixerBar moved into normal flow as the max-w-[1280px] column's own
    // last child, below. A flat pb-2xl, not a calc tied to the mixer's own
    // height (the old MIXER_BAR_SPACER, removed) — nothing to "clear"
    // underneath a normal-flow element the way a fixed one needed.
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
      // overflow-x-clip, not overflow-x-hidden: hidden on one axis with no
      // overflow-y set triggers a real, legacy CSS spec rule — the other
      // axis's *used* value becomes auto instead of staying visible — which
      // silently turned this div into its own accidental nested vertical
      // scroll container (confirmed live: a real wheel scroll moved THIS
      // div's own scrollTop, not window.scrollY), independent of and in
      // addition to html/body's own document-level scrolling. clip doesn't
      // pair with that legacy rule, so overflow-y correctly stays visible
      // here and html/body go back to being the one real scroll root.
      //
      // No background, no scrollbar-gutter, no relative here anymore —
      // all three moved to html (globals.css). This div's own
      // scrollHeight briefly matched its content, but once overflow-y is
      // visible (immediately above) it's not an actual scroll container at
      // all, so a background confined to its own box could fall short of
      // the *real* scroll root's full extent (confirmed live: a gap of
      // page-background-colored nothing at the bottom once content grew
      // past one viewport), and scrollbar-gutter here would be a silent
      // no-op — that property only does anything on an element that's
      // actually a scroll container, which this one no longer is. relative
      // was only ever the containing block for the halftone overlay
      // (removed below, folded into html's own background-image instead).
      //
      // No min-h-screen either, not anymore — confirmed live as a real
      // bug: whenever natural content (masthead+gaps+card+mixer) was
      // shorter than one viewport, forcing this div to at least 100vh
      // left the leftover space stranded *after* the mixer (block flow
      // puts unused min-height at the end, not distributed), stacking
      // with pb-2xl to make the bottom gap read as much bigger than the
      // top's plain pt-2xl — measured 42.6px vs 24px at one test size,
      // dropping to exactly 24px (matching pt-2xl) with min-height
      // removed. Safe to drop now for the same reason removing it doesn't
      // risk a short-looking page: the background/halftone moved to html
      // (see above) specifically so full-viewport coverage no longer
      // depends on this div's own height at all.
      className="overflow-x-clip px-[var(--space-2xl)] pt-[var(--space-2xl)] pb-[var(--space-2xl)] font-body text-[var(--ink)]"
    >
      {/* Temporary tuning aid — see AnimationDebugPanel.tsx's own top
          comment. Rendered here (this root) rather than nested inside any
          specific control, so it's reachable regardless of which one is
          being tuned; `fixed` positioning means where it sits in the tree
          doesn't affect layout either way. */}
      <AnimationDebugPanel />

      <div className="relative z-[var(--z-raised)] max-w-[1280px] mx-auto">
        <Masthead theme={k.theme} onThemeChange={k.setTheme} />

        {/* Results is now the persistent main surface, not a tab — always
            rendered, no hidden-toggle wrapper needed since there's nothing
            left to toggle against.

            mb-[var(--space-2xl)], not the space-3xl this used before: this
            margin is what actually produces the card→mixer gap now that
            MixerBar is this section's very next normal-flow sibling (Step
            1's version of this fix instead subtracted the old 32px value
            out of a separate spacer calc, deliberately leaving this margin
            itself untouched — out of scope for that narrower change, but
            Step 2's uniform-frame principle makes the gaps themselves the
            point: header→cards and cards→mixer read as the same 24px, not
            independently sized). Adjacent block margins between this
            section and MixerBar's own root div would otherwise collapse to
            whichever is larger, not add — so leaving this at space-3xl
            while relying on some margin on MixerBar's side to shrink the
            gap wouldn't have worked; this is the one that has to change. */}
        <section className="mb-[var(--space-2xl)]">
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
            order matching its visual position. */}
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

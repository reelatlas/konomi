"use client";

import { useEffect, useRef, useState } from "react";
import type { LevelKey } from "@/lib/konomi/types";
import { ActionButton } from "./ActionButton";
import { CloseIcon, ExistingIcon, LockClosedIcon, LockOpenIcon, NewIcon, SearchIcon, TagPoolIcon } from "./icons";
import { IconButton } from "./IconButton";
import { ResultsFilterButton } from "./ResultsFilterButton";
import { useTagPoolNav } from "./tagPoolNavContext";

interface ResultsHeaderProps {
  hasResults: boolean;
  // The tag pool / edit panel's open state + its open/close handlers
  // (KonomiApp's editMode) — the header is the panel's PRIMARY invoker as
  // of search v2: clicking into the search field or the Tag Pool button
  // opens it ("any click into the global search or tag pool button will
  // trigger the panel"), and the Tag Pool button toggles it closed again.
  editMode: boolean;
  onOpenEditMode: () => void;
  onCloseEditMode: () => void;
  // Left-aligned result-set metadata, three icon+count readouts (results state
  // only): LOCKED (how many current results are locked), NEW (fresh this batch),
  // EXISTING (were in the previous batch and came back). The three partition the
  // result set: locked + new + existing === total. lockedCount also drives the
  // unlock-all affordance (glow on hover, click clears all via onUnlockAll →
  // UNLOCK_ALL). Counts are computed in KonomiApp from results/locked/
  // prevResultTitles.
  lockedCount: number;
  newCount: number;
  existingCount: number;
  onUnlockAll: () => void;
  onClearRecs: () => void;
  // True when EVERY current result is locked (any count — 1/1, 3/3, 5/5).
  // Clear ✕ disables then: clearRecs keeps locked cards, so with all locked
  // it changes nothing on screen — yet it clears the mixer error, silently
  // re-enabling RECOMMEND as if something changed (reported). Unlocking
  // (this row's own unlock-all, or a card's lock icon) is the real way
  // forward, and doing either re-enables Clear ✕ immediately.
  clearDisabled: boolean;
  onLevelChange: (level: LevelKey) => void;
}

// How long the "unlocked" confirmation shows after clicking unlock-all before
// the readout settles back to the (now 0) locked count. A brief beat, matching
// the app's other quick state-change feedbacks.
const UNLOCKED_FEEDBACK_MS = 1100;

// The persistent global header row (search v2). BOTH states now carry real
// content: the global search field + the Tag Pool button live here always
// (top-left — the panel's single stable invocation point); the results
// state adds the Filter popover to their right, and the result-set
// metadata + Clear ✕ on the row's right end. In the empty state the Tag
// Density/Sort filters still live inside the empty-state box itself
// (user-ruled "for now"), so the right half is simply empty there.
//
// The row never collapses (min-h-[30px] + mb-[space-lg] in both states) —
// v1 reserved the height while gating ALL content on hasResults, purely so
// the empty box could paint over the ghost row and match the results
// footprint; now that the row is real chrome the empty box sits BELOW it
// like the cards do, the paint-over trick is gone (see
// RecommendationsBody), and the footprint equality is trivial: same row,
// same remaining space, both states.
export function ResultsHeader({ hasResults, editMode, onOpenEditMode, onCloseEditMode, lockedCount, newCount, existingCount, onUnlockAll, onClearRecs, clearDisabled, onLevelChange }: ResultsHeaderProps) {
  const nav = useTagPoolNav();
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Browse mode = the panel is open with no live query — the Tag Pool
  // button shows its active (filled) state. The moment the user types, the
  // field is what reads active (ink border) and the button drops back to
  // its resting outline (user-ruled mode model). Immediate query, not the
  // deferred copy — mode chrome must not lag the keystroke.
  const browseActive = editMode && nav.query.trim().length === 0;
  // Transient "unlocked" confirmation after a click: the locked readout flips to
  // an open lock + the word "unlocked" for a beat, then settles back to the
  // closed lock + its (now 0) count. Timer ref so a rapid re-click resets it.
  const [justUnlocked, setJustUnlocked] = useState(false);
  const unlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (unlockTimer.current) clearTimeout(unlockTimer.current); }, []);
  const handleUnlockAll = () => {
    onUnlockAll();
    setJustUnlocked(true);
    if (unlockTimer.current) clearTimeout(unlockTimer.current);
    unlockTimer.current = setTimeout(() => setJustUnlocked(false), UNLOCKED_FEEDBACK_MS);
  };
  // The locked readout is interactive (glow + click-to-unlock) only when there
  // is actually something locked; at 0 it's a plain static indicator.
  const lockInteractive = lockedCount > 0;
  // Shared look for the three metadata readouts (mono, small, lowercase — the
  // uppercase treatment was dropped per request; tabular-nums so counts don't
  // jitter width).
  // Bumped up a size from the first pass (requested): text-xs (was 2xs) and an
  // 18px icon box (was 15). Still well under the row's 30px min-height, so the
  // empty-state footprint match is untouched.
  // transition-colors so a readout eases between passive/active — most visibly
  // the unlock flash below, which holds the ACTIVE colour then eases back to
  // passive once it settles to locked 0 (simulating "active → now unlocked →
  // passive again").
  const metaBase = "inline-flex items-center gap-[var(--space-xs)] font-mono text-[length:var(--text-xs)] tracking-[var(--tracking-lg)] lowercase shrink-0 transition-colors duration-500";
  const iconSize = "w-[18px] h-[18px]";
  const iconBox = `inline-flex items-center justify-center ${iconSize} shrink-0`;
  // Unified colour rule for ALL THREE readouts (requested): a 0/empty count uses
  // the app's INACTIVE-tab colour (--muted), a non-zero count the SELECTED-FILTER
  // colour (--primary — the bg the Level/Sort segmented controls use for their
  // chosen option, LevelSelector.tsx). Each readout colours off its OWN count.
  // The locked readout follows the same rule; its hover glow (globals.css) is a
  // separate accent layered on top when interactive.
  const metaColor = (n: number) => (n > 0 ? "text-[var(--primary)]" : "text-[var(--muted)]");
  return (
    // Always flex-row, never flex-col — this row must never wrap to two
    // lines: wrapping would push the card row's own spawn position down,
    // breaking the header+card+mixer "fits one viewport" group (see
    // globals.css's --result-card-height comment) at whatever breakpoint
    // it happened to wrap. The old flex-col/min-[417px]:flex-row switch
    // (this row's previous behavior) is gone entirely, not just retuned.
    //
    // Staying single-line at narrow widths instead relies on dropping the
    // title's own JP companion span (see TitleWithSubtitle's subtitleClassName
    // below) rather than wrapping — min-w-0 lets this group actually
    // shrink to make room for it before that breakpoint, and stops the
    // row itself from ever being forced wider than available space.
    //
    // min-h-[30px]: Clear ✕'s and the Filter button's own shared, measured
    // rendered height (see ActionButton.tsx's sm size) — pins the row so it
    // doesn't jitter as those buttons mount (the search input is 24px and
    // the sm buttons 30px, so the tallest resting content matches it).
    // mb-[var(--space-lg)]: 12px, half the app's usual 24px frame gutter — a
    // deliberate exception here so the header controls read as belonging TO
    // the results row directly below them, rather than as a separate band.
    // justify-between: search/Tag Pool/Filter at the LEFT (search + Tag
    // Pool in BOTH states — this is the persistent global header), the
    // result-set metadata + Clear ✕ at the right, results state only.
    <div className="flex flex-row items-center justify-between min-h-[30px] gap-x-[var(--space-lg)] mb-[var(--space-lg)]">
      {/* LEFT: the panel's invocation cluster. data-global-search: the
          allowlist marker MixerBar's click-outside-closes-edit-mode
          listener checks via closest() (same mechanism as
          data-clear-results / data-results-filter) — clicking the search
          field or Tag Pool button must never be treated as an outside
          click dismissing the very panel they control.
          relative z-[var(--z-raised)]: same hit-test fix as the metadata
          and Clear ✕ (the results carousel's invisible pt-40px flip-bulge
          padding overlaps this row's bottom; see those comments). */}
      <div data-global-search className="relative z-[var(--z-raised)] flex items-center gap-[var(--space-lg)] min-w-0">
        {/* Global search — THE one search (v2: moved out of the pool
            panel; it steers the pool nav via TagPoolNavProvider). Always
            visible, always live. Focusing/clicking it opens the panel;
            typing switches browse mode to search mode. Box recipe
            unchanged from v1 (24px, mono, surface bg, thin border) — the
            border/icon read ink while a query is live (the field is "the
            active one" in search mode), muted at rest. */}
        <div className="flex items-center shrink-0">
          <IconButton
            size="sm"
            border="none"
            backgroundColor="transparent"
            title="Search tags"
            aria-label="Search all tags"
            onClick={() => {
              searchInputRef.current?.focus();
              if (!editMode) onOpenEditMode();
            }}
          >
            <SearchIcon className={nav.query ? "text-[var(--ink)]" : "text-[var(--muted)]"} />
          </IconButton>
          <input
            ref={searchInputRef}
            type="text"
            value={nav.query}
            onChange={(e) => {
              if (!editMode) onOpenEditMode();
              nav.handleQueryChange(e.target.value);
            }}
            onKeyDown={nav.handleSearchKeyDown}
            // onClick, deliberately NOT onFocus: MixerBar restores focus to
            // the previously-focused element when the panel closes, so an
            // onFocus-opens rule turns every outside-click close into an
            // immediate programmatic re-open (confirmed live — the panel
            // became unclosable). Click + typing are the USER's open
            // signals; programmatic focus arrivals stay inert.
            onClick={() => {
              if (!editMode) onOpenEditMode();
            }}
            aria-label="Search all tag sections"
            placeholder="search all tags…"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            className={[
              "h-[24px] w-[min(200px,40vw)] px-[var(--space-md)] font-mono text-[length:var(--text-sm)]",
              "bg-[var(--surface)] text-[var(--ink)] placeholder:text-[var(--subtext)] outline-none",
              "border-[length:var(--border-thin)]",
              nav.query ? "border-[var(--ink)]" : "border-[var(--muted)]",
            ].join(" ")}
          />
        </div>
        {/* Tag Pool — the panel's button invoker, mirroring MixerBar's own
            (which stays through Phase 1/2 and leaves in Phase 3). Toggle:
            open ↔ close. Active (filled) exactly while in BROWSE mode —
            panel open, no query (see browseActive above). Two sibling
            forms below 480px, the same idiom Clear ✕ uses in this row. */}
        <div className="shrink-0">
          <ActionButton
            variant={browseActive ? "filled" : "outline"}
            size="sm"
            onClick={editMode ? onCloseEditMode : onOpenEditMode}
            aria-label={editMode ? "Close tag pool" : "Open tag pool"}
            className="hidden min-[480px]:inline-flex"
          >
            <span className="inline-flex items-center gap-[var(--space-sm)]">
              Tag Pool
              <TagPoolIcon className="text-[var(--ink)]" />
            </span>
          </ActionButton>
          <IconButton
            size="sm"
            border="base"
            backgroundColor={browseActive ? "var(--fill)" : "transparent"}
            title={editMode ? "Close tag pool" : "Open tag pool"}
            aria-label={editMode ? "Close tag pool" : "Open tag pool"}
            onClick={editMode ? onCloseEditMode : onOpenEditMode}
            display="flex min-[480px]:hidden"
          >
            <TagPoolIcon className="text-[var(--ink)]" />
          </IconButton>
        </div>
        {/* Filter popover — results state only, to the Tag Pool button's
            right (user-ruled position); in the empty state the filters
            live inside the empty-state box instead. */}
        {hasResults && <ResultsFilterButton onLevelChange={onLevelChange} />}
      </div>
      {/* RIGHT: result-set metadata + Clear ✕, results state only. The
          metadata (LOCKED · EXISTING · NEW readouts) sits to the LEFT of
          Clear ✕ (user-ruled v2 position — it moved over from the row's
          left end when search took that spot). locked + new + existing
          === total results; locked owns the unlock-all interaction. */}
      {/* relative z-[var(--z-raised)] on the metadata: WITHOUT this, real
          clicks (and hover) on it never landed — the results carousel's
          own invisible pt/pb-40px flip-bulge padding (RecommendationsBody)
          geometrically overlaps the bottom of this header row, and its
          ScrollFadeArea wrappers are pointer-events-auto, so they won the
          hit-test. Same fix, same reason, as Clear ✕'s own z-raised below.
          Reported live as "clicking the lock does nothing." */}
      {hasResults && (
        <div className="flex items-center gap-[var(--space-lg)] flex-wrap justify-end">
          {/* gap-lg (12px) between readouts: the divider lines were removed
              (requested); this gap keeps roughly the SAME between-item spacing
              the gap-sm + 1px divider + gap-sm used to occupy (~13px), while
              staying clearly wider than each readout's own internal gap-xs so
              the three still read as separate groups. */}
          <div className="relative z-[var(--z-raised)] flex items-center gap-[var(--space-lg)] min-w-0">
          {/* LOCKED — the unlock-all affordance. Interactive only when > 0:
              .glow-host enables the shared hover/focus glow (globals.css, the
              SAME --subtext bloom the MixerBar grip uses), and the click clears
              every lock, then flashes "unlocked" (open lock + word) for a beat
              before settling to a closed lock + 0. Colour follows metaColor
              (--primary when held, --muted at 0). */}
          <button
            type="button"
            onClick={lockInteractive ? handleUnlockAll : undefined}
            title={lockInteractive ? "unlock all" : undefined}
            aria-label={
              lockInteractive
                ? `unlock all ${lockedCount} locked ${lockedCount === 1 ? "card" : "cards"}`
                : `${lockedCount} locked`
            }
            className={`${metaBase} ${justUnlocked ? "text-[var(--primary)]" : metaColor(lockedCount)} ${lockInteractive ? "glow-host cursor-pointer" : "cursor-default"}`}
          >
            {/* During the "unlocked" flash the open lock + word hold the ACTIVE
                colour (--primary, same as a non-zero count), set on the button so
                both the icon (currentColor) and text inherit it; then metaBase's
                transition-colors eases it back to passive (--muted) once
                justUnlocked clears and it settles to locked 0 — reading as
                "active → just unlocked → passive again". */}
            <span className={iconBox}>
              {justUnlocked ? <LockOpenIcon className={`glow-icon ${iconSize}`} /> : <LockClosedIcon className={`glow-icon ${iconSize}`} />}
            </span>
            {justUnlocked ? <span>unlocked</span> : <span className="tabular-nums">{lockedCount}</span>}
          </button>
          {/* EXISTING — results re-appearing from the previous batch (recycle
              glyph). Now BEFORE new (order swapped, requested) and icon+count
              ONLY — its "existing" text label was removed for now (kept just on
              new). title still carries the word for hover/a11y. */}
          <span className={`${metaBase} ${metaColor(existingCount)}`} title="existing">
            <span className={iconBox}>
              <ExistingIcon className={iconSize} />
            </span>
            <span className="tabular-nums">{existingCount}</span>
          </span>
          {/* NEW — fresh picks this batch (not in the previous batch). Keeps its
              "new" text label in front of the sparkles icon + count. */}
          <span className={`${metaBase} ${metaColor(newCount)}`} title="new">
            <span>new</span>
            <span className={iconBox}>
              <NewIcon className={iconSize} />
            </span>
            <span className="tabular-nums">{newCount}</span>
          </span>
          </div>
          {
            // data-clear-results + contents: lets MixerBar's click-outside-
          // closes-edit-mode listener allowlist this button via a single
          // closest() check (see that file's own comment) without this
          // wrapper affecting layout — display:contents removes the span
          // itself from the flex layout, so ActionButton's own rendered
          // button participates in the row exactly as if this wrapper
          // weren't there. ActionButton itself has no prop for arbitrary
          // data-* passthrough (a narrow, intentional interface — see its
          // own comment), so this wraps it instead of extending it.
          //
          // relative z-[var(--z-raised)] on the button itself: the results
          // carousel's own ScrollFadeArea wrappers (RecommendationsBody.tsx)
          // carry real, invisible pt/pb-40px flip-bulge padding that makes
          // them geometrically overlap this button's own bottom ~24px
          // (confirmed live via getBoundingClientRect on both) — previously
          // papered over by making those wrappers pointer-events-none, which
          // also — an unrelated side effect nobody had reason to check at
          // the time — disqualified the carousel's real overflow-x-auto
          // viewport from native touch-scroll-gesture-chaining, breaking
          // mobile carousel swipe whenever a card's tag area wasn't itself
          // an active (overflowing) scroll container. Fixed at the source
          // instead: this button now explicitly wins the hit-test at that
          // overlap by paint order (z-index) rather than by disqualifying
          // the carousel's wrappers from hit-testing altogether — so the
          // carousel's own pointer-events can go back to the default auto
          // (see RecommendationsBody.tsx) and still receive the gesture.
          <span data-clear-results className="contents">
            {/* shrink-0 grow-0: reported live as an intermittent, mobile-
                only bug — this button occasionally stretched horizontally
                toward the results card's own width instead of staying a
                tight fit around "Clear ✕". Not reproducible in this
                project's own headless-Chromium testing (fresh mount,
                repeated RECOMMEND clicks, several widths, all stable at a
                fixed content width) — consistent with a real-device-only
                WebKit quirk, the same class of issue as this app's own
                documented iOS dashed-border clipping (see
                DESIGN_SYSTEM.md). display:contents on the wrapping span
                (above) promotes this button to be a direct flex item of
                the row it sits in; Safari has known bugs where a
                contents-promoted child doesn't reliably keep the spec's
                default flex-grow:0/flex-shrink:1 sizing. Pinning both
                explicitly is a defensive fix for that class of bug, not a
                guess at a different root cause — confirm on-device that
                this actually resolves it, since it couldn't be verified
                by direct reproduction here. */}
            {/* Two full sibling forms below 480px, not one button with
                internal conditional content — same idiom LevelSelector/
                SortSelect already use for their own collapsed form,
                needed here because the collapsed state isn't just "hide
                the text," it's a differently-shaped button: IconButton's
                own fixed 30×30 size="sm" box (border-base, no shadow —
                same treatment as the ActionButton form's own shadowless
                inverted look), matching the Filter button
                (ResultsFilterButton) it now sits directly beside,
                requested directly so the two read as the same size.
                ActionButton's padding-based sizing has no equivalent fixed
                box, so swapping its own content for just an icon doesn't
                get there on its own. */}
            {/* clearDisabled (see the prop's own comment): ActionButton has
                real native disabled handling; IconButton deliberately doesn't
                (see its visuallyDisabled comment), so the icon form pairs
                visuallyDisabled with an undefined onClick instead. */}
            <ActionButton
              variant="inverted"
              size="sm"
              disabled={clearDisabled}
              onClick={onClearRecs}
              aria-label="Clear results"
              className="hidden min-[480px]:inline-flex relative z-[var(--z-raised)] shrink-0 grow-0"
            >
              Clear ✕
            </ActionButton>
            <IconButton
              size="sm"
              border="base"
              // Muted border when disabled, matching the ActionButton form's
              // own disabled border (see ActionButton) and the Filter
              // button's inactive border colour beside it.
              borderColor={clearDisabled ? "var(--muted)" : undefined}
              backgroundColor="var(--ink)"
              textColor="var(--bg)"
              title="Clear results"
              aria-label="Clear results"
              visuallyDisabled={clearDisabled}
              onClick={clearDisabled ? undefined : onClearRecs}
              display="flex min-[480px]:hidden"
              className="relative z-[var(--z-raised)] shrink-0 grow-0"
            >
              <CloseIcon />
            </IconButton>
          </span>
          }
        </div>
      )}
    </div>
  );
}

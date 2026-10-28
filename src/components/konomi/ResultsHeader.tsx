"use client";

import { useEffect, useRef, useState } from "react";
import type { LevelKey } from "@/lib/konomi/types";
import { ActionButton } from "./ActionButton";
import { CloseIcon, ExistingIcon, LockClosedIcon, LockOpenIcon, NewIcon, TagPoolIcon } from "./icons";
import { IconButton } from "./IconButton";
import { ResultsFilterButton } from "./ResultsFilterButton";
import { SearchField } from "./SearchField";
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
// state adds the result-set metadata + Clear ✕ on the row's right end;
// the Filter popover sits right of Tag Pool in BOTH states (user-ruled
// 2026-07-27 — the empty-state box's inline filters moved up here), so
// only the right half differs between states.
//
// The row never collapses (min-h at the control tier + mb-[space-lg]) —
// v1 reserved the height while gating ALL content on hasResults, purely so
// the empty box could paint over the ghost row and match the results
// footprint; now that the row is real chrome the empty box sits BELOW it
// like the cards do, the paint-over trick is gone (see
// RecommendationsBody), and the footprint equality is trivial: same row,
// same remaining space, both states.
// HEADER RESPONSIVE LADDER (bisected 2026-07-28, results state with all
// three readouts lit — the worst case; empty state fits far narrower and
// shares the same rungs for consistency, user-ruled all-at-once):
//   - min-[754px]  Full form everywhere. (Needs 752 viewport; before this
//                  ladder the metadata silently WRAPPED to a second row —
//                  70px tall — everywhere between ~480 and ~750.)
//   - max-[754px]  RUNG H1: the "new" readout drops its word — icons+
//                  counts only. (HC1 needs 727.)
//   - max-[729px]  RUNG H2: Tag Pool, Filters, and Clear ALL drop to
//                  their icon twins at the same threshold (user-ruled
//                  consistency — never a mixed row). The filter popover's
//                  anchor-to-header-row switch rides the SAME rung (kept
//                  in sync by ruling). (HC2 needs 527 — the search cap's
//                  200px regime.)
//   - max-[529px]  RUNG H3: the resting search collapses to a magnify
//                  icon button (SearchField's own max-[529px] overrides);
//                  clicking it focuses + expands to the normal engaged
//                  form, and WHILE ENGAGED below this rung Tag Pool +
//                  Filters hide to give it room (interim ruling). (HC3
//                  needs 319 — fits to ~367; below that the metadata's
//                  flex-wrap remains the last-resort fallback, as ever.)
// All literals are viewport queries (v4 strict: max-[N] = <N, min/max
// same-N pairs are exact complements). Deliberately NOT @container on
// this row: container-type implies contain:layout, which makes the row a
// stacking context — and this row must NOT be one (see the LEFT cluster
// comment: the filter popover's z-popover has to resolve against the
// column so it layers above the pool overlay; trapping it was a real P2
// regression). Below the column cap, row width = viewport − 48 anyway,
// so viewport rungs are exact here.
export function ResultsHeader({ hasResults, editMode, onOpenEditMode, onCloseEditMode, lockedCount, newCount, existingCount, onUnlockAll, onClearRecs, clearDisabled, onLevelChange }: ResultsHeaderProps) {
  const nav = useTagPoolNav();
  // Search engaged (focused or live query), reported by SearchField —
  // drives the below-H3 hide of Tag Pool/Filters while search is
  // expanded (see the ladder comment above).
  const [searchEngaged, setSearchEngaged] = useState(false);
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
  const metaColor = (n: number) => (n > 0 ? "text-[var(--primary)]" : "text-[var(--subtext)]");
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
    // min-h at --control-h-md: the header is a CONTROL-TIER row (sizing
    // unification, SIZING_AUDIT.md §6 — the app's primary entry point gets
    // the same 44 tier as the mixbar it now sits opposite; tier follows
    // the row). Pins the row so it doesn't jitter as buttons mount.
    // mb-[var(--space-lg)]: 12px, half the app's usual 24px frame gutter — a
    // deliberate exception here so the header controls read as belonging TO
    // the results row directly below them, rather than as a separate band.
    // justify-between: search/Tag Pool/Filter at the LEFT (search + Tag
    // Pool in BOTH states — this is the persistent global header), the
    // result-set metadata + Clear ✕ at the right, results state only.
    // relative (no z — deliberately not a stacking context): the Filter
    // popover's containing block below RUNG H2 (729), where its own wrapper goes
    // static and the dialog drops full-left under this row instead of
    // anchoring to its mid-row trigger (see ResultsFilterButton).
    <div className="relative flex flex-row items-center justify-between min-h-[var(--control-h-md)] gap-x-[var(--space-lg)] mb-[var(--space-lg)]">
      {/* LEFT cluster. The OUTER div carries no z-index on purpose: a
          z-indexed ancestor is a stacking context, and the Filter
          popover inside this row must be free to use its own
          z-[var(--z-popover)] against the column context so it layers
          ABOVE the open tag pool overlay (z-overlay) — users adjust
          Tag Density/Sort and watch the open pool change live
          (user-ruled, matching the v1 mixbar-panel behavior; trapping
          it under a z-raised wrapper was a real P2 regression).
          The INNER div is the search+Tag Pool invocation cluster:
          data-global-search is the click-outside allowlist marker
          (clicking these must never dismiss the panel they control),
          and it carries the relative z-[var(--z-raised)] hit-test fix
          (the results carousel's invisible pt-40px flip-bulge padding
          overlaps this row's bottom; see the metadata/Clear comments) —
          scoped HERE, where no popover needs to escape it. */}
      <div className="flex items-center gap-[var(--space-lg)] min-w-0">
        <div data-global-search className="relative z-[var(--z-raised)] flex items-center gap-[var(--space-lg)] min-w-0">
        {/* Global search — extracted to its own contained component
            (SearchField, user-ruled: search is its own kind of thing, not
            a button variant); all container/engagement logic lives there. */}
        <SearchField editMode={editMode} onOpenEditMode={onOpenEditMode} onEngagedChange={setSearchEngaged} />
        {/* Tag Pool — the panel's button invoker, mirroring MixerBar's own
            (which stays through Phase 1/2 and leaves in Phase 3). Toggle:
            open ↔ close. Active (filled) exactly while in BROWSE mode —
            panel open, no query (see browseActive above). Two sibling
            forms below RUNG H2 (729 — the shared icon-collapse rung, see the
            ladder comment above), the same idiom Clear ✕ uses in this row. */}
        <div className={`shrink-0 ${searchEngaged ? "max-[529px]:hidden" : ""}`}>
          {/* Wrapper div carries the responsive display: ActionButton md
              bakes inline-flex unconditionally, so a display utility on
              its own className would be the undefined-cascade-order trap
              (see IconButton's display prop comment). */}
          <div className="hidden min-[729px]:block">
          <ActionButton
            variant="header"
            engaged={browseActive}
            onClick={editMode ? onCloseEditMode : onOpenEditMode}
            aria-label={editMode ? "Close tag pool" : "Open tag pool"}
          >
            {/* Icon inherits the variant's state color (currentColor) —
                muted at rest, surface when engaged; glow-icon rides the
                variant's glow-host hover. */}
            <span className="inline-flex items-center gap-[var(--space-sm)]">
              Tag Pool
              <TagPoolIcon className="glow-icon w-[20px] h-[20px]" />
            </span>
          </ActionButton>
          </div>
          {/* Icon twin: same header treatment via IconButton's color
              props (the Filter button's exact recipe). */}
          <IconButton
            size="md"
            border="base"
            borderColor={browseActive ? "var(--primary)" : "transparent"}
            backgroundColor={browseActive ? "var(--primary)" : "transparent"}
            title={editMode ? "Close tag pool" : "Open tag pool"}
            aria-label={editMode ? "Close tag pool" : "Open tag pool"}
            onClick={editMode ? onCloseEditMode : onOpenEditMode}
            display="flex min-[729px]:hidden"
            className="glow-host"
          >
            <TagPoolIcon className={`glow-icon w-[20px] h-[20px] ${browseActive ? "text-[var(--surface)]" : "text-[var(--muted)]"}`} />
          </IconButton>
        </div>
        </div>
        {/* Filter popover — BOTH states now (user-ruled 2026-07-27: the
            left cluster reads identical empty or with results; the
            empty-state box's own inline filters were removed in the same
            ruling). OUTSIDE the data-global-search z-raised cluster (see
            the outer div's comment): it allowlists itself via
            data-results-filter, and it must not be trapped in a stacking
            context below the pool overlay — its own wrapper handles both
            z states (raised closed, popover open). */}
        <div className={searchEngaged ? "max-[529px]:hidden" : undefined}>
          <ResultsFilterButton onLevelChange={onLevelChange} />
        </div>
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
            className={`focus-ring-inset ${metaBase} ${justUnlocked ? "text-[var(--primary)]" : metaColor(lockedCount)} ${lockInteractive ? "glow-host cursor-pointer" : "cursor-default"}`}
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
            {/* RUNG H1: the word drops first — lowest-impact save (25px);
                icon + count carry on, title keeps the word for hover/AT. */}
            <span className="max-[754px]:hidden">new</span>
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
            {/* Two full sibling forms below RUNG H2 (729), not one button with
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
            {/* Wrapper div carries the responsive display + z/shrink (md
                bakes inline-flex — the undefined-cascade-order trap). */}
            <div className="hidden min-[729px]:block relative z-[var(--z-raised)] shrink-0 grow-0">
            {/* Header treatment (was variant="inverted" — the ink-filled
                look predated the header restyle): quiet rest, glow hover,
                no engaged state (Clear is an action, not a toggle);
                disabled (all-locked) keeps the shared disabled recipe. */}
            <ActionButton
              variant="header-action"
              disabled={clearDisabled}
              onClick={onClearRecs}
              aria-label="Clear results"
            >
              Clear ✕
            </ActionButton>
            </div>
            {/* Icon twin, header treatment (was ink-filled). */}
            <IconButton
              size="md"
              border="base"
              borderColor="transparent"
              backgroundColor="var(--ink)"
              textColor="var(--bg)"
              title="Clear results"
              aria-label="Clear results"
              visuallyDisabled={clearDisabled}
              onClick={clearDisabled ? undefined : onClearRecs}
              display="flex min-[729px]:hidden"
              className="relative z-[var(--z-raised)] shrink-0 grow-0 glow-host"
            >
              <CloseIcon className="glow-icon w-[20px] h-[20px]" />
            </IconButton>
          </span>
          }
        </div>
      )}
    </div>
  );
}

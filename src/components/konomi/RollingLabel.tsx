"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useAnimationDebugValues } from "./animationDebugStore";

interface RollingLabelProps {
  value: string;
  // Every value this label could ever show, not just the current one.
  // Used purely for sizing (see sizingText below), not for anything about
  // which value is actually displayed. Omit it (as MatchSelector does) when
  // every possible value is already the same width, e.g. a single digit.
  sizeToWidestOf?: string[];
  className?: string;
}

// A slot-machine-style vertical roll on value change: the old value scrolls
// up and out while the new one scrolls up from below into the same spot.
// Requested directly for MatchSelector/LevelSelector/SortSelect's own
// collapsed single-button forms specifically: once the active/inactive
// color distinction those collapsed to disappears (see each caller's own
// comment), a tap needs *some* other feedback that a change actually
// happened, since the hover/focus subtext hint only shows on a device that
// supports hover, a touch tap never sees it until after the value already
// changed. Shared here rather than duplicated three times: all three
// callers want the identical effect on the identical trigger (their own
// `value` prop changing), nothing about the roll itself is component-
// specific.
//
// Migrated to Motion (motion/react) from a hand-rolled CSS-keyframe +
// setTimeout state machine — see DESIGN_SYSTEM.md for the full writeup of
// what was removed and why (step 1 of the planned Motion migration,
// /Users/sean/.claude/plans/deep-meandering-comet.md). AnimatePresence's
// own key-based mount/unmount replaces the old outgoing/rollId state pair
// and its cleanup setTimeout.
//
// IMPORTANT for any future caller that also shows a hover/focus-driven hint
// next to this label (as MatchSelector/LevelSelector both do): this
// component still swaps its own child DOM on every roll — AnimatePresence
// unmounts the old `key={value}` element and mounts a new one, the same
// underlying mount/unmount mechanism the previous rollId-keyed version
// used, NOT a persistent node Motion morphs in place. Swapping a child out
// from under an active touch point is the same mechanism already confirmed
// (via real-device Web Inspector logging) to trigger a spurious blur/
// mouseleave on the ancestor button in ResultCard.tsx's own lock icon
// (LockClosedIcon <-> LockOpenIcon). Migrating this component to Motion
// does NOT remove that risk — it was checked, not assumed: AnimatePresence
// keys still cause a genuine mount/unmount, so the same failure mode this
// codebase already hit remains just as possible here. If a caller's
// hint-dismiss logic depends on native onBlur/onMouseLeave without gating
// them to supportsHover (useSupportsHover.ts), that spurious blur can fire
// right as a roll starts and hide the hint immediately — the roll itself
// still plays fine (nothing about it depends on the hint's own state), so
// the bug reads as "the animation happens but the hint doesn't show," and
// only intermittently, since it depends on real device paint/compositor
// timing this app doesn't control (confirmed not reproducible in headless/
// emulated Chromium). Any button pairing this component with a hover/
// blur-driven hint must gate onBlur/onMouseEnter/onMouseLeave behind
// supportsHover and rely on something timing-independent (e.g. an outside-
// pointerdown listener) for touch dismissal instead — see MatchSelector.tsx/
// LevelSelector.tsx for the reference implementation, and DESIGN_SYSTEM.md
// for the full incident writeup.
//
// Exported so each caller's own collapsed onClick can gate against firing a
// second `onChange` before this component's own roll has actually finished
// (see each caller's own comment on why that gate exists at all, and why it
// stays in place — rollBusyRef was NOT removed by this migration; Motion's
// own interruption handling wasn't assumed sufficient to protect against
// the real-device WebKit compositor-desync bug rollBusyRef guards against,
// only confirmed sufficient, or not, by re-running that bug's own original
// rapid-tap repro — see DESIGN_SYSTEM.md). Sharing this one number is what
// keeps the gate's own duration from silently drifting out of sync with
// the roll it's protecting.
//
// Kept as a plain constant (not read from animationDebugStore) — this is
// the fallback/default every caller's own rollBusyRef gate uses; those
// callers (MatchSelector.tsx/LevelSelector.tsx/SortSelect.tsx) read the
// LIVE, possibly-debug-panel-tweaked value directly via
// getAnimationDebugValues().rollDurationMs instead, at the exact moment
// their own gate is armed, so the gate's duration can never drift from
// whatever this component itself is actually about to animate for
// (below) — this constant only still exists as ANIMATION_DEBUG_DEFAULTS'
// own source of truth (animationDebugStore.ts) and for any caller that
// doesn't care about live-tweaking.
export const ROLL_DURATION_MS = 220;

export function RollingLabel({ value, sizeToWidestOf, className }: RollingLabelProps) {
  // Live-tweakable via AnimationDebugPanel.tsx — see animationDebugStore.ts's
  // own top-of-file comment for why (a temporary tuning aid, remove once
  // settled). Defaults to this file's own original 220ms/easeOut.
  const { rollDurationMs, rollEase } = useAnimationDebugValues();

  // Don't roll on the initial hydration settle. Every caller feeds this from a
  // useSyncExternalStore whose getServerSnapshot is the DEFAULT (first value —
  // Casual / Popular / min-match 1), so on load a non-default stored value
  // arrives as a default->stored value CHANGE in the follow-up render, which
  // AnimatePresence would otherwise play as a full roll on every refresh
  // (reported: any non-first value animates on landing; the first value, having
  // no correction, doesn't). Arm the roll one frame after mount — AFTER that
  // correction has landed — so only genuine, user-driven changes animate.
  // requestAnimationFrame specifically (not a plain post-mount flag): the store
  // correction re-renders in the SAME commit/effect phase this effect runs in,
  // and descendant effects run before the ancestor store's own subscribe effect
  // fires the correction, so a plain flag would already be true when it lands —
  // the next frame reliably falls after it. While unarmed, a change is applied
  // instantly (duration 0), so a value that corrects on load just appears.
  const [rollArmed, setRollArmed] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setRollArmed(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const rollTransition = rollArmed ? { duration: rollDurationMs / 1000, ease: rollEase } : { duration: 0 };
  // Sizes this box from the WIDEST candidate in sizeToWidestOf, permanently
  // fixed regardless of which value is currently showing, not from
  // whichever of outgoing/value happens to be longer at this exact moment.
  // Two earlier attempts both failed live, for two different reasons: (1)
  // sizing purely from `value` let this box's own width shrink the instant
  // a roll to a SHORTER label started (e.g. "Seasoned" -> "Otaku", or
  // "Unpopular" -> "A-Z"), before the outgoing text had even scrolled away,
  // producing a brief gray-bar flash around the surrounding button/border
  // exactly on those transitions. (2) Sizing from whichever of outgoing/
  // value was longer fixed that, but only moved the resize to the END of
  // the roll instead: the box still snapped back down to `value`'s own
  // width the instant the roll finished, and animating that snap (a CSS
  // `transition: width`) doesn't work at all here, confirmed live: this
  // box's own width is never an explicit length, only ever browser-computed
  // `auto` (inline-block, shrink-to-fit), and a CSS transition can only
  // interpolate between two explicit lengths, never to/from `auto`, so the
  // declared transition silently did nothing and the snap stayed instant.
  // Sizing permanently from the full candidate set sidesteps the whole
  // class of problem: nothing about a roll ever changes this box's own
  // width at all, matching MatchSelector's own collapsed form (which never
  // had this problem in the first place, since "1"/"2"/"3" are already the
  // same width) rather than trying to smooth over a resize that
  // MatchSelector's own form never needed to make. Comparing plain string
  // length (not a real measured pixel width) is a valid proxy specifically
  // because this whole label is font-mono (IBM Plex Mono, globals.css), a
  // true monospace face where every character occupies the same width, so
  // the longest string is always the widest one. Unrelated to the Motion
  // migration — untouched by it.
  const sizingCandidates = sizeToWidestOf ?? [value];
  const sizingText = sizingCandidates.reduce((widest, candidate) => (candidate.length > widest.length ? candidate : widest), value);

  return (
    // align-top, not the inline-block default vertical-align:baseline.
    // confirmed live as a real bug without it: a baseline-aligned
    // inline-block reserves extra space below itself in its parent's own
    // line box (to leave room for text descenders lining up against its
    // baseline), which doesn't apply here since this element has no visual
    // baseline of its own worth aligning to (its content is absolutely
    // positioned). That extra reserved space alone made the collapsed
    // button measure 37px tall against the segmented form's own 32.5px for
    // the exact same font-size/line-height/padding. align-top removes it,
    // closing that 4.5px gap entirely.
    <span className={["relative inline-block align-top overflow-x-visible overflow-y-hidden", className ?? ""].join(" ")}>
      {/* Sizes this box, permanently, from sizingText above (see that
          variable's own comment for why). invisible, not sr-only/
          opacity-0: this exists purely for layout (width/height), and must
          never be read by assistive tech or hit-test as a second copy of
          the label. */}
      <span aria-hidden className="invisible pointer-events-none">
        {sizingText}
      </span>
      {/* initial={false}: skips the enter animation on this component's own
          first mount (matching the old implementation's `outgoing` starting
          `null` — the very first render just shows `value`, no roll, only
          a `value` CHANGE ever triggers one). mode is left at its default
          ("sync"): the outgoing and incoming spans are both absolutely
          positioned and need to animate concurrently, not sequentially. */}
      <AnimatePresence initial={false}>
        {/* key={value}, not a separately-tracked rollId counter — Motion's
            own AnimatePresence already remounts a fresh element whenever
            its key changes, the exact same "always start a fresh 0%/100%
            state, never reuse an in-flight one" guarantee the old rollId
            existed to provide by hand. pointer-events-none, matching the
            old implementation: belt-and-suspenders against a real, reported
            (though never reproduced outside a real device) mobile paint/
            hit-test desync near this row's collapsed controls — a click
            always reaches the actual <button> regardless of what's
            painted on top of it, but this span has no interactive purpose
            of its own to justify staying hit-testable while an in-flight
            transform (and whatever compositing layer it promotes onto) is
            animating. */}
        <motion.span
          key={value}
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          initial={{ y: "100%" }}
          animate={{ y: "0%" }}
          exit={{ y: "-100%" }}
          transition={rollTransition}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

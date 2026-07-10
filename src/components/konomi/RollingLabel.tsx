"use client";

import { useEffect, useRef, useState } from "react";

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
// Exported so each caller's own collapsed onClick can gate against firing a
// second `onChange` before this component's own roll has actually finished
// (see each caller's own comment on why that gate exists at all). Sharing
// this one number is what keeps the gate's own duration from silently
// drifting out of sync with the roll it's protecting.
export const ROLL_DURATION_MS = 220;
// CSS keyframe animations (roll-out-up/roll-in-up, globals.css), not a
// transitioned className toggle driven by a double-requestAnimationFrame
// delay. An earlier version of this component used the latter, and it was
// confirmed live, twice independently, as genuinely unreliable: the roll
// sometimes simply never played (landing straight on the destination
// value with no visible motion), and separately, interrupting one roll
// with another rapid click could leave the transition permanently stuck
// mid-flight. A CSS transition only animates a property CHANGE the browser
// has already painted a "before" value for, which is why that version
// needed React's commit to land, then an actual paint, then only THEN the
// "after" state, three ordered events a double rAF can only approximate,
// not guarantee, and evidently not reliably enough on a real device. A
// freshly-applied `animation` class has no such requirement: its own 0%
// keyframe IS the before state, baked into the animation itself, so simply
// having the class present the instant a roll starts is enough regardless
// of any paint/commit ordering.
const ANIMATION_STYLE = `${ROLL_DURATION_MS}ms ease-out forwards`;

export function RollingLabel({ value, sizeToWidestOf, className }: RollingLabelProps) {
  // The value currently animating OUT, null whenever idle (not mid-roll).
  const [outgoing, setOutgoing] = useState<string | null>(null);
  // Tracks the value this component last actually rendered at rest, read
  // (not state) since it must never itself trigger a re-render. Only
  // `value` changing does that, via the effect below.
  const currentRef = useRef(value);
  // Increments once per roll, used as the animating pair's own `key` below.
  // Forces React to mount a genuinely fresh element pair every time, rather
  // than updating an existing one in place. This matters even though each
  // caller's own onClick already gates against overlapping rolls (see
  // ROLL_DURATION_MS's own comment): a stable key, reused across two
  // back-to-back rolls, wouldn't reliably restart a CSS animation the
  // browser already considers "the same value" as before. A fresh element
  // always starts its animation from 0%, a reused one might not. Real
  // state, not a ref: a ref's `.current` can't be read during render (only
  // in effects/handlers), and this value is read directly in the JSX below
  // as a `key`.
  const [rollId, setRollId] = useState(0);

  useEffect(() => {
    if (value === currentRef.current) return;
    setOutgoing(currentRef.current);
    currentRef.current = value;
    setRollId((id) => id + 1);
  }, [value]);

  // A plain timer, not `onAnimationEnd`, cleans up once the roll finishes.
  // Matching the same, already-confirmed-live reasoning `onTransitionEnd`
  // failed for in this component's earlier, transition-based version (see
  // ANIMATION_STYLE's own comment): an animation-completion EVENT depends
  // on the browser actually dispatching it, which proved unreliable here;
  // a `setTimeout` matching the animation's own declared duration doesn't
  // depend on that at all, only on the duration this component already
  // controls directly.
  useEffect(() => {
    if (outgoing === null) return;
    const timeout = setTimeout(() => setOutgoing(null), ROLL_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [outgoing]);

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
  // the longest string is always the widest one.
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
      {/* Idle and mid-roll are two entirely separate elements (not one
          span reused across both), specifically so the moment a roll
          finishes and this collapses back down to a single resting span,
          that span is a fresh mount with no leftover animation state to
          carry forward. Confirmed live as a real, visible bug in an
          earlier version that reused one element for both roles: the
          settled span still carried the mid-roll transition, so resetting
          its own class back to the resting position triggered a second,
          unwanted animated "bounce back" right after the intended roll had
          already finished. */}
      {outgoing === null ? (
        <span aria-hidden className="absolute inset-0">
          {value}
        </span>
      ) : (
        <span key={rollId} aria-hidden>
          <span className="absolute inset-0" style={{ animation: `roll-out-up ${ANIMATION_STYLE}` }}>
            {outgoing}
          </span>
          <span className="absolute inset-0" style={{ animation: `roll-in-up ${ANIMATION_STYLE}` }}>
            {value}
          </span>
        </span>
      )}
    </span>
  );
}

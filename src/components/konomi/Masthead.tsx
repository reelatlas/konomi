import { useEffect, useRef, useState } from "react";
import { ThemeSwitcher } from "./ThemeSwitcher";
import type { ThemeKey } from "@/lib/konomi/types";

interface MastheadProps {
  theme: ThemeKey;
  onThemeChange: (key: ThemeKey) => void;
}

export function Masthead({ theme, onThemeChange }: MastheadProps) {
  // Condensed sticky header: appears once the real masthead below has
  // scrolled fully out of view, disappears once it's back — a sentinel +
  // IntersectionObserver, not a scroll listener, so this never runs
  // per-scroll-event JS at all (the browser's own compositor drives it).
  // sentinelRef sits as the *last* child inside the real header, right
  // after its own bottom accent bar — not a separate element after
  // </header> (which would trigger this a whole mb-[space-3xl] (32px)
  // early, while the real masthead's own trailing margin is still fully
  // visible) and not somewhere mid-header either (would trigger while real
  // content is still on screen). This exact point is where the real
  // masthead visually finishes — the moment it scrolls above y=0, nothing
  // of it is left on screen, so the condensed bar mounting exactly then
  // hands off with no visible gap and no overlap.
  //
  // entry.boundingClientRect.top < 0, not just !isIntersecting: on mount,
  // before any scroll, the sentinel already fails isIntersecting exactly
  // once in some engines while layout is still settling (a real, observed
  // false-positive) — its boundingClientRect.top is still >= 0 in that
  // case (it hasn't scrolled anywhere, it just hasn't been measured yet),
  // so checking the sign disambiguates "scrolled past, above the
  // viewport" from "not intersecting because nothing has settled yet."
  const [stuck, setStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => {
      setStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* Condensed sticky header. Always mounted — NOT conditionally
          rendered on `stuck` (an earlier version was, and that was a real,
          confirmed bug: this element still participates in normal
          document flow even while `position: sticky`, so mounting/
          unmounting it inserted/removed its own ~41.5px of real height
          right before the sentinel below, shifting the sentinel itself —
          which re-fired the IntersectionObserver in the opposite
          direction, unmounting it again, shifting the sentinel back,
          remounting it... a genuine, self-triggered feedback loop,
          confirmed live via frame-by-frame sampling: 21 mount/unmount
          flips while slowly scrolling through the crossing point once,
          each one paired with a ~41-42px scrollY jump in the same tick).

          Fixed by making this element's layout footprint permanently
          constant instead: mb-[-41.5px] cancels its own real height
          exactly (confirmed live in isolation — content after it sits at
          the identical document position whether this element is here or
          not), the same self-cancellation technique MixerBar's own
          growing box already uses (marginTop: -growableRef's height, see
          that file's own comment) for the identical reason — a box that
          must not push anything below it regardless of its own size.
          `stuck` now only toggles opacity/pointer-events, never mount
          state, so there's nothing left for this element's own presence
          to feed back into. (A zero-height wrapper was tried first and
          confirmed live NOT to work: position: sticky's own containing-
          block range collapses to nothing inside a 0-height ancestor, so
          the child only reads top:0 for one transient scroll pixel before
          scrolling away like a normal in-flow element — real height +
          equal negative margin is what actually keeps it pinned for the
          whole remaining scroll range.)

          No transition-opacity — matches this app's own default for
          content that doesn't need a fade (see e.g. RatingBadge's own
          comment on the same choice): the sentinel-timed hand-off already
          means the real masthead visually occupies this same screen
          region right up until this one takes over, so there's no gap for
          a transition to smooth over. pointer-events-none while !stuck is
          load-bearing, not decoration — this element still renders
          (invisibly) at its own natural in-flow position, overlapping
          whatever's actually visible there, and would otherwise silently
          swallow clicks meant for it.

          top-0, flush to the true viewport top (not e.g. top-[space-2xl]
          the way MixerBar floats space-2xl off the true viewport *bottom*
          — that choice is about clearing mobile browser bottom chrome/
          home-indicator, a bottom-specific concern that doesn't apply
          here; a header sitting flush at the very top is the standard,
          expected convention this app has no reason to deviate from).

          min-h-[36.5px] items-center, the exact same technique
          ResultsHeader's own row uses for the identical reason: this
          row's tallest content (ThemeSwitcher's 24px-tall swatches, this
          title's own ~22.36px line height) doesn't by itself reach
          36.5px — the height explicitly requested (matching
          --header-row-height, "the recommendations row header height") —
          so it's pinned directly rather than left to hug whichever child
          is tallest.

          KONOMI's own classes here are TitleWithSubtitle's exact h2
          treatment (text-xl/leading-display/tracking-sm/uppercase/
          font-display) — the same size already used for every other
          single-row header in this app (MixerBar's own title, Results'
          "Recommendations") — reusing it instead of picking a fresh size
          keeps the condensed masthead reading at the same visual weight
          as the rest of the app's section titles rather than introducing
          a new one. ミックス rides along too, TitleWithSubtitle's own
          companion-span treatment (font-body font-bold leading-tight
          text-primary text-md) — dropped below 417px (same threshold and
          reasoning as ResultsHeader's own おすすめ: this row must never
          wrap, so the companion is the one thing that gives at a width
          this tight, not the row itself).

          The outer box reforms the real masthead's own two-part border —
          not a plain single border, an ink border-b (matching the real
          header's own border-[ink] all around) THEN a thin secondary-
          color accent strip as the box's own last child (mirroring that
          header's own h-[9px] bg-secondary border-t-ink bar) — at roughly
          a third of that bar's own height (9px), since a condensed row
          reforming a whole banner's identity into ~36.5px of content
          doesn't have room for a full-scale replica of every element,
          just enough of its actual signature (ink border, secondary
          accent) to read as the same design language rather than a
          generic bar. No rotate-[-0.5deg] here, unlike the real header —
          confirmed live that a rotated box flush against the true
          viewport edge (top-0, no surrounding page padding to absorb the
          tilt the way the real header's own pt/pb-2xl does) shows a
          visible sliver of whatever's scrolled beneath it at one top
          corner, not a stylistic choice worth the artifact.

          ThemeSwitcher's subtextPlacement="left" (see that component's
          own comment): its default bottom placement would hang the hover
          subtext below this row's own 36.5px box, over whatever page
          content has scrolled beneath this sticky bar rather than over
          this component's own surface — unreadable against arbitrary
          scrolled content instead of a flat, predictable one. */}
      <div
        className={[
          "sticky top-0 z-[var(--z-sticky)] bg-[var(--surface)] border-b-[length:var(--border-base)] border-b-[var(--ink)] shadow-[var(--elev-3)] mb-[-41.5px]",
          stuck ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        ].join(" ")}
      >
        <div className="flex items-center justify-between min-h-[36.5px] gap-x-[var(--space-lg)] px-[var(--space-2xl)]">
          <div className="flex items-baseline gap-x-[var(--space-md)] min-w-0">
            <h1 className="font-display text-[length:var(--text-xl)] leading-[var(--leading-display)] m-0 uppercase tracking-[var(--tracking-sm)]">
              KONOMI
            </h1>
            <span className="font-body font-bold leading-[var(--leading-tight)] text-[var(--primary)] text-[length:var(--text-md)] max-[417px]:hidden">
              ミックス
            </span>
          </div>
          <ThemeSwitcher value={theme} onChange={onThemeChange} subtextPlacement="left" />
        </div>
        <div className="h-[3px] bg-[var(--secondary)]" />
      </div>
      {/* mb-[var(--space-3xl)] (32px): deliberately NOT the same X as the
          other gaps in the header+card+mixer group below (card→mixer,
          header→card, left/right margins, mixer→screen-bottom — all still
          space-2xl, see globals.css's --result-card-height comment for that
          uniform-frame reasoning). This one gap is intentionally bigger, by
          request — the masthead reads as its own distinct banner, clearly
          separated from the working area below, rather than one more edge of
          that otherwise-uniform group. (This is also this gap's original,
          pre-uniform-frame value, from before Step 2 shrank it to space-2xl
          for that now-relaxed symmetry.) */}
      <header className="border-[length:var(--border-base)] border-[var(--ink)] bg-[var(--surface)] shadow-[var(--elev-5)] rotate-[-0.5deg] px-[var(--space-2xl)] pt-[var(--space-2xl)] pb-0 mb-[var(--space-3xl)]">
      {/* flex-nowrap (the default, not written out) on this outer row —
          ThemeSwitcher must never drop to its own line, full stop. Instead
          of the whole row wrapping at some bisected breakpoint (the
          earlier approach here, reverted — it needed a hand-measured
          magic-number breakpoint and still let the wrapped ThemeSwitcher's
          own tap/hover subtext crowd whatever sat below it), the wordmark
          group below is the one that gives: it wraps *internally*
          (KONOMI/ミックス dropping to two lines) once it doesn't have room
          for both side by side, while ThemeSwitcher keeps its own fixed
          size and position on the right the entire time. This is plain
          CSS flex-wrap resolved by the browser's own layout pass — no
          measured breakpoint, no ResizeObserver, no JS of any kind
          involved, so there's no race condition to solve here the way
          earlier fixes this session needed: nothing is deriving a value
          from a live measurement that could land a frame behind a
          resize. */}
      <div className="flex justify-between items-start gap-[var(--space-xl)]">
        {/* flex-wrap + min-w-0: lets this group shrink below its own
            content's natural width (flex items default to min-width:auto,
            which otherwise blocks shrinking below intrinsic size and would
            force an overflow instead of a wrap) and wrap ミックス below
            KONOMI once there isn't room for both on one line. gap-x/gap-y
            set independently, not one unified gap — a single space-xl
            value would put too much vertical air between the stacked
            KONOMI/ミックス lines (a subtitle should sit close beneath its
            title), while the horizontal (side-by-side) spacing genuinely
            does want the fuller space-xl this axis already had. space-xs
            (4px) is this app's own smallest spacing step. */}
        <div className="flex items-baseline flex-wrap gap-x-[var(--space-xl)] gap-y-[var(--space-xs)] min-w-0">
          <h1 className="font-display text-[length:var(--text-wordmark)] leading-[var(--leading-display)] m-0 tracking-[var(--tracking-xs)] uppercase">
            KONOMI
          </h1>
          <span className="font-body font-black text-[length:var(--text-wordmark-jp)] text-[var(--primary)]">
            ミックス
          </span>
        </div>
        {/* shrink-0: forces all "not enough room" pressure onto the
            wordmark group above instead of splitting it — ThemeSwitcher
            keeps its own natural size and never gets compressed or
            wrapped, matching the actual requirement (it stays put; the
            wordmark is what adapts). */}
        <div className="flex gap-[var(--space-md)] items-center self-center shrink-0">
          <ThemeSwitcher value={theme} onChange={onThemeChange} />
        </div>
      </div>
      {/* mt-[calc(var(--space-2xl)_-_9px)], not a flat mt-2xl: this bar's
          own height (h-[9px], box-sizing: border-box so 9px is its whole
          rendered box, border included) sits between the row and the true
          bottom border, on top of whatever margin is set here — a flat
          mt-2xl made the *visual* row-to-border distance 24+9=33px, ~9px
          more than the top's plain pt-2xl(24), even though the bar itself
          sits flush against the border with zero gap after it (pb-0 on
          the header, above). Subtracting the bar's own 9px here means
          margin + bar height = 24 again, matching pt-2xl's own visual
          distance instead of just reusing its token value — same
          approach ResultsHeader.tsx's own mb-[calc(var(--space-2xl)_-_7.08px)]
          already uses for exactly this "token match isn't the same as
          visual match" gap. (Don't trust getBoundingClientRect() to
          verify this one directly — this bar is a wide child of the
          header's own rotate-[-0.5deg], and a rotated ancestor inflates a
          wide child's axis-aligned bounding box height; confirmed live
          this reads ~14.65px for a 9px-tall element. Check the computed
          height/border/margin values instead.) */}
      <div className="h-[9px] bg-[var(--secondary)] border-t-[length:var(--border-base)] border-t-[var(--ink)] mx-[calc(var(--space-2xl)*-1)] mt-[calc(var(--space-2xl)_-_9px)]" />
      {/* Sentinel for the condensed header above — see this component's
          own top comment for why it lives exactly here (the header's own
          last child) and not as a sibling after </header>. h-px, not h-0:
          a zero-height element can fail to ever register a real
          intersection change in some engines (nothing to intersect);
          a hairline is enough to observe reliably without being visually
          noticeable against the header's own bottom border it sits
          flush against. */}
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />
    </header>
    </>
  );
}

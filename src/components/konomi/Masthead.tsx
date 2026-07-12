import { motion } from "motion/react";
import { ArrowDownIcon, ArrowUpIcon } from "./icons";
import { IconButton } from "./IconButton";
import { ThemeSwitcher } from "./ThemeSwitcher";
import type { ThemeKey } from "@/lib/konomi/types";

interface MastheadProps {
  theme: ThemeKey;
  onThemeChange: (key: ThemeKey) => void;
  // App-shell rewrite (Phase 1): expanded (false) shows the full banner;
  // collapsed (true) shrinks it to a slim row. Deliberately NOT derived
  // from k.hasResults (that was tried first, `active={k.hasResults}`) —
  // a live derivation re-expands the masthead the instant results are
  // cleared, reported directly as jarring. This is now a one-way trigger
  // owned in KonomiApp.tsx (set true on a successful RECOMMEND, never
  // reset by clearing results), plus a manual override via
  // onToggleCollapsed below. Replaces the old scroll-position-triggered
  // condensed header entirely: with no page scroll left in the new shell
  // (see KonomiApp.tsx's own top comment), the IntersectionObserver/
  // sentinel mechanism that used to drive this has nothing left to
  // observe.
  collapsed: boolean;
  // The manual affordance (an IconButton, below) — lets the user get back
  // to the expanded banner even after collapsed has been triggered, since
  // the trigger itself is one-way and never reverses on its own.
  onToggleCollapsed: () => void;
}

// Single persistent element, not two (a full header plus a separate
// condensed-bar overlay, the old design) — the expanded/collapsed states
// are two different className sets on the SAME motion.header, and Motion's
// `layout` prop animates the transition between them automatically (FLIP:
// measure before, let the real DOM snap to its new rect, animate a
// compositor transform from old to new). This is the clean case `layout`
// is actually built for: one element, a discrete state-driven size change,
// nothing nested under it also carrying `layout`, and nothing downstream
// needs artificial pinning — the results section is a flex sibling with
// its own flex-1, so it reflows to whatever height this leaves automatically,
// the same way any ordinary flex layout does (see MixerBar.tsx's own
// history, and DESIGN_SYSTEM.md, for why `layout` does NOT compose cleanly
// when a real size change cascades through multiple nested elements
// instead — that's a structurally different case from this one).
//
// Collapsed state's specific numbers — text-xl/text-md wordmark sizes,
// min-h-[36.5px] row, ThemeSwitcher subtextPlacement="left", border-b-only
// (not all 4 sides), shadow-elev-3 (not elev-5), and a plain 3px accent
// bar with no border-t or top-margin spacing trick — are pulled directly
// from the old scroll-triggered condensed header's own already-tuned
// design (see git history), matched exactly rather than approximated: the
// point of reusing it is that it already reads correctly alongside
// ResultsHeader's own matching row-height convention elsewhere in this
// app. Dropping the rotate-[-0.5deg] and the top padding in the collapsed
// state is the one deliberate, new design call (not forced by anything
// technical the way it was for the old sticky condensed bar, which
// specifically couldn't rotate flush against the true viewport edge — see
// git history for that now-inapplicable reasoning): expanded reads as the
// more expressive, tilted banner; collapsed settles into a flatter utility
// row once the user is actually working with results.
export function Masthead({ theme, onThemeChange, collapsed, onToggleCollapsed }: MastheadProps) {
  return (
    <motion.header
      layout
      // Spring, not a fixed-duration tween — Motion's own documented
      // recommendation for a transition that follows a gesture (a scroll/
      // pull, here, via KonomiApp.tsx's own listeners) rather than a
      // simple click: a spring can be interrupted and re-targeted
      // smoothly mid-flight, which matters here specifically since a fast
      // scroll-then-pull-back (or the reverse) can flip `collapsed` again
      // before the previous transition finishes — a fixed-duration tween
      // would either cut hard to the new target or restart from scratch,
      // where a spring's own physics carries the existing velocity into
      // the new target instead. Low bounce (0.2, not the default ~0.25-
      // 0.3) on request for "smooth and clean" — enough spring feel to
      // read as physical, not so much it overshoots and settles visibly.
      transition={{ type: "spring", duration: 0.4, bounce: 0.2 }}
      className={[
        "bg-[var(--surface)] px-[var(--space-2xl)] pb-0 mb-[var(--space-3xl)]",
        collapsed
          ? "border-b-[length:var(--border-base)] border-b-[var(--ink)] shadow-[var(--elev-3)]"
          : "border-[length:var(--border-base)] border-[var(--ink)] shadow-[var(--elev-5)] rotate-[-0.5deg] pt-[var(--space-2xl)]",
      ].join(" ")}
    >
      {/* flex-nowrap (the default, not written out) on this outer row in
          both states — the trailing group (ThemeSwitcher + the collapse/
          expand toggle) must never drop to its own line, full stop. In the
          expanded state, the wordmark group is the one that gives (wraps
          internally, KONOMI/ミックス dropping to two lines) once it doesn't
          have room for both side by side; in the collapsed state the
          wordmark is a fixed, already-small size that never needs to wrap
          in the first place. */}
      <div
        className={
          collapsed
            ? "flex items-center justify-between min-h-[36.5px] gap-x-[var(--space-lg)]"
            : "flex justify-between items-start gap-[var(--space-xl)]"
        }
      >
        <div
          className={
            collapsed
              ? "flex items-baseline gap-x-[var(--space-md)] min-w-0"
              : "flex items-baseline flex-wrap gap-x-[var(--space-xl)] gap-y-[var(--space-xs)] min-w-0"
          }
        >
          <h1
            className={
              collapsed
                ? "font-display text-[length:var(--text-xl)] leading-[var(--leading-display)] m-0 uppercase tracking-[var(--tracking-sm)]"
                : "font-display text-[length:var(--text-wordmark)] leading-[var(--leading-display)] m-0 tracking-[var(--tracking-xs)] uppercase"
            }
          >
            KONOMI
          </h1>
          <span
            className={
              collapsed
                ? "font-body font-bold leading-[var(--leading-tight)] text-[var(--primary)] text-[length:var(--text-md)] max-[417px]:hidden"
                : "font-body font-black text-[length:var(--text-wordmark-jp)] text-[var(--primary)]"
            }
          >
            ミックス
          </span>
        </div>
        {/* shrink-0 (expanded state only — the collapsed row has no other
            sizing pressure on this side to guard against): forces all "not
            enough room" pressure onto the wordmark group above instead of
            splitting it. subtextPlacement="left" (collapsed only): the
            same reason the old condensed bar needed it — its default
            bottom placement would hang the hover subtext below this row's
            own slim box, over whatever's rendered beneath it, rather than
            over this component's own surface.

            The collapse/expand toggle sits beside ThemeSwitcher in both
            states — always reachable, not just once collapsed has already
            triggered, since the point is letting the user get back to
            expanded too. ArrowUpIcon (collapsed: clicking grows the
            header) / ArrowDownIcon (expanded: clicking shrinks it) reuse
            MixerBar's own up-means-grow/down-means-shrink icon vocabulary
            (see icons.tsx) rather than introducing a new glyph meaning. */}
        <div className={["flex gap-[var(--space-md)] items-center", collapsed ? "" : "self-center shrink-0"].join(" ")}>
          <ThemeSwitcher value={theme} onChange={onThemeChange} subtextPlacement={collapsed ? "left" : undefined} />
          <IconButton
            size="sm"
            border="thin"
            backgroundColor="transparent"
            title={collapsed ? "Expand header" : "Collapse header"}
            aria-label={collapsed ? "Expand header" : "Collapse header"}
            onClick={onToggleCollapsed}
          >
            {collapsed ? <ArrowUpIcon className="text-[var(--ink)]" /> : <ArrowDownIcon className="text-[var(--ink)]" />}
          </IconButton>
        </div>
      </div>
      {/* Expanded: h-[9px] with border-t + mt-[calc(space-2xl-9px)] — this
          bar's own height sits between the row and the true bottom border,
          on top of whatever margin is set here. A flat mt-2xl would make
          the *visual* row-to-border distance 2xl+9px, more than the top's
          own gap even though the bar itself sits flush against the border
          with zero gap after it (pb-0 above) — subtracting the bar's own
          height keeps margin + bar height at a constant 24px. mx-[-2xl]:
          this bar spans the header's full width, undoing the header's own
          px-2xl for just this one child.

          Collapsed: a plain h-[3px] strip, no border-t, no margin-top
          spacing formula — matches the old condensed header's own accent
          bar exactly (see git history: it was a direct, unpadded child of
          a padding-less outer bar, so it never needed either). mx-[-2xl]
          is still needed here even though the old version didn't have it
          — that version's outer container had no padding of its own to
          cancel in the first place; this one shares a single px-2xl header
          with the expanded state, so the same negative margin is what
          produces the identical "flush to both edges" result. */}
      <div
        className={
          collapsed
            ? "h-[3px] bg-[var(--secondary)] mx-[calc(var(--space-2xl)*-1)]"
            : "h-[9px] bg-[var(--secondary)] border-t-[length:var(--border-base)] border-t-[var(--ink)] mx-[calc(var(--space-2xl)*-1)] mt-[calc(var(--space-2xl)_-_9px)]"
        }
      />
    </motion.header>
  );
}

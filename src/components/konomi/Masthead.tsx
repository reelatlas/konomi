import { motion } from "motion/react";
import { ThemeSwitcher } from "./ThemeSwitcher";
import type { ThemeKey } from "@/lib/konomi/types";

interface MastheadProps {
  theme: ThemeKey;
  onThemeChange: (key: ThemeKey) => void;
  // App-shell rewrite (Phase 1): landing (false) shows the full banner;
  // active (true) collapses it to a slim row. Driven by k.hasResults in
  // KonomiApp.tsx — "the user has actually gotten a result," not a new
  // concept, reusing state useKonomi.ts already computes rather than
  // inventing a second "has interacted" signal. Replaces the old
  // scroll-position-triggered condensed header entirely: with no page
  // scroll left in the new shell (see KonomiApp.tsx's own top comment),
  // the IntersectionObserver/sentinel mechanism that used to drive this
  // has nothing left to observe.
  active: boolean;
}

// Single persistent element, not two (a full header plus a separate
// condensed-bar overlay, the old design) — the full/slim states are two
// different className sets on the SAME motion.header, and Motion's
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
// Slim state's specific numbers — text-xl/text-md wordmark sizes,
// min-h-[36.5px] row, ThemeSwitcher subtextPlacement="left", border-b-only
// (not all 4 sides), shadow-elev-3 (not elev-5), and a plain 3px accent
// bar with no border-t or top-margin spacing trick — are pulled directly
// from the old scroll-triggered condensed header's own already-tuned
// design (see git history), matched exactly rather than approximated: the
// point of reusing it is that it already reads correctly alongside
// ResultsHeader's own matching row-height convention elsewhere in this
// app. Dropping the rotate-[-0.5deg] and the top padding in the slim
// state is the one deliberate, new design call (not forced by anything
// technical the way it was for the old sticky condensed bar, which
// specifically couldn't rotate flush against the true viewport edge — see
// git history for that now-inapplicable reasoning): landing reads as the
// more expressive, tilted banner; active settles into a flatter utility
// row once the user is actually working with results.
export function Masthead({ theme, onThemeChange, active }: MastheadProps) {
  return (
    <motion.header
      layout
      transition={{ duration: 0.28, ease: [0, 0, 0.2, 1] }}
      className={[
        "bg-[var(--surface)] px-[var(--space-2xl)] pb-0 mb-[var(--space-3xl)]",
        active
          ? "border-b-[length:var(--border-base)] border-b-[var(--ink)] shadow-[var(--elev-3)]"
          : "border-[length:var(--border-base)] border-[var(--ink)] shadow-[var(--elev-5)] rotate-[-0.5deg] pt-[var(--space-2xl)]",
      ].join(" ")}
    >
      {/* flex-nowrap (the default, not written out) on this outer row in
          both states — ThemeSwitcher must never drop to its own line, full
          stop. In the full state, the wordmark group is the one that gives
          (wraps internally, KONOMI/ミックス dropping to two lines) once it
          doesn't have room for both side by side; in the slim state the
          wordmark is a fixed, already-small size that never needs to wrap
          in the first place. */}
      <div
        className={
          active
            ? "flex items-center justify-between min-h-[36.5px] gap-x-[var(--space-lg)]"
            : "flex justify-between items-start gap-[var(--space-xl)]"
        }
      >
        <div
          className={
            active
              ? "flex items-baseline gap-x-[var(--space-md)] min-w-0"
              : "flex items-baseline flex-wrap gap-x-[var(--space-xl)] gap-y-[var(--space-xs)] min-w-0"
          }
        >
          <h1
            className={
              active
                ? "font-display text-[length:var(--text-xl)] leading-[var(--leading-display)] m-0 uppercase tracking-[var(--tracking-sm)]"
                : "font-display text-[length:var(--text-wordmark)] leading-[var(--leading-display)] m-0 tracking-[var(--tracking-xs)] uppercase"
            }
          >
            KONOMI
          </h1>
          <span
            className={
              active
                ? "font-body font-bold leading-[var(--leading-tight)] text-[var(--primary)] text-[length:var(--text-md)] max-[417px]:hidden"
                : "font-body font-black text-[length:var(--text-wordmark-jp)] text-[var(--primary)]"
            }
          >
            ミックス
          </span>
        </div>
        {/* shrink-0 (full state only — the slim row has no other sizing
            pressure on this side to guard against): forces all "not enough
            room" pressure onto the wordmark group above instead of
            splitting it. subtextPlacement="left" (slim only): the same
            reason the old condensed bar needed it — its default bottom
            placement would hang the hover subtext below this row's own
            slim box, over whatever's rendered beneath it, rather than over
            this component's own surface. */}
        <div className={active ? "" : "flex gap-[var(--space-md)] items-center self-center shrink-0"}>
          <ThemeSwitcher value={theme} onChange={onThemeChange} subtextPlacement={active ? "left" : undefined} />
        </div>
      </div>
      {/* Landing: h-[9px] with border-t + mt-[calc(space-2xl-9px)] — this
          bar's own height sits between the row and the true bottom border,
          on top of whatever margin is set here. A flat mt-2xl would make
          the *visual* row-to-border distance 2xl+9px, more than the top's
          own gap even though the bar itself sits flush against the border
          with zero gap after it (pb-0 above) — subtracting the bar's own
          height keeps margin + bar height at a constant 24px. mx-[-2xl]:
          this bar spans the header's full width, undoing the header's own
          px-2xl for just this one child.

          Active: a plain h-[3px] strip, no border-t, no margin-top spacing
          formula — matches the old condensed header's own accent bar
          exactly (see git history: it was a direct, unpadded child of a
          padding-less outer bar, so it never needed either). mx-[-2xl] is
          still needed here even though the old version didn't have it —
          that version's outer container had no padding of its own to
          cancel in the first place; this one shares a single px-2xl header
          with the landing state, so the same negative margin is what
          produces the identical "flush to both edges" result. */}
      <div
        className={
          active
            ? "h-[3px] bg-[var(--secondary)] mx-[calc(var(--space-2xl)*-1)]"
            : "h-[9px] bg-[var(--secondary)] border-t-[length:var(--border-base)] border-t-[var(--ink)] mx-[calc(var(--space-2xl)*-1)] mt-[calc(var(--space-2xl)_-_9px)]"
        }
      />
    </motion.header>
  );
}

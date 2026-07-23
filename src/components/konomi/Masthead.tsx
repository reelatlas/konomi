import Link from "next/link";
import { DOMAINS } from "@/lib/konomi/domains";
import type { ThemeKey } from "@/lib/konomi/types";
import { useDomain } from "./domainContext";
import { SideSwitchIcon } from "./icons";
import { ThemeSwitcher } from "./ThemeSwitcher";

interface MastheadProps {
  theme: ThemeKey;
  onThemeChange: (key: ThemeKey) => void;
  // Still a boolean, but its role narrowed with the scroll-morph rewrite: it
  // is now ONLY the settled endpoint (has the masthead come to rest expanded
  // or collapsed), used for the two things that genuinely can't scrub — the
  // ThemeSwitcher's hover-subtext placement and the wordmark's aria — NOT for
  // any of the morphing visual geometry. All of that reads --masthead-progress
  // (0 expanded -> 1 collapsed) live instead, so mid-gesture this component is
  // at a fractional state the boolean can't describe. Driven from KonomiApp:
  // set true on a successful RECOMMEND (which animates the settle via the same
  // progress var), and toggled either way by the page's scroll/pull gesture
  // (see KonomiApp's wheel/touch effect, which writes the progress var live and
  // settles the boolean on release). No in-banner toggle button.
  collapsed: boolean;
}

// Scroll-morph rewrite (feat/masthead-scroll-morph): the expanded<->collapsed
// transition is now a real, gesture-scrubbed morph, NOT Motion's `layout` FLIP.
// Every morphing property is a single calc() off the inherited
// --masthead-progress custom property (0 = expanded, 1 = collapsed), which
// KonomiApp writes live off the wheel/touch delta. So this is a plain
// <header> — no Motion here at all anymore.
//
// Why CSS calc over Motion for THIS: the effect the user wants is a scrub
// ("the scroll reflects in real time how far along the masthead is"), and the
// dominant change is FONT SIZE (the KONOMI wordmark goes 78px -> 26px). That is
// inherently a layout animation — it re-lays-out on the main thread each frame
// no matter what drives it. Motion's `layout` FLIP animates a compositor
// SCALE transform to fake that size change, which is smooth but visibly
// distorts/blurs text mid-flight and can't be scrubbed to an arbitrary
// fractional point off a gesture without extra machinery. A direct calc morph
// keeps the text crisply, truthfully laid out at every fractional progress and
// is trivially scrubbable (just set the var) — the right trade for a
// user-driven scrub where crispness and 1:1 tracking beat compositor smoothness.
// The one Motion touch kept is the SETTLE easing (a generate-css-spring
// linear(), globals.css --masthead-settle-ease) so release keeps the old
// spring's low-bounce feel. If per-frame layout ever janks on a low-end device,
// the documented next step is hybrid C: swap only the value-driver to a Motion
// useMotionValue spring (interruptible, velocity-carrying) while keeping this
// exact calc layer — a cheap upgrade, not a rewrite.
//
// Deliberate small deviations from the old discrete collapsed state, accepted
// because they can't scrub and are invisible or trivial: the JP ミックス stays
// visible at narrow widths while collapsed (was hidden < 417px — a hide can't
// interpolate), it keeps font-black throughout (weight can't tween on a
// non-variable face), and the inner row uses items-center throughout (the old
// expanded items-start was already overridden to center for the ThemeSwitcher
// via self-center, and the wordmark defines the row height either way, so this
// is visually inert). Everything geometric (padding, tilt, shadow, borders,
// font sizes, accent bar, gaps) reproduces the old two endpoints EXACTLY at
// progress 0 and 1 — the calc endpoints are the old expanded/collapsed values
// verbatim, so a settled masthead is pixel-identical to the boolean version
// this replaced; only the in-between is new.
export function Masthead({ theme, onThemeChange, collapsed }: MastheadProps) {
  // The side switch links to the OTHER catalog partition (anime ⇄ film) — a
  // real route navigation, so each side keeps its own server fetch and its
  // own mounted app state. With exactly two sides, "the other one" is a
  // find; a 3+-side future would swap this for a menu.
  const domain = useDomain();
  const otherSide = Object.values(DOMAINS).find((d) => d.key !== domain.key);
  return (
    <header
      // border: bottom stays full width in both states; top/left/right thin
      // from --border-base to 0 as it collapses (the collapsed state is
      // border-b only). box-shadow morphs elev-5 (8px offset) -> elev-3 (4px):
      // both tokens are `<n> <n> 0 var(--ink)`, so only the offset interpolates.
      // rotate: the -0.5deg expanded tilt eases to flat. paddingTop: the 24px
      // top breathing room closes to 0. All off the one inherited progress var.
      style={{
        paddingTop: "calc(var(--space-2xl) * (1 - var(--masthead-progress)))",
        transform: "rotate(calc(-0.5deg * (1 - var(--masthead-progress))))",
        boxShadow:
          "calc(8px - 4px * var(--masthead-progress)) calc(8px - 4px * var(--masthead-progress)) 0 var(--ink)",
        borderStyle: "solid",
        borderColor: "var(--ink)",
        borderTopWidth: "calc(var(--border-base) * (1 - var(--masthead-progress)))",
        borderLeftWidth: "calc(var(--border-base) * (1 - var(--masthead-progress)))",
        borderRightWidth: "calc(var(--border-base) * (1 - var(--masthead-progress)))",
        borderBottomWidth: "var(--border-base)",
      }}
      // mb-[space-2xl]: the masthead->recommendations gap is deliberately the
      // SAME 24px as every other frame gap in the app — one uniform gutter
      // everywhere (see KonomiApp/DESIGN_SYSTEM.md). Flat across the whole
      // morph; the tilt slants this edge cosmetically but the gap token stays 24.
      className="bg-[var(--surface)] px-[var(--space-2xl)] pb-0 mb-[var(--space-2xl)]"
    >
      {/* Outer row: justify-between + items-center throughout, never wraps
          (flex-nowrap default) — the trailing ThemeSwitcher must never drop to
          its own line. columnGap eases 16px (space-xl) -> 12px (space-lg).
          minHeight grows 0 -> 36px as it collapses, so the slim collapsed row
          keeps its floor height once the shrunk wordmark no longer defines it;
          at rest expanded the big wordmark defines the height and the 0 floor
          is inert. */}
      <div
        className="flex justify-between items-center min-w-0"
        style={{
          columnGap: "calc(var(--space-xl) - (var(--space-xl) - var(--space-lg)) * var(--masthead-progress))",
          minHeight: "calc(36px * var(--masthead-progress))",
        }}
      >
        {/* Wordmark group: items-baseline + flex-wrap throughout (KONOMI/ミックス
            can drop to two lines when the expanded wordmark is too wide side by
            side; the collapsed small text always fits, so wrap is inert there).
            columnGap eases 16px (space-xl) -> 8px (space-md). */}
        <div
          className="flex items-baseline flex-wrap min-w-0"
          style={{
            columnGap: "calc(var(--space-xl) - (var(--space-xl) - var(--space-md)) * var(--masthead-progress))",
            rowGap: "var(--space-xs)",
          }}
        >
          <h1
            className="font-display leading-[var(--leading-display)] m-0 uppercase"
            style={{
              fontSize: "calc(var(--text-wordmark) + (var(--text-xl) - var(--text-wordmark)) * var(--masthead-progress))",
              letterSpacing:
                "calc(var(--tracking-xs) + (var(--tracking-sm) - var(--tracking-xs)) * var(--masthead-progress))",
            }}
          >
            KONOMI
          </h1>
          <span
            className="font-body font-black leading-[var(--leading-tight)] text-[var(--primary)]"
            style={{
              fontSize:
                "calc(var(--text-wordmark-jp) + (var(--text-md) - var(--text-wordmark-jp)) * var(--masthead-progress))",
            }}
          >
            ミックス
          </span>
        </div>
        {/* self-center shrink-0: keeps the ThemeSwitcher vertically centered and
            forces all "not enough room" pressure onto the wordmark group, in
            both states. subtextPlacement "left" once settled collapsed — its
            hover subtext would otherwise hang below the slim row. Only ever
            visible on hover, so keying it off the settled boolean (not the live
            progress) is invisible during the scrub itself. */}
        <div className="relative self-center shrink-0">
          {/* Side switch (anime ⇄ film) — the flat mono icon+text affordance
              format the results-header metadata readouts use (glow-host
              bloom, 18px glyph, lowercase, no box), NOT a bordered chip.
              ABSOLUTELY positioned above the ThemeSwitcher (bottom-full +
              space-md gap, right-aligned) — out of flow, zero layout
              footprint, so its presence moves NOTHING else in the header:
              the ThemeSwitcher keeps its exact self-center position and the
              wordmark row's height/centering are untouched (requested
              directly after an in-flow column version visibly pushed the
              ThemeSwitcher down). Expanded-masthead-only, per the
              masthead's own two-layer animation split: opacity rides
              --masthead-progress via calc, so it fades in lockstep with the
              scrub and the settle spring for free; DISCRETE attributes
              (aria-hidden, tabIndex, pointer-events) key off the settled
              `collapsed` boolean, same as ThemeSwitcher's subtextPlacement
              — they can't scrub, and a beat of lag on a mid-gesture
              fractional state is invisible. Hover: CSS transitions only
              (color + a 180° glyph flip) — a discrete A→B hover state is
              animation-ladder rung 1, no Motion needed. */}
          {otherSide && (
            <div
              aria-hidden={collapsed}
              className="absolute bottom-full right-0 mb-[var(--space-sm)]"
              style={{
                // ×3 with a max() clamp: fully vanished by progress ~0.33 —
                // the switch reads as "expanded-state chrome," so it gets
                // out of the way in the first third of the scrub while the
                // geometry morph continues underneath (×2 / half-scrub was
                // tried and still read too slow on-device). Isolated to
                // this wrapper; no other masthead property reads this curve.
                opacity: "max(0, calc(1 - var(--masthead-progress) * 3))",
              }}
            >
              <Link
                href={otherSide.route}
                tabIndex={collapsed ? -1 : undefined}
                aria-label={`switch to the ${otherSide.label.toLowerCase()} side`}
                className={[
                  "glow-host group/sideswitch inline-flex items-center gap-[var(--space-xs)] font-mono text-[length:var(--text-xs)] tracking-[var(--tracking-lg)] lowercase text-[var(--muted)] hover:text-[var(--primary)] focus-visible:text-[var(--primary)] transition-colors duration-200 whitespace-nowrap",
                  collapsed ? "pointer-events-none" : "",
                ].join(" ")}
              >
                <span className="inline-flex items-center justify-center w-[18px] h-[18px] shrink-0">
                  <SideSwitchIcon className="glow-icon w-[18px] h-[18px] transition-transform duration-200 group-hover/sideswitch:rotate-180" />
                </span>
                <span>{otherSide.label.toLowerCase()}</span>
              </Link>
            </div>
          )}
          <ThemeSwitcher value={theme} onChange={onThemeChange} subtextPlacement={collapsed ? "left" : undefined} />
        </div>
      </div>
      {/* Accent bar: full-bleed (mx -24px undoes the header's px-2xl). height
          eases 9px -> 3px, its top ink border thins 2.5px -> 0, and its
          marginTop closes 15px -> 0. At progress 0 that is exactly the old
          expanded bar (h-9 + border-t + mt-[calc(2xl-9px)]); at 1 exactly the
          old collapsed strip (h-3, no border, no margin). */}
      <div
        className="bg-[var(--secondary)] mx-[calc(var(--space-2xl)*-1)]"
        style={{
          height: "calc(9px - 6px * var(--masthead-progress))",
          marginTop: "calc((var(--space-2xl) - 9px) * (1 - var(--masthead-progress)))",
          borderTopStyle: "solid",
          borderTopColor: "var(--ink)",
          borderTopWidth: "calc(var(--border-base) * (1 - var(--masthead-progress)))",
        }}
      />
    </header>
  );
}

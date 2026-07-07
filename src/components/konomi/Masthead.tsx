import { ThemeSwitcher } from "./ThemeSwitcher";
import type { ThemeKey } from "@/lib/konomi/types";

interface MastheadProps {
  theme: ThemeKey;
  onThemeChange: (key: ThemeKey) => void;
}

export function Masthead({ theme, onThemeChange }: MastheadProps) {
  return (
    // mb-[var(--space-3xl)] (32px): deliberately NOT the same X as the
    // other gaps in the header+card+mixer group below (card→mixer,
    // header→card, left/right margins, mixer→screen-bottom — all still
    // space-2xl, see globals.css's --result-card-height comment for that
    // uniform-frame reasoning). This one gap is intentionally bigger, by
    // request — the masthead reads as its own distinct banner, clearly
    // separated from the working area below, rather than one more edge of
    // that otherwise-uniform group. (This is also this gap's original,
    // pre-uniform-frame value, from before Step 2 shrank it to space-2xl
    // for that now-relaxed symmetry.)
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
    </header>
  );
}

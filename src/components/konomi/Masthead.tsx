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
      <div className="flex justify-between items-start flex-wrap gap-[var(--space-xl)]">
        <div className="flex items-baseline gap-[var(--space-xl)]">
          <h1 className="font-display text-[length:var(--text-wordmark)] leading-[var(--leading-display)] m-0 tracking-[var(--tracking-xs)] uppercase">
            KONOMI
          </h1>
          <span className="font-body font-black text-[length:var(--text-wordmark-jp)] text-[var(--primary)]">
            ミックス
          </span>
        </div>
        <div className="flex gap-[var(--space-md)] items-center self-center">
          <ThemeSwitcher value={theme} onChange={onThemeChange} />
        </div>
      </div>
      <p className="font-mono text-[length:var(--text-base)] tracking-[var(--tracking-sm)] text-[var(--primary)] mt-[var(--space-md)] mb-[var(--space-xl)]">
        tag → match → remix
      </p>
      <div className="h-[9px] bg-[var(--secondary)] border-t-[length:var(--border-base)] border-t-[var(--ink)] mx-[calc(var(--space-2xl)*-1)]" />
    </header>
  );
}

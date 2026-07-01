import { THEMES, THEME_KEYS } from "@/lib/konomi/themes";
import type { ThemeKey } from "@/lib/konomi/types";

interface ThemeSwitcherProps {
  value: ThemeKey;
  onChange: (key: ThemeKey) => void;
}

export function ThemeSwitcher({ value, onChange }: ThemeSwitcherProps) {
  return (
    <div className="flex gap-[var(--space-sm)]">
      {THEME_KEYS.map((key) => {
        const t = THEMES[key];
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            title={t.name}
            onClick={() => onChange(key)}
            className={[
              "w-[32px] h-[24px] p-0 cursor-pointer rounded-[var(--radius-chip)] border-[length:var(--border-base)] border-[var(--ink)]",
              active
                ? "shadow-[var(--elev-2)] -translate-x-px -translate-y-px opacity-100"
                : "shadow-none translate-x-0 translate-y-0 opacity-50",
            ].join(" ")}
            // Each swatch previews a specific (possibly inactive) palette's
            // raw colors, so it can't be expressed with the active theme's
            // CSS vars or as a finite set of static Tailwind classes.
            style={{
              background: `linear-gradient(135deg, ${t.surface} 0 42%, ${t.primary} 42% 72%, ${t.secondary} 72% 100%)`,
            }}
          />
        );
      })}
    </div>
  );
}

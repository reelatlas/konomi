export type ActionButtonVariant = "outline" | "filled" | "inverted" | "accent";
export type ActionButtonSize = "md" | "sm";

interface ActionButtonProps {
  variant: ActionButtonVariant;
  // Only meaningful for variant="accent" — which of the two "pop" colors to
  // use. Mirrors DEFAULT_ACCENT's own two options (config.ts) rather than
  // duplicating that config here; the one caller that needs this
  // (RecommendButton) already resolves it from that config and just passes
  // the result through.
  accentColor?: "primary" | "secondary";
  size?: ActionButtonSize;
  disabled?: boolean;
  onClick?: () => void;
  // Only needed by callers whose visible children can be icon-only at some
  // breakpoint (RecommendButton, below a certain width) — a hidden/CSS-only
  // child contributes nothing to the button's accessible name, so those
  // callers need an explicit one. Every other caller's children stay
  // visible text at all times and doesn't need this.
  "aria-label"?: string;
  // For one-off, caller-specific extras that aren't a general "action
  // button" concern — e.g. RecommendButton's own `relative z-[var(--z-raised)]`
  // for its star-layer stacking. Appended after the variant/size classes so
  // it can still override them if it ever needs to.
  className?: string;
  children: React.ReactNode;
}

const SIZE_CLASSES: Record<ActionButtonSize, string> = {
  // The common case — Random ×3, Clear ✕ (mixer), and RECOMMEND all share
  // this padding.
  md: "px-[var(--space-xl)] py-[var(--space-lg)]",
  // Only Clear ✕ (Recommendations tab) uses this smaller size — confirmed
  // against the original markup, not a guess.
  sm: "px-[var(--space-lg)] py-[var(--space-md)]",
};

// Consolidates four previously hand-rolled buttons (Random ×3, Clear ✕
// mixer, Clear ✕ Recommendations, RECOMMEND) that shared the same base type
// treatment (font-mono/bold/text-xs/tracking-xl/uppercase, border-base
// border-ink) but each duplicated it with small, easy-to-drift variations —
// see DESIGN_SYSTEM.md for the full inventory this was built from.
//
// `disabled` is handled uniformly across every variant (bg-disabled-bg/
// text-disabled-text/shadow-none/cursor-not-allowed), not special-cased to
// the "accent" variant alone — RECOMMEND is the only caller that currently
// disables, but this keeps Random/Clear's own disabled treatment defined
// and consistent for whenever (if ever) they need one, rather than a second
// disabled code path only accent variants get.
export function ActionButton({ variant, accentColor, size = "md", disabled, onClick, "aria-label": ariaLabel, className, children }: ActionButtonProps) {
  const variantClasses = disabled
    ? "bg-[var(--disabled-bg)] text-[var(--disabled-text)] shadow-none cursor-not-allowed"
    : {
        // bg-transparent, not omitted — Random ×3 (variant="filled") sits
        // right next to this one and needs the same border/shadow to read
        // as a matching pair; only the fill differs.
        outline: "bg-transparent text-[var(--ink)] shadow-[var(--elev-2)] cursor-pointer",
        filled: "bg-[var(--fill)] text-[var(--ink)] shadow-[var(--elev-2)] cursor-pointer",
        // No shadow — confirmed against the original Clear ✕ (Recommendations)
        // markup, not an oversight relative to outline/filled.
        inverted: "bg-[var(--ink)] text-[var(--bg)] cursor-pointer",
        accent:
          accentColor === "secondary"
            ? "bg-[var(--secondary)] text-[var(--on-secondary)] shadow-[var(--elev-4)] cursor-pointer"
            : "bg-[var(--primary)] text-[var(--on-primary)] shadow-[var(--elev-4)] cursor-pointer",
      }[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={[
        "border-[length:var(--border-base)] border-[var(--ink)] font-mono font-bold text-[length:var(--text-xs)] tracking-[var(--tracking-xl)] uppercase whitespace-nowrap",
        SIZE_CLASSES[size],
        variantClasses,
        className ?? "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

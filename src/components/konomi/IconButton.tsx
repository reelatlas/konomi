import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style" | "disabled"> {
  width: number;
  // Merged with (and able to override) the width/height/color values this
  // component computes itself — callers that position themselves via
  // inline `top`/`bottom` offsets (ScrollFadeArea's arrows, which shift
  // dynamically with `topInset`) need this rather than a static className,
  // since that offset is a runtime value, not a fixed utility class.
  style?: CSSProperties;
  // Defaults to `width` (square) — only ScrollFadeArea's scroll arrows are
  // genuinely non-square (18×16), confirmed against the original markup.
  height?: number;
  shape?: "circle" | "square";
  border?: "hair" | "thin";
  shadow?: boolean;
  backgroundColor?: string;
  textColor?: string;
  // opacity-0, revealed via the *ancestor* carrying `group/reveal` (see
  // this component's own doc comment below for why the group name can't be
  // a prop).
  revealOnHover?: boolean;
  // opacity-40 + cursor-not-allowed *without* the native `disabled`
  // attribute — a real `disabled` button can silently stop firing hover
  // events in some browsers, which breaks hover-driven hints (ResultCard's
  // swap button shows why it's disabled via exactly such a hint). Separate
  // from native `disabled` (still exposed via the spread props below) for
  // callers that don't have this constraint.
  visuallyDisabled?: boolean;
  // Defaults to "inline-flex" — the carousel arrows need to override this
  // to "hidden max-[1152px]:flex" (hidden above the grid breakpoint, a
  // responsive flex below it). That can't safely coexist with a hardcoded
  // "inline-flex" in the base class list: both are `display` utilities
  // applying unconditionally, and Tailwind doesn't order generated classes
  // by source position, so which one wins would be undefined — confirmed
  // by inspection, not assumed. Making display itself a single overridable
  // prop guarantees only one `display` utility is ever present at once.
  display?: string;
  className?: string;
  children: ReactNode;
}

// Consolidates three previously hand-rolled icon buttons (ResultCard's
// lock/swap, ScrollFadeArea's scroll arrows, the results carousel's arrows)
// that shared the same underlying shape (a small bordered, square-or-round
// button wrapping one glyph/icon) but each duplicated the border/shadow/
// size treatment with small variations — see DESIGN_SYSTEM.md for the full
// inventory this was built from.
//
// `revealOnHover` cannot take a group name as a prop: Tailwind's
// `group-hover/name:` variant has to exist as complete literal text in the
// source for its scanner to generate the CSS at build time — a
// template-interpolated class name (`group-hover/${name}:opacity-100`)
// would never be recognized. Rather than work around that, both hover-reveal
// callers (ScrollFadeArea, the results carousel) were standardized on one
// shared ancestor group name, `group/reveal`, instead — they're the same
// interaction pattern already, so this is a naming unification, not a
// compromise. Any caller using `revealOnHover` must ensure an ancestor
// carries `group/reveal`.
// Complete literal class strings, not a template-interpolated
// `border-[length:var(--border-${border})]` — Tailwind's scanner needs the
// full class as static source text to generate it; a runtime-interpolated
// version is invisible to it and would silently never make it into the
// compiled CSS. Same constraint `revealOnHover`'s doc comment above
// describes for group names.
const BORDER_CLASSES: Record<"hair" | "thin", string> = {
  hair: "border-[length:var(--border-hair)]",
  thin: "border-[length:var(--border-thin)]",
};

export function IconButton({
  width,
  height,
  style,
  shape = "square",
  border = "thin",
  shadow = false,
  backgroundColor = "var(--surface)",
  textColor = "var(--ink)",
  revealOnHover,
  visuallyDisabled,
  display = "inline-flex",
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={[
        "flex-none items-center justify-center p-0",
        display,
        BORDER_CLASSES[border],
        "border-[var(--ink)]",
        shape === "circle" ? "rounded-full" : "",
        shadow ? "shadow-[var(--elev-1)]" : "",
        revealOnHover ? "opacity-0 group-hover/reveal:opacity-100 transition-opacity" : "",
        visuallyDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
        className ?? "",
      ].join(" ")}
      style={{ width, height: height ?? width, backgroundColor, color: textColor, ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}

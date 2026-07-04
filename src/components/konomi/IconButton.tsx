import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

// The Tailwind group name backing hover-reveal — a closed set of literal
// strings, not an arbitrary one: Tailwind's scanner needs `group/name` and
// `group-hover/name:` to appear as complete static text to generate CSS for
// them, so a template-interpolated group name would be invisible to it
// (same constraint "Runtime-computed dimensions" documents for arbitrary-
// value classes elsewhere — see DESIGN_SYSTEM.md). Two variants exist
// because ScrollFadeArea's own root always carries one of these group
// classes, and one caller (TagScrollArea) nests its ScrollFadeArea inside
// another (the results carousel's) — sharing one name there meant hovering
// anywhere in the outer carousel satisfied `group-hover/name:hover` for
// every nested instance too, since CSS's descendant-combinator matching
// doesn't care which specific ancestor with that class is hovered
// (confirmed live as a real bug: hovering a card's title revealed every
// card's tag-scroll arrows at once). See ScrollFadeArea.tsx's own comment
// for the full story.
export type RevealGroup = "reveal" | "reveal-nested";
const REVEAL_CLASSES: Record<RevealGroup, string> = {
  reveal: "opacity-0 group-hover/reveal:opacity-100 transition-opacity",
  "reveal-nested": "opacity-0 group-hover/reveal-nested:opacity-100 transition-opacity",
};

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
  // opacity-0, revealed via an ancestor carrying the matching group class —
  // see RevealGroup above for why this takes one of a closed set of named
  // groups rather than a plain boolean.
  revealOnHover?: RevealGroup;
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
// `revealOnHover` takes one of RevealGroup's two literal values, not an
// arbitrary group name — see RevealGroup's own comment above for why (a
// template-interpolated class name would be invisible to Tailwind's
// scanner) and why two variants exist at all rather than one shared name.
// Any caller using `revealOnHover` must ensure an ancestor carries the
// matching `group/<name>` class (ScrollFadeArea's own root always does).
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
        // pointer-events-auto: a button should always be directly
        // clickable regardless of what an ancestor's own pointer-events
        // value happens to be — this is inherited by default, so without
        // an explicit override here, a button rendered inside a
        // pointer-events-none ancestor (e.g. ScrollFadeArea's structural
        // wrapper divs, when disableWrapperPointerEvents is set — see that
        // component's own comment) would silently stop receiving clicks
        // too, purely as a side effect of layout plumbing that has nothing
        // to do with this button's own intended behavior.
        "pointer-events-auto flex-none items-center justify-center p-0",
        display,
        BORDER_CLASSES[border],
        "border-[var(--ink)]",
        shape === "circle" ? "rounded-full" : "",
        shadow ? "shadow-[var(--elev-1)]" : "",
        revealOnHover ? REVEAL_CLASSES[revealOnHover] : "",
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

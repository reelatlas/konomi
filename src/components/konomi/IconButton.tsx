import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import type { ActionButtonSize } from "./ActionButton";

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

// Mirrors ActionButton's own md/sm names exactly (imported, not
// redeclared) — the whole point is that a mixer icon button and a mixer
// text button share one size vocabulary, and a ResultCard icon button
// shares the other, rather than icon buttons inventing a parallel scheme
// that happens to use different words for the same two scales. Values are
// each context's real rendered size, measured live: 44.5px matches
// ActionButton's own md height exactly (Random ×3/Clear ✕/Done ✓/RECOMMEND
// in MixerBar); 30px is ResultCard's own lock/swap buttons' pre-existing
// size, unchanged by this scale's introduction — sm exists to *name* that
// value, not to move it.
// md references the shared --control-h-md token (globals.css) so this box, the
// text-button md box (ActionButton), TagSlot, and RecommendButton's icon-only
// form all resolve to one whole/even value — see AGENTS.md whole-pixel-geometry.
const SIZE_PX: Record<ActionButtonSize, number | string> = {
  md: "var(--control-h-md)",
  sm: "var(--control-h-sm)",
};

// `size` and `width`/`height` are mutually exclusive, not just "size wins
// if both given" — ScrollFadeArea's scroll arrows (18×16 default, 36×36 on
// the results carousel) are a genuinely different, per-instance, often
// non-square dimension unrelated to the ActionButtonSize scale, so that
// caller keeps the raw width/height escape hatch; every action-button-style
// caller (ResultCard, MixerBar) uses `size` instead so the pixel value
// itself only ever lives in SIZE_PX, not copy-pasted at each call site.
type IconButtonSizeProps = { size: ActionButtonSize; width?: undefined; height?: undefined } | { size?: undefined; width: number; height?: number };

type IconButtonBaseProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style" | "disabled"> & {
  style?: CSSProperties;
  shape?: "circle" | "square";
  // "base" (border-base, 2.5px) added alongside the existing two — needed
  // so a size="md" icon button sitting next to Random ×3/Clear ✕ (both
  // border-base) reads as the same visual weight, not just the same
  // height. size="sm" (ResultCard) keeps the pre-existing "thin" default,
  // unchanged. "none" (border-0) is for callers that want just the bare
  // glyph — no border, and paired with backgroundColor="transparent" and
  // the default shadow={false}, no shadow or fill either (MixerBar's
  // resize-handle 50%/100%/reset buttons).
  border?: "hair" | "thin" | "base" | "none";
  // boolean keeps every existing caller (ResultCard's `shadow`,
  // ScrollFadeArea's `shadow={arrowShadow}`) working unchanged — `true`
  // still means exactly what it always did (elev-1). "elev-2" is the one
  // new option, needed so size="md" can match ActionButton's own md/sm
  // shadow (elev-2), which is stronger than IconButton's old boolean-only
  // elev-1 default. size="sm" (ResultCard) keeps passing plain `shadow`
  // (elev-1), unchanged.
  shadow?: boolean | "elev-1" | "elev-2";
  backgroundColor?: string;
  textColor?: string;
  // Defaults to var(--ink) — every existing caller relied on this being
  // hardcoded (it used to be a literal class, not a prop), so the default
  // preserves that exactly. Added as an inline style, not a className
  // override, for the same reason backgroundColor/textColor already are:
  // an appended className with its own border-color utility would sit
  // alongside this component's own hardcoded one in the same joined
  // string, and Tailwind doesn't order generated classes by source
  // position (see this file's own `display` prop comment for the
  // identical constraint) — there'd be no guaranteed winner.
  borderColor?: string;
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
  // Defaults to "cursor-pointer". A dedicated prop, not just a className the
  // caller appends, for the exact same reason `display` is (see above):
  // cursor-* are all unconditional cursor utilities, Tailwind doesn't order
  // generated classes by source position, so a `cursor-grab` passed via
  // className would sit alongside this component's own hardcoded
  // `cursor-pointer` with no guaranteed winner (confirmed live — it lost).
  // Replacing the single token here guarantees only one resting cursor
  // utility is ever emitted. MixerBar's resize grip uses this to read as a
  // grabbable handle ("cursor-grab active:cursor-grabbing") like the tags.
  cursor?: string;
  className?: string;
  children: ReactNode;
};

type IconButtonProps = IconButtonBaseProps & IconButtonSizeProps;

// Consolidates three previously hand-rolled icon buttons (ResultCard's
// lock/swap, ScrollFadeArea's scroll arrows, the results carousel's arrows)
// that shared the same underlying shape (a small bordered, square-or-round
// button wrapping one glyph/icon) but each duplicated the border/shadow/
// size treatment with small variations — see DESIGN_SYSTEM.md for the full
// inventory this was built from.
//
// `revealOnHover` takes one of RevealGroup's two literal values, not an
// arbitrary group name — see RevealGroup's own comment above for why (a
// template-interpolated group name would be invisible to Tailwind's
// scanner) and why two variants exist at all rather than one shared name.
// Any caller using `revealOnHover` must ensure an ancestor carries the
// matching `group/<name>` class (ScrollFadeArea's own root always does).
// Complete literal class strings, not a template-interpolated
// `border-[length:var(--border-${border})]` — Tailwind's scanner needs the
// full class as static source text to generate it; a runtime-interpolated
// version is invisible to it and would silently never make it into the
// compiled CSS. Same constraint `revealOnHover`'s doc comment above
// describes for group names.
const BORDER_CLASSES: Record<"hair" | "thin" | "base" | "none", string> = {
  hair: "border-[length:var(--border-hair)]",
  thin: "border-[length:var(--border-thin)]",
  base: "border-[length:var(--border-base)]",
  none: "border-0",
};

export function IconButton({
  size,
  width,
  height,
  style,
  shape = "square",
  border = "thin",
  shadow = false,
  backgroundColor = "var(--surface)",
  textColor = "var(--ink)",
  borderColor = "var(--ink)",
  revealOnHover,
  visuallyDisabled,
  display = "inline-flex",
  cursor = "cursor-pointer",
  className,
  children,
  ...rest
}: IconButtonProps) {
  const resolvedWidth = size ? SIZE_PX[size] : width;
  const resolvedHeight = size ? SIZE_PX[size] : (height ?? width);
  const shadowClass = shadow === "elev-2" ? "shadow-[var(--elev-2)]" : shadow ? "shadow-[var(--elev-1)]" : "";

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
        // focus-ring-inset: the app's one keyboard-focus regime — see
        // ActionButton's identical note.
        "focus-ring-inset pointer-events-auto flex-none items-center justify-center p-0",
        display,
        BORDER_CLASSES[border],
        shape === "circle" ? "rounded-full" : "",
        shadowClass,
        revealOnHover ? REVEAL_CLASSES[revealOnHover] : "",
        visuallyDisabled ? "opacity-40 cursor-not-allowed" : cursor,
        className ?? "",
      ].join(" ")}
      style={{ width: resolvedWidth, height: resolvedHeight, backgroundColor, color: textColor, borderColor, ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}

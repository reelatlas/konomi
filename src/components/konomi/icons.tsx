interface IconProps {
  className?: string;
}

export function LockClosedIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
    </svg>
  );
}

export function LockOpenIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7.5a4 4 0 0 1 7-2.5" />
    </svg>
  );
}

export function DiceIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinejoin="round"
    >
      <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
      <circle cx="8.5" cy="8.5" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="15.5" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Two arrows side by side, pointing opposite directions — up on the left,
// down on the right — the sort/reorder glyph.
export function SortIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 18V6" />
      <path d="M3.5 9.5L7 6l3.5 3.5" />
      <path d="M17 6v12" />
      <path d="M20.5 14.5L17 18l-3.5-3.5" />
    </svg>
  );
}

// "≥" — a ">" chevron plus an underline. Paired with TagIcon (separately,
// not combined into one glyph) in MixerBar's MIN MATCH label:
// label text, then TagIcon, then this — reading as "match ≥ N tags".
export function GreaterEqualIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="13"
      height="17"
      viewBox="0 0 14 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 3L9 8L2 13" />
      <path d="M2 17H9" />
    </svg>
  );
}

// A rotated label/price-tag silhouette with a small hole — standard tag glyph.
export function TagIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11.5 3.5H5A1.5 1.5 0 0 0 3.5 5v6.5a1.5 1.5 0 0 0 .44 1.06l8.5 8.5a1.5 1.5 0 0 0 2.12 0l6.5-6.5a1.5 1.5 0 0 0 0-2.12l-8.5-8.5a1.5 1.5 0 0 0-1.06-.44Z" />
      <circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Straight from Tabler's own layout-grid-add — used as-is. MixerBar's Tag
// Pool button (opens the tag pool/grid of tags to pick from) went through
// a few earlier glyphs first (a hand-drawn double-tag, Lucide's tags icon)
// before landing here; "add a cell to a grid layout" reads as a cleaner
// match for "open the pool" than any tag-shaped glyph did.
export function TagPoolIcon({ className }: IconProps) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4" />
      <path d="M14 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4" />
      <path d="M4 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4" />
      <path d="M14 17h6m-3 -3v6" />
    </svg>
  );
}

// A plain up arrow spanning the icon's full height (tail at y=20, tip at
// y=4) — MixerBar's edit-mode "resize to 100%" button, where 100% means
// the pool panel's own max-resize ceiling (poolPanelMaxHeight), not the
// raw viewport.
export function ArrowUpIcon({ className }: IconProps) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20V4" />
      <path d="M6 10l6-6 6 6" />
    </svg>
  );
}

// The "resize to 50%" companion to ArrowUpIcon above — same tail start
// (y=20) and same chevron shape, but the whole arrow only reaches the
// icon's own vertical midpoint (tip at y=12, half of ArrowUpIcon's y=4)
// instead of its top — the arrow itself visually stops at "halfway up,"
// rather than being a differently-styled glyph paired by convention alone.
export function ArrowUpHalfIcon({ className }: IconProps) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20V12" />
      <path d="M6 17l6-6 6 6" />
    </svg>
  );
}

// Two rows of three dots — the standard "grip" drag affordance, oriented
// for a row that drags vertically (the dots themselves read as a horizontal
// bar, hence "Horizontal"; c.f. Lucide's grip-horizontal). Replaces a plain
// 1px line in MixerBar's resize-handle row — a more legible "this is
// draggable" signal now that the row also carries the Tag Density/Sort
// filters, so the drag target itself needed to read as its own affordance
// rather than blend in.
export function GripHorizontalIcon({ className }: IconProps) {
  return (
    <svg className={className} width="16" height="8" viewBox="0 0 16 8" fill="currentColor">
      <circle cx="2" cy="2" r="1.3" />
      <circle cx="8" cy="2" r="1.3" />
      <circle cx="14" cy="2" r="1.3" />
      <circle cx="2" cy="6" r="1.3" />
      <circle cx="8" cy="6" r="1.3" />
      <circle cx="14" cy="6" r="1.3" />
    </svg>
  );
}

// A full down arrow — the exact vertical mirror of ArrowUpIcon (same tail-
// to-tip line, chevron reflected to point down instead of up). MixerBar's
// "reset pool panel to default height" button, replacing an earlier
// circular-arrow reset glyph — reads as "opposite of the 100% up arrow"
// (down to the floor) rather than an unrelated restore icon.
export function ArrowDownIcon({ className }: IconProps) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4V20" />
      <path d="M6 14l6 6 6-6" />
    </svg>
  );
}

// A tilted eraser block with a diagonal two-tone split and a baseline —
// standard "clear/erase" glyph.
export function EraserIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.5 20H20" />
      <path d="M4.6 15.4 13.8 6.2a2 2 0 0 1 2.83 0l3.17 3.17a2 2 0 0 1 0 2.83L11 21H8Z" />
      <path d="M16 12.5 10.5 7" />
    </svg>
  );
}

// A simple checkmark — "confirm/done" glyph.
export function CheckIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12.5 9.5 18 20 6.5" />
    </svg>
  );
}

// A solid filled triangle (play-button shape), not a thin chevron outline —
// RecommendButton's own icon-only fallback below the width where
// "RECOMMEND ▸" no longer fits alongside the rest of MixerBar's controls
// row on one line (see that component's own comment). Filled rather than
// stroked specifically to match the weight of the "▸" glyph it replaces —
// a thin 2-line chevron was tried first and read as visually thinner/
// weaker than the bold triangle it's standing in for.
export function ArrowRightFilledIcon({ className }: IconProps) {
  return (
    <svg className={className} width="15" height="15" viewBox="0 0 24 24">
      <path d="M7 4v16l14-8Z" fill="currentColor" />
    </svg>
  );
}

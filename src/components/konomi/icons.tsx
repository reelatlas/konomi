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
// not combined into one glyph) in MixerSection's MIN TAG MATCH label:
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

// A circular arrow — reset/restore glyph.
export function ResetIcon({ className }: IconProps) {
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
      <path d="M4 12a8 8 0 1 1 2.34 5.66" />
      <path d="M4 20v-6h6" />
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

// Two overlapping tag silhouettes — the plural/stacked companion to
// TagIcon above, used where the action is "open the whole pool of tags"
// rather than "this one tag" (MixerBar's Tag Pool button sits in the same
// bar as TagIcon's own "Min Tag Match"/"Tag Density" labels, so a visibly
// distinct glyph matters there). The back tag skips the hole/circle detail
// (kept only on the front one) so the pair doesn't read as visually busy
// at icon size.
export function TagsIcon({ className }: IconProps) {
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
      <path d="M14.5 2.5H9a1.2 1.2 0 0 0-.85.35L2.85 8.15a1.2 1.2 0 0 0 0 1.7l6.8 6.8a1.2 1.2 0 0 0 1.7 0l5.3-5.3a1.2 1.2 0 0 0 .35-.85V5Z" opacity={0.55} />
      <path d="M19.5 7.5H14a1.2 1.2 0 0 0-.85.35l-5.3 5.3a1.2 1.2 0 0 0 0 1.7l6.8 6.8a1.2 1.2 0 0 0 1.7 0l5.3-5.3a1.2 1.2 0 0 0 .35-.85V10Z" />
      <circle cx="17" cy="13" r="1.1" fill="currentColor" stroke="none" />
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

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

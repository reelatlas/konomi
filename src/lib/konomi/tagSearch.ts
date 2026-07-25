import type { TagInfo } from "./types";

// Pure matching logic for the tag-pool search ("search prunes the nav" —
// see DESIGN_SYSTEM.md "Tag pool search"). Kept side-free like tagPool.ts:
// nothing here knows about sections or domains; TagPoolBody owns how
// scores drive the nav.
//
// Score ladder (higher wins; 0 = no match):
//   3 exact        — the query IS the tag
//   2 word-prefix  — some word of the tag starts with the query
//                    ("vil" → "denis villeneuve"; "man" → "man on fire")
//   1 substring    — the query appears anywhere ("man" → "mank", "batman")
// Word-prefix outranking substring is what keeps a short query's obvious
// target above its accidental containments. No fuzzy/typo tolerance in v1
// (user-ruled 2026-07-25) — the vocabulary is finite and visible, so a
// near-miss shows its correction in the still-lit tabs rather than needing
// edit-distance guesswork.

export function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase();
}

// Tag names are lowercase throughout the pool by convention (DESIGN_SYSTEM
// "Tags render lowercase everywhere") — lowercased here anyway so a future
// cased name can't silently break matching.
export function matchScore(tagName: string, normQuery: string): 0 | 1 | 2 | 3 {
  if (!normQuery) return 0;
  const name = tagName.toLowerCase();
  if (name === normQuery) return 3;
  const idx = name.indexOf(normQuery);
  if (idx === -1) return 0;
  // Word-prefix: match at the start, or right after a non-alphanumeric
  // boundary ("c.k." splits at the dots; "spider-man" at the hyphen).
  if (idx === 0 || /[^a-z0-9]/.test(name[idx - 1])) return 2;
  return 1;
}

export function filterByQuery(tags: TagInfo[], normQuery: string): TagInfo[] {
  if (!normQuery) return tags;
  return tags.filter((t) => matchScore(t.name, normQuery) > 0);
}

// Best (max) score across a tag list — 0 when nothing matches. Drives the
// hop-target rule in TagPoolBody: exact (3) > word-prefix (2) > substring
// (1), ties broken by nav order there, never by match count.
export function bestScore(tags: TagInfo[], normQuery: string): number {
  let best = 0;
  for (const t of tags) {
    const s = matchScore(t.name, normQuery);
    if (s > best) best = s;
    if (best === 3) break;
  }
  return best;
}

import type { ResultEntry, Series } from "./types";

export function scoreSeries(series: Series, selectedTags: string[]): number {
  return selectedTags.filter((t) => series.tags.includes(t) || series.genres.includes(t)).length;
}

// Candidate pool = every series matching AT LEAST `min` of the selected tags.
// `min` is a quality FLOOR, not an exact count: min 1 lets through 1-3
// matches, min 2 lets through 2-3, min 3 only full matches. Within the
// qualifying set we shuffle randomly (not best-first) so the floor's effect
// is visible and picks feel like fresh recommendations on every roll.
export function scorePool(
  series: Series[],
  selectedTags: string[],
  min: number,
  excludeTitles: Set<string>,
): ResultEntry[] {
  return series
    .filter((s) => !excludeTitles.has(s.title) && scoreSeries(s, selectedTags) >= min)
    .map((s) => ({ series: s, r: Math.random() }))
    .sort((a, b) => a.r - b.r)
    .map((x) => ({ series: x.series }));
}

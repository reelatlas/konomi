import type { Series, TagInfo } from "../types";

// A tiny hand-built catalog with known memberships, so every test can
// state exactly which titles qualify for a mix. Ids follow THE IDENTITY
// CONTRACT (types.ts): opaque, provider-scoped, never display names.
export const T = {
  action: "anilist-genre:Action",
  drama: "anilist-genre:Drama",
  mecha: "anilist-tag:1",
  school: "anilist-tag:2",
  space: "anilist-tag:3",
  rare: "anilist-tag:4",
} as const;

export const tags: TagInfo[] = [
  { id: T.action, name: "Action", category: null, seriesCount: 3, avgRank: 100, isGenre: true },
  { id: T.drama, name: "Drama", category: null, seriesCount: 2, avgRank: 100, isGenre: true },
  { id: T.mecha, name: "Mecha", category: "Theme-Sci-Fi-Mecha", seriesCount: 2, avgRank: 80, isGenre: false },
  { id: T.school, name: "School", category: "Setting-Scene", seriesCount: 2, avgRank: 75, isGenre: false },
  { id: T.space, name: "Space", category: "Setting-Universe", seriesCount: 1, avgRank: 50, isGenre: false },
  { id: T.rare, name: "Rare", category: "Theme-Other", seriesCount: 1, avgRank: 20, isGenre: false },
];

export function series(id: string, title: string, memberships: string[], extra: Partial<Series> = {}): Series {
  return {
    id,
    title,
    year: 2000,
    eps: 12,
    tags: memberships,
    coverImageUrl: null,
    genres: [],
    averageScore: null,
    description: null,
    streamingServices: [],
    ...extra,
  };
}

// Memberships:
//   a: Action, Mecha, Space      b: Action, Mecha, School
//   c: Action, Drama, School     d: Drama, Rare
export const catalog: Series[] = [
  series("anilist:1", "A", [T.action, T.mecha, T.space]),
  series("anilist:2", "B", [T.action, T.mecha, T.school]),
  series("anilist:3", "C", [T.action, T.drama, T.school]),
  series("anilist:4", "D", [T.drama, T.rare]),
];

import type { Series } from "./types";

export const ALL_TAGS = [
  "Action",
  "Romance",
  "Mecha",
  "Isekai",
  "Slice of Life",
  "Comedy",
  "Dark",
  "Supernatural",
  "Sports",
  "Psychological",
  "Magic",
  "Post-Apocalyptic",
  "School",
  "Adventure",
  "Horror",
  "Sci-Fi",
  "Fantasy",
  "Drama",
  "Music",
  "Revenge",
  "Found Family",
  "Time Travel",
  "Cyberpunk",
  "Mystery",
] as const;

export const SERIES: Series[] = [
  { title: "Neon Hollow", year: 2021, eps: 24, tags: ["Cyberpunk", "Action", "Psychological", "Sci-Fi", "Revenge"] },
  { title: "Petal Drift", year: 2019, eps: 12, tags: ["Slice of Life", "Romance", "School", "Music", "Drama"] },
  { title: "Iron Vesper", year: 2022, eps: 26, tags: ["Mecha", "Sci-Fi", "Action", "Post-Apocalyptic", "Drama"] },
  { title: "Gloomtide", year: 2020, eps: 13, tags: ["Dark", "Supernatural", "Horror", "Mystery", "Psychological"] },
  { title: "Sundae Club", year: 2018, eps: 24, tags: ["Comedy", "Slice of Life", "School", "Romance", "Found Family"] },
  { title: "Wyrmgate", year: 2023, eps: 25, tags: ["Isekai", "Fantasy", "Adventure", "Magic", "Action"] },
  { title: "Last Inning", year: 2017, eps: 38, tags: ["Sports", "Drama", "School", "Found Family", "Comedy"] },
  { title: "Violet Protocol", year: 2022, eps: 11, tags: ["Cyberpunk", "Mystery", "Psychological", "Sci-Fi", "Action"] },
  { title: "Echo Garden", year: 2021, eps: 12, tags: ["Supernatural", "Romance", "Drama", "Magic", "Slice of Life"] },
  { title: "Ashfall Saints", year: 2020, eps: 24, tags: ["Post-Apocalyptic", "Action", "Dark", "Found Family", "Adventure"] },
  { title: "Spellbound Cafe", year: 2019, eps: 13, tags: ["Magic", "Comedy", "Slice of Life", "Romance", "Fantasy"] },
  { title: "Zero Hour Replay", year: 2023, eps: 13, tags: ["Time Travel", "Psychological", "Sci-Fi", "Drama", "Mystery"] },
  { title: "Crimson Relay", year: 2018, eps: 25, tags: ["Sports", "Action", "School", "Drama", "Music"] },
  { title: "Hollowmind", year: 2021, eps: 12, tags: ["Horror", "Psychological", "Supernatural", "Dark", "Mystery"] },
  { title: "Star Peddler", year: 2016, eps: 50, tags: ["Adventure", "Sci-Fi", "Comedy", "Found Family", "Fantasy"] },
  { title: "Moonlit Encore", year: 2022, eps: 12, tags: ["Music", "Romance", "Drama", "Slice of Life", "Supernatural"] },
  { title: "Ronin Circuit", year: 2023, eps: 12, tags: ["Action", "Cyberpunk", "Revenge", "Sci-Fi", "Dark"] },
  { title: "Glass Empire", year: 2020, eps: 24, tags: ["Isekai", "Fantasy", "Magic", "Drama", "Adventure"] },
  { title: "Daydream Unit", year: 2019, eps: 13, tags: ["Mecha", "School", "Comedy", "Sci-Fi", "Found Family"] },
  { title: "Bittersweet 16", year: 2018, eps: 12, tags: ["Romance", "Comedy", "School", "Slice of Life", "Music"] },
  // The 20 series above leave several tags (Time Travel, Sports, Mecha,
  // Isekai, Horror, Post-Apocalyptic, Revenge) matching only 1-2 titles —
  // easy to exhaust the whole dataset with a single tag pick. These add
  // more coverage for those without changing ALL_TAGS.
  { title: "Static Horizon", year: 2022, eps: 24, tags: ["Time Travel", "Sci-Fi", "Mystery", "Drama", "Psychological"] },
  { title: "Vermilion Drift", year: 2019, eps: 13, tags: ["Time Travel", "Romance", "Drama", "Found Family", "Fantasy"] },
  { title: "Loop Requiem", year: 2023, eps: 12, tags: ["Time Travel", "Revenge", "Psychological", "Dark", "Mystery"] },
  { title: "Iron Choir", year: 2021, eps: 26, tags: ["Mecha", "Action", "Drama", "Found Family", "Music"] },
  { title: "Rust Vanguard", year: 2024, eps: 24, tags: ["Mecha", "Post-Apocalyptic", "Action", "Sci-Fi", "Revenge"] },
  { title: "Last Harvest", year: 2020, eps: 13, tags: ["Post-Apocalyptic", "Horror", "Dark", "Adventure", "Found Family"] },
  { title: "Midnight Choir", year: 2022, eps: 12, tags: ["Horror", "Supernatural", "Mystery", "Psychological", "Music"] },
  { title: "Wraithlight", year: 2018, eps: 24, tags: ["Horror", "Dark", "Supernatural", "Isekai", "Magic"] },
  { title: "Otherworld Express", year: 2023, eps: 13, tags: ["Isekai", "Adventure", "Comedy", "Fantasy", "Found Family"] },
  { title: "Grand Slam Generation", year: 2019, eps: 25, tags: ["Sports", "School", "Comedy", "Found Family", "Drama"] },
  { title: "Neon Foul Line", year: 2024, eps: 12, tags: ["Sports", "Cyberpunk", "Action", "Drama", "Revenge"] },
  { title: "Ghost Circuit Rally", year: 2021, eps: 24, tags: ["Cyberpunk", "Revenge", "Action", "Sci-Fi", "Mystery"] },
];

export const PLATFORMS = ["Crunchyroll", "Netflix", "HIDIVE", "Hulu", "Prime Video", "Max", "Disney+"] as const;

export const DEFAULT_RESULT_COUNT = 5;
export const DEFAULT_ACCENT: "primary" | "secondary" = "secondary";
export const SHOW_HALFTONE = true;
export const SLOT_COUNT = 3;

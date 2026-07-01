// Permanent mock data — there's no real streaming-availability data source
// (the approved Supabase schema has no platforms table), so this stays
// hardcoded regardless of the AniList/Supabase-backed catalog. Feeds
// streamsFor() in scoring.ts.
export const PLATFORMS = ["Crunchyroll", "Netflix", "HIDIVE", "Hulu", "Prime Video", "Max", "Disney+"] as const;

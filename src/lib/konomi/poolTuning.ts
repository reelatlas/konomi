// Timing for the remote pool prefetch (KonomiApp → /api/pool), same
// named-constant convention as cardAnimTuning.ts.
//
// Debounce between the pool key changing (a tag toggled, MIN MATCH moved,
// a roll changing what is on screen) and the request going out. Long
// enough to coalesce a burst (Random ×3 writes three slots in one
// dispatch, but a user tapping chips in quick succession does not), short
// enough that the fetch is usually back before the hand reaches RECOMMEND
// — the button is disabled only for whatever is left of the round trip.
export const POOL_PREFETCH_DEBOUNCE_MS = 150;

import { animeDomain } from "./animeDomain";
import type { Domain } from "./domain";

// The registry of live sides. `filmDomain` joins here when the film catalog
// gets its UI (Phase 2) — DomainKey widens automatically, and every
// `side: DomainKey` prop starts accepting "film" with no other type edits.
//
// A registry looked up by string key (rather than passing the Domain object
// itself as a prop) is load-bearing, not style: a Domain holds functions,
// and a server component (each side's page.tsx) can only pass serializable
// props to a client component — so routes pass the key, and KonomiApp
// resolves it client-side here.
export const DOMAINS = {
  anime: animeDomain,
} satisfies Record<string, Domain>;

export type DomainKey = keyof typeof DOMAINS;

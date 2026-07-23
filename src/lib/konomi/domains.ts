import { animeDomain } from "./animeDomain";
import type { Domain } from "./domain";
import { filmDomain } from "./filmDomain";

// The registry of live sides.
//
// A registry looked up by string key (rather than passing the Domain object
// itself as a prop) is load-bearing, not style: a Domain holds functions,
// and a server component (each side's page.tsx) can only pass serializable
// props to a client component — so routes pass the key, and KonomiApp
// resolves it client-side here.
export const DOMAINS = {
  anime: animeDomain,
  film: filmDomain,
} satisfies Record<string, Domain>;

export type DomainKey = keyof typeof DOMAINS;

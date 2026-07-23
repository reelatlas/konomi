"use client";

import { createContext, useContext } from "react";
import type { Domain } from "@/lib/konomi/domain";

// The active side's Domain, provided once by KonomiApp for its whole tree.
// Context rather than prop-threading — the consumers sit deep and scattered
// (LevelSelector is four levels down via ResultsHeader → ResultsFilterButton
// → FilterControls; ResultCard is inside RecommendationsBody's carousel;
// TagPoolBody is inside MixerBar), and every intermediate component would
// otherwise carry a pass-through prop it has no use for. The value is
// render-constant per mounted app (a route change to the other side mounts
// a fresh KonomiApp), so there's no re-render-cascade concern.
const DomainContext = createContext<Domain | null>(null);

export const DomainProvider = DomainContext.Provider;

// Throws rather than defaulting to a side — a missing provider is a wiring
// mistake worth failing loudly on, not something to paper over with anime.
export function useDomain(): Domain {
  const domain = useContext(DomainContext);
  if (!domain) throw new Error("useDomain() called outside DomainProvider — wrap the tree in KonomiApp.");
  return domain;
}

"use client";

import { useEffect, useState } from "react";
import { scrollTuning } from "@/lib/konomi/scrollTuning";

// TEMPORARY — on-screen debug panel for live-tuning the wheel/touch scroll
// forwarders' snap-ease and fling feel on a real device, without a
// commit-per-value grind. Delete this whole file, its mount point in
// KonomiApp.tsx, and src/lib/konomi/scrollTuning.ts once the right values
// are found and baked back into plain constants in ScrollFadeArea.tsx/
// ResultCard.tsx.
//
// Gated on a URL query param (?scrollDebug=1), not NODE_ENV — this needs
// to show up on the actual deployed site (konomimix.com) being tested on a
// real phone, not just local dev. Checked client-side only (this file is
// "use client"), defaulting to hidden, so it never appears for a normal
// visitor who doesn't know to add the param.
const QUERY_FLAG = "scrollDebug";

interface SliderConfig {
  key: keyof typeof scrollTuning;
  label: string;
  min: number;
  max: number;
  step: number;
}

const SLIDERS: SliderConfig[] = [
  { key: "snapEaseDurationMs", label: "Snap ease duration (ms)", min: 0, max: 900, step: 10 },
  { key: "flingFriction", label: "Fling friction", min: 0.25, max: 1.5, step: 0.01 },
  { key: "minFlingVelocity", label: "Min fling velocity (px/ms)", min: 0, max: 1, step: 0.01 },
];

export function ScrollTuningPanel() {
  const [visible, setVisible] = useState(false);
  // Local state mirrors scrollTuning purely to drive the sliders'
  // controlled `value` — the actual live values the forwarders read live
  // in scrollTuning itself (a plain mutable object, not React state),
  // updated directly on each slider's onChange.
  const [values, setValues] = useState(() => ({ ...scrollTuning }));

  useEffect(() => {
    // window.location is only available client-side — this component is
    // SSR'd hidden (visible starts false, matching the server) and reveals
    // itself post-mount if the query flag is present. A one-off pattern
    // acceptable for this temporary, soon-deleted debug tool.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(new URLSearchParams(window.location.search).has(QUERY_FLAG));
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed top-[var(--space-md)] right-[var(--space-md)] z-[var(--z-overlay)] w-[260px] bg-[var(--surface)] border-[length:var(--border-base)] border-[var(--ink)] shadow-[var(--elev-3)] p-[var(--space-lg)] flex flex-col gap-[var(--space-md)] font-mono text-[length:var(--text-xs)] text-[var(--ink)]">
      <div className="font-bold uppercase tracking-[var(--tracking-md)]">Scroll tuning (temp)</div>
      {SLIDERS.map(({ key, label, min, max, step }) => (
        <label key={key} className="flex flex-col gap-[var(--space-xs)]">
          <span>
            {label}: {values[key]}
          </span>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={values[key]}
            onChange={(e) => {
              const next = parseFloat(e.target.value);
              scrollTuning[key] = next;
              setValues((v) => ({ ...v, [key]: next }));
            }}
          />
        </label>
      ))}
    </div>
  );
}

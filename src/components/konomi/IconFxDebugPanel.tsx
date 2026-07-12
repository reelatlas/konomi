"use client";

import { useEffect, useState } from "react";

// TEMPORARY A/B tool — lets us try the 6 icon-engagement treatments live on a
// real device (esp. Safari) to pick which one best camouflages the promote/
// demote AA re-raster blip on the MixerBar controls row. Each option just sets
// html[data-icon-fx="N"]; the actual treatments are plain CSS in globals.css
// (see the "ICON-ENGAGEMENT TREATMENTS" block). Trigger any of them by opening/
// closing the edit panel, snapping, or dragging the resize grip — the treatment
// plays over that animation window. Once a winner is chosen, bake that one CSS
// rule in unconditionally and delete this file + its mount in KonomiApp.
//
// Deliberately plain/utilitarian styling so it never gets mistaken for real UI.
const OPTIONS: { id: string; label: string }[] = [
  { id: "", label: "off" },
  { id: "1", label: "1 · press (shrink in)" },
  { id: "2", label: "2 · obscure (ink 50%)" },
  { id: "3", label: "3 · press (eased, hold-feel)" },
  { id: "4", label: "4 · hard ring" },
  { id: "5", label: "5 · row wash" },
  { id: "6", label: "6 · press (into base)" },
];

export function IconFxDebugPanel() {
  const [active, setActive] = useState("");
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (active) document.documentElement.dataset.iconFx = active;
    else delete document.documentElement.dataset.iconFx;
  }, [active]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-[var(--space-lg)] top-[var(--space-lg)] z-[var(--z-popover)] border-[length:var(--border-base)] border-[var(--ink)] bg-[var(--surface)] px-[var(--space-md)] py-[var(--space-sm)] font-mono text-[length:var(--text-2xs)] font-bold uppercase tracking-[var(--tracking-sm)] text-[var(--ink)] shadow-[var(--elev-2)] cursor-pointer"
      >
        icon fx
      </button>
    );
  }

  return (
    <div className="fixed left-[var(--space-lg)] top-[var(--space-lg)] z-[var(--z-popover)] w-[220px] border-[length:var(--border-base)] border-[var(--ink)] bg-[var(--surface)] font-mono text-[length:var(--text-2xs)] text-[var(--ink)] shadow-[var(--elev-4)]">
      <div className="flex items-center justify-between border-b-[length:var(--border-thin)] border-[var(--ink)] px-[var(--space-md)] py-[var(--space-sm)]">
        <span className="font-bold uppercase tracking-[var(--tracking-sm)]">icon fx</span>
        <button type="button" onClick={() => setOpen(false)} className="cursor-pointer px-[var(--space-xs)]" aria-label="Collapse icon fx panel">
          ✕
        </button>
      </div>
      <div className="flex flex-col p-[var(--space-sm)]">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setActive(o.id)}
            className={[
              "cursor-pointer text-left px-[var(--space-sm)] py-[var(--space-xs)] uppercase tracking-[var(--tracking-sm)]",
              active === o.id ? "bg-[var(--ink)] text-[var(--surface)]" : "hover:bg-[var(--fill)]",
            ].join(" ")}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="border-t-[length:var(--border-thin)] border-[var(--ink)] px-[var(--space-md)] py-[var(--space-sm)] text-[length:var(--text-3xs)] text-[var(--subtext)]">
        open/close the edit panel, snap, or drag the grip to see it play.
      </div>
    </div>
  );
}

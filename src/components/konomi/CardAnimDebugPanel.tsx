"use client";

import { CARD_ANIM_DEFAULTS, resetCardAnimTuning, setCardAnimTuning, useCardAnimTuning } from "./cardAnimTuning";

// Testing-only tool for retuning the result-card enter/exit animation
// (CARD_ANIM_DURATION_MS/STAGGER_MS/DISTANCE_PX/EASE_IN/EASE_OUT — see
// cardAnimTuning.ts) live, without a reload. Rendered from exactly one
// call site, gated by SHOW_CARD_ANIM_DEBUG (RecommendationsBody.tsx) — to
// remove this for production, flip that flag or delete this file plus its
// one render line; cardAnimTuning.ts works standalone with its own
// defaults either way, nothing else needs to change.
//
// Plain, unstyled-to-the-rest-of-the-app fixed panel — deliberately not
// built from this app's own ActionButton/IconButton/token vocabulary the
// way real UI is. This is scaffolding, not a shipped surface, so it
// doesn't need to match the design system; keeping it visually distinct
// (browser-default inputs, monospace) also makes it obvious at a glance
// that it isn't part of the actual product.
export function CardAnimDebugPanel() {
  const tuning = useCardAnimTuning();

  return (
    <div
      style={{
        position: "fixed",
        bottom: 12,
        right: 12,
        zIndex: 999999,
        background: "rgba(20,20,20,0.92)",
        color: "#fff",
        font: "11px/1.4 monospace",
        padding: "10px 12px",
        borderRadius: 6,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        width: 220,
      }}
    >
      <div style={{ fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        card anim debug
        <button
          type="button"
          onClick={() => resetCardAnimTuning()}
          style={{ font: "inherit", color: "#fff", background: "#333", border: "none", borderRadius: 3, padding: "2px 6px", cursor: "pointer" }}
        >
          reset
        </button>
      </div>

      <label style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
        duration (ms)
        <input
          type="number"
          value={tuning.durationMs}
          onChange={(e) => setCardAnimTuning({ durationMs: Number(e.target.value) })}
          style={{ width: 64 }}
        />
      </label>
      <label style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
        stagger (ms)
        <input
          type="number"
          value={tuning.staggerMs}
          onChange={(e) => setCardAnimTuning({ staggerMs: Number(e.target.value) })}
          style={{ width: 64 }}
        />
      </label>
      <label style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
        distance (px)
        <input
          type="number"
          value={tuning.distancePx}
          onChange={(e) => setCardAnimTuning({ distancePx: Number(e.target.value) })}
          style={{ width: 64 }}
        />
      </label>
      <label style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
        ease-out (enter)
        <input
          type="text"
          value={tuning.easeOut}
          onChange={(e) => setCardAnimTuning({ easeOut: e.target.value })}
          style={{ width: 120 }}
        />
      </label>
      <label style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
        ease-in (exit)
        <input
          type="text"
          value={tuning.easeIn}
          onChange={(e) => setCardAnimTuning({ easeIn: e.target.value })}
          style={{ width: 120 }}
        />
      </label>
      <div style={{ opacity: 0.6 }}>
        defaults: {CARD_ANIM_DEFAULTS.durationMs}/{CARD_ANIM_DEFAULTS.staggerMs}/{CARD_ANIM_DEFAULTS.distancePx}
      </div>
    </div>
  );
}
